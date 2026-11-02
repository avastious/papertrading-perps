/* Aureous browser engine.
 *
 * A JavaScript port of aureous/engine.py and aureous/server.py so the website can run
 * with no server: the page reads Hyperliquid's public info API directly and keeps the
 * paper account in the visitor's own browser (localStorage).
 *
 * Mechanics match the Python engine: cross margin, per-coin leverage, market orders
 * that sweep the live L2 book (max 5% from mark), GTC/ALO/IOC limits, reduce-only,
 * TP/SL on mark, taker/maker fees, hourly funding from real funding history, and
 * liquidation at maintenance margin = 1 / (2 x max leverage).
 */
(function (root) {
  "use strict";

  const HOUR_MS = 3600000, EPS = 1e-12, DEFAULT_LEVERAGE = 10, MAX_SLIPPAGE = 0.05;
  // Paper money, so any market can go up to 1000x, past Hyperliquid's own cap (market.max_leverage).
  // Above that cap, a position's maintenance margin is half its initial margin (1 / (2 x leverage)),
  // so liquidation comes when the move eats half the margin, just as at the cap.
  const MAX_LEVERAGE = 1000;
  const INTERVAL_SECS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400};
  // History caps keep a whole account small enough for browser storage and one cloud document.
  const MAX_TRADES = 2000, MAX_FUNDING = 2000, MAX_CURVE = 3000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Builder-deployed (HIP-3) markets to include alongside Hyperliquid's own list. Hyperliquid only
  // lists them when asked for their group ("dex") by name, and names them "<dex>:<ticker>".
  const EXTRA_MARKETS = {xyz: ["XYZ100"]};                  // trade.xyz: XYZ100 tracks the Nasdaq 100
  const MARKET_LABELS = {"xyz:XYZ100": "Nasdaq 100"};
  const displayName = name => String(name).replace(/^[a-z][a-z0-9]*:/, "");

  class PaperError extends Error {}
  class APIError extends Error {}

  // ------------------------------------------------------------ Hyperliquid client
  class HyperliquidClient {
    constructor(base = "https://api.hyperliquid.xyz", fetchFn = null) {
      this.url = base.replace(/\/$/, "") + "/info";
      this.fetch = fetchFn || ((...a) => root.fetch(...a));
    }
    async post(payload, attempts = 3) {
      let last = null;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const r = await this.fetch(this.url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)});
          if (r.status === 429) { last = new Error("rate limited (429)"); await sleep(1000 * (attempt + 1)); continue; }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.json();
        } catch (e) { last = e; await sleep(400 * (attempt + 1)); }
      }
      throw new APIError(`${payload.type} request failed: ${last && last.message}`);
    }
    // Hyperliquid's own markets plus the EXTRA_MARKETS above, as one [meta, ctxs] pair. If a builder
    // group can't be reached, its last good data is reused so open positions keep a price.
    async metaAndCtxs() {
      this.extra = this.extra || {};
      const groups = Object.entries(EXTRA_MARKETS).map(async ([dex, tickers]) => {
        try {
          const [meta, ctxs] = await this.post({type: "metaAndAssetCtxs", dex}, 1);   // one try: never slow the main list down
          const want = new Set(tickers.flatMap(t => [t, `${dex}:${t}`]));
          const u = [], c = [];
          meta.universe.forEach((info, i) => { if (want.has(info.name)) { u.push({...info, name: info.name.includes(":") ? info.name : `${dex}:${info.name}`}); c.push(ctxs[i] || {}); } });
          this.extra[dex] = [u, c];
        } catch {}
        return this.extra[dex] || [[], []];
      });
      const [[meta, ctxs], ...more] = await Promise.all([this.post({type: "metaAndAssetCtxs"}), ...groups]);
      const universe = meta.universe.filter(x => !String(x.name).includes(":")), all = ctxs.slice(0, universe.length);
      for (const [u, c] of more) { universe.push(...u); all.push(...c); }
      return [{...meta, universe}, all];
    }
    l2Book(coin) { return this.post({type: "l2Book", coin}); }
    fundingHistory(coin, startTime, endTime) {
      const p = {type: "fundingHistory", coin, startTime: Math.floor(startTime)};
      if (endTime != null) p.endTime = Math.floor(endTime);
      return this.post(p);
    }
    candles(coin, interval, startTime, endTime) {
      return this.post({type: "candleSnapshot", req: {coin, interval, startTime: Math.floor(startTime), endTime: Math.floor(endTime)}});
    }
  }

  // ------------------------------------------------------------------- helpers
  const sign = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
  function roundTo(x, d) { const f = Math.pow(10, d); return Math.round(x * f) / f; }
  function roundSize(sz, decimals) {
    const f = Math.pow(10, decimals);
    return sign(sz) * Math.floor(Math.abs(sz) * f + 1e-9) / f;
  }
  function roundPx(px, szDecimals) {
    if (px <= 0) return px;
    const maxDec = Math.max(0, 6 - szDecimals);
    const sigDec = 4 - Math.floor(Math.log10(px));
    return roundTo(px, Math.max(0, Math.min(maxDec, sigDec)));
  }
  function applyFill(size, entry, sz, px) {
    if (size === 0 || sign(size) === sign(sz)) {
      const n = size + sz;
      return [n, (Math.abs(size) * entry + Math.abs(sz) * px) / Math.abs(n), 0];
    }
    const closing = Math.min(Math.abs(sz), Math.abs(size));
    const realized = closing * (px - entry) * sign(size);
    const n = size + sz;
    if (Math.abs(n) < EPS) return [0, 0, realized];
    if (sign(n) === sign(size)) return [n, entry, realized];
    return [n, px, realized];
  }
  const g = (x, d = 6) => String(+Number(x).toPrecision(d));   // like Python's :g

  class Market {
    constructor(o) { Object.assign(this, o); }
    get mmr() { return 1 / (2 * this.max_leverage); }
    get change24h() { return this.prev_day_px ? this.mark / this.prev_day_px - 1 : 0; }
    get refPx() { return this.mid || this.mark; }
  }

  // ------------------------------------------------------------- the exchange
  class PaperExchange {
    constructor(client, opts = {}) {
      this.client = client;
      this.storage = opts.storage === undefined ? null : opts.storage;
      this.key = opts.key || "aureous.account";
      this.takerFee = opts.takerFee ?? 0.00045;
      this.makerFee = opts.makerFee ?? 0.00015;
      this.refreshMs = opts.refreshMs ?? 2500;
      this.now = opts.now || (() => Date.now());
      this.curveMs = opts.curveMs ?? 60000;        // how often to add a point to the equity curve
      // overCap: allow leverage past Hyperliquid's per-market cap, up to MAX_LEVERAGE (the site owner's switch)
      this.overCap = opts.overCap ?? true;
      this.markets = new Map();
      this.lookup = new Map();
      this.lastRefresh = 0;
      this.saveOk = !!this.storage;
      this.state = this.load() || this.newState(opts.startingBalance ?? 10000);
    }

    // ------------------------------------------------------------ state
    newState(balance) {
      const now = this.now();
      return {version: 1, created_ms: now, starting_balance: balance, balance, positions: {}, orders: [],
              leverage: {}, trades: [], funding_log: [], equity_curve: [], next_order_id: 1, last_funding_ms: now};
    }
    load() {
      try { const s = this.storage && this.storage.getItem(this.key); return s ? JSON.parse(s) : null; }
      catch { return null; }
    }
    save() {
      const st = this.state;
      if (st.trades.length > MAX_TRADES) st.trades.splice(0, st.trades.length - MAX_TRADES);
      if (st.funding_log.length > MAX_FUNDING) st.funding_log.splice(0, st.funding_log.length - MAX_FUNDING);
      if (!this.storage) return;
      try { this.storage.setItem(this.key, JSON.stringify(st)); this.saveOk = true; }
      catch { this.saveOk = false; }
    }
    reset(balance) { this.state = this.newState(balance || this.state.starting_balance); this.save(); }
    /** Switch to another account store (guest browser storage <-> signed-in cloud account).
     *  If the store is empty, start from `seed` (e.g. the guest account) or a fresh account. */
    attach(storage, seed = null) {
      this.storage = storage;
      this.saveOk = !!storage;
      const loaded = this.load();
      this.state = loaded || (seed ? JSON.parse(JSON.stringify(seed)) : this.newState(10000));
      if (!loaded) this.save();
      return !loaded;
    }
    hasActivity() { return this.state.trades.length > 0 || Object.keys(this.state.positions).length > 0 || this.state.orders.length > 0; }

    // ------------------------------------------------------ market data
    async refresh(force = false) {
      if (!force && this.markets.size && this.now() - this.lastRefresh < this.refreshMs) return;
      const [meta, ctxs] = await this.client.metaAndCtxs();
      const markets = new Map();
      meta.universe.forEach((info, i) => {
        const ctx = ctxs[i] || {};
        if (info.isDelisted) return;
        const mark = parseFloat(ctx.markPx || 0);
        if (!(mark > 0)) return;
        markets.set(info.name, new Market({
          name: info.name, sz_decimals: +info.szDecimals, max_leverage: +info.maxLeverage, mark,
          mid: ctx.midPx ? parseFloat(ctx.midPx) : null, oracle: parseFloat(ctx.oraclePx || mark),
          funding: parseFloat(ctx.funding || 0), open_interest: parseFloat(ctx.openInterest || 0),
          day_volume: parseFloat(ctx.dayNtlVlm || 0), prev_day_px: parseFloat(ctx.prevDayPx || 0),
        }));
      });
      this.markets = markets;
      this.lookup = new Map([...markets.keys()].map(k => [k.toLowerCase(), k]));
      this.lastRefresh = this.now();
    }
    market(coin) {
      const name = this.lookup.get(String(coin).toLowerCase());
      if (!name) throw new PaperError(`Unknown market '${coin}'.`);
      return this.markets.get(name);
    }
    async book(coin) {
      const raw = await this.client.l2Book(this.market(coin).name);
      return {bids: raw.levels[0].map(l => [+l.px, +l.sz]), asks: raw.levels[1].map(l => [+l.px, +l.sz])};
    }

    // ---------------------------------------------------------- account
    leverage(coin) {
      const m = this.market(coin);
      return Math.min(parseInt(this.state.leverage[m.name] ?? DEFAULT_LEVERAGE, 10), MAX_LEVERAGE);
    }
    maxLeverage(coin) { return this.overCap ? MAX_LEVERAGE : this.market(coin).max_leverage; }
    mmr(coin) { const m = this.market(coin); return Math.min(m.mmr, 1 / (2 * this.leverage(coin))); }
    upnl(coin) { const p = this.state.positions[coin]; return p ? p.size * (this.market(coin).mark - p.entry) : 0; }
    positionMargin(coin) { const p = this.state.positions[coin]; return p ? Math.abs(p.size) * this.market(coin).mark / this.leverage(coin) : 0; }
    equity() { return this.state.balance + Object.keys(this.state.positions).reduce((s, c) => s + this.upnl(c), 0); }
    marginUsed() { return Object.keys(this.state.positions).reduce((s, c) => s + this.positionMargin(c), 0); }
    maintenance() {
      return Object.entries(this.state.positions).reduce((s, [c, p]) => { const m = this.market(c); return s + Math.abs(p.size) * m.mark * this.mmr(c); }, 0);
    }
    orderMargin() {
      return this.state.orders.filter(o => o.type === "limit" && !o.reduce_only)
        .reduce((s, o) => s + o.sz * o.px / this.leverage(o.coin), 0);
    }
    available() { return this.equity() - this.marginUsed() - this.orderMargin(); }
    liqPrice(coin) {
      const p = this.state.positions[coin];
      if (!p) return null;
      const m = this.market(coin), s = p.size, e = p.entry;
      const mmr = this.mmr(coin), otherMaint = this.maintenance() - Math.abs(s) * m.mark * mmr;
      const e0 = this.equity() - this.upnl(coin) - otherMaint;
      const px = (s * e - e0) / (s * (1 - sign(s) * mmr));
      return px > 0 ? px : null;
    }

    // -------------------------------------------------------- execution
    async sweep(coin, sz, limitPx) {
      const {bids, asks} = await this.book(coin);
      const levels = sz > 0 ? asks : bids;
      let remaining = Math.abs(sz), filled = 0, cost = 0;
      for (const [px, lvl] of levels) {
        if ((sz > 0 && px > limitPx) || (sz < 0 && px < limitPx)) break;
        const take = Math.min(lvl, remaining);
        filled += take; cost += take * px; remaining -= take;
        if (remaining <= EPS) break;
      }
      return [filled, filled ? cost / filled : 0];
    }
    clampReduce(coin, sz) {
      const p = this.state.positions[coin];
      if (!p || sign(p.size) === sign(sz)) throw new PaperError(`Reduce-only order would not reduce your ${coin} position.`);
      return sign(sz) * Math.min(Math.abs(sz), Math.abs(p.size));
    }
    marginCheck(coin, sz, px, feeRate) {
      const m = this.market(coin), p = this.state.positions[coin];
      const [size0, entry0] = p ? [p.size, p.entry] : [0, 0];
      const [n, entry, realized] = applyFill(size0, entry0, sz, px);
      if (Math.abs(n) <= Math.abs(size0) + EPS && (Math.abs(n) < EPS || sign(n) === sign(size0))) return;
      const fee = Math.abs(sz) * px * feeRate;
      const eq = this.equity() - this.upnl(coin) + realized - fee + n * (m.mark - entry);
      const others = this.marginUsed() - this.positionMargin(coin);
      const im = others + Math.abs(n) * m.mark / this.leverage(coin);
      if (eq - im - this.orderMargin() < 0) {
        const impact = Math.abs(sz) * Math.abs(px - m.mark);
        throw new PaperError(`Insufficient margin: this needs $${fmt2(im - others)} at ${this.leverage(coin)}x` +
                             (fee + impact >= 0.01 * (im - others) ? ` plus $${fmt2(fee)} in fees` + (impact >= 0.01 ? ` and $${fmt2(impact)} of price impact (filling at ${g(px)} against a mark of ${g(m.mark)})` : "") : "") +
                             `. You have $${fmt2(this.available())} available.`);
      }
    }
    execute(coin, sz, px, feeRate, kind) {
      const m = this.market(coin), positions = this.state.positions, p = positions[coin];
      const [size0, entry0] = p ? [p.size, p.entry] : [0, 0];
      let [n, entry, realized] = applyFill(size0, entry0, sz, px);
      n = roundTo(n, m.sz_decimals);
      const fee = Math.abs(sz) * px * feeRate;
      this.state.balance += realized - fee;
      const now = this.now();
      if (Math.abs(n) < EPS) {
        delete positions[coin];
        this.state.orders = this.state.orders.filter(o => !(o.coin === coin && o.reduce_only));
      } else if (!p || sign(n) !== sign(size0)) {
        positions[coin] = {size: n, entry, opened_ms: now, realized: 0, funding: 0, fees: fee};
      } else {
        p.size = n; p.entry = entry; p.realized += realized; p.fees = (p.fees || 0) + fee;
      }
      const trade = {ts: now, coin, side: sz > 0 ? "buy" : "sell", sz: Math.abs(sz), px, fee, realized, kind, lev: this.leverage(coin)};
      this.state.trades.push(trade);
      return trade;
    }
    nextId() { return this.state.next_order_id++; }

    // ----------------------------------------------------------- orders
    async marketOrder(coin, sz, reduceOnly = false, slippage = MAX_SLIPPAGE, kind = "market") {
      await this.refresh();
      const m = this.market(coin); coin = m.name;
      sz = roundSize(sz, m.sz_decimals);
      if (sz === 0) throw new PaperError(`Size too small: ${coin} trades in steps of ${g(Math.pow(10, -m.sz_decimals))}.`);
      if (reduceOnly) sz = this.clampReduce(coin, sz);
      const limitPx = sz > 0 ? m.mark * (1 + slippage) : m.mark * (1 - slippage);
      let [filled, avg] = await this.sweep(coin, sz, limitPx);
      filled = roundSize(filled, m.sz_decimals);
      if (filled <= 0) throw new PaperError(`No liquidity within ${Math.round(slippage * 100)}% of mark.`);
      if (reduceOnly) { sz = this.clampReduce(coin, sz); filled = Math.min(filled, Math.abs(sz)); }  // position may have moved while we waited
      const signed = sign(sz) * filled;
      this.marginCheck(coin, signed, avg, this.takerFee);
      const t = this.execute(coin, signed, avg, this.takerFee, kind);
      t.requested = Math.abs(sz);
      t.slippage = (avg / m.mark - 1) * sign(sz);
      this.save();
      return t;
    }
    async limitOrder(coin, sz, px, tif = "Gtc", reduceOnly = false) {
      await this.refresh();
      const m = this.market(coin); coin = m.name;
      tif = tif.charAt(0).toUpperCase() + tif.slice(1).toLowerCase();
      if (!["Gtc", "Alo", "Ioc"].includes(tif)) throw new PaperError("Time in force must be gtc, alo (post-only) or ioc.");
      px = roundPx(px, m.sz_decimals);
      sz = roundSize(sz, m.sz_decimals);
      if (sz === 0 || !(px > 0)) throw new PaperError("Size and price must be positive.");
      if (reduceOnly) sz = this.clampReduce(coin, sz);
      const result = {fill: null, order: null};
      const {bids, asks} = await this.book(coin);
      const crosses = (sz > 0 && asks.length && px >= asks[0][0]) || (sz < 0 && bids.length && px <= bids[0][0]);
      if (crosses) {
        if (tif === "Alo") throw new PaperError("Post-only order would cross the book - rejected.");
        let [filled, avg] = await this.sweep(coin, sz, px);
        filled = roundSize(filled, m.sz_decimals);
        if (filled > 0) {
          this.marginCheck(coin, sign(sz) * filled, avg, this.takerFee);
          result.fill = this.execute(coin, sign(sz) * filled, avg, this.takerFee, "limit");
          sz = sign(sz) * roundTo(Math.abs(sz) - filled, m.sz_decimals);
        }
      }
      if (tif === "Ioc" || Math.abs(sz) < EPS) { this.save(); return result; }
      if (!reduceOnly) {
        const need = Math.abs(sz) * px / this.leverage(coin);
        if (need > this.available()) throw new PaperError(`Insufficient margin to rest order: needs $${fmt2(need)}, $${fmt2(this.available())} available.`);
      }
      const order = {id: this.nextId(), coin, type: "limit", side: sz > 0 ? "buy" : "sell", sz: Math.abs(sz), px,
                     tif, reduce_only: reduceOnly, ts: this.now()};
      this.state.orders.push(order);
      result.order = order;
      this.save();
      return result;
    }
    triggerOrder(coin, kind, triggerPx, sz = null) {
      const m = this.market(coin); coin = m.name;
      const p = this.state.positions[coin];
      if (!p) throw new PaperError(`No open ${coin} position to attach a ${kind.toUpperCase()} to.`);
      const long = p.size > 0;
      triggerPx = roundPx(triggerPx, m.sz_decimals);
      if (kind === "sl" && ((long && triggerPx >= m.mark) || (!long && triggerPx <= m.mark)))
        throw new PaperError(`Stop-loss for a ${long ? "long" : "short"} must be ${long ? "below" : "above"} mark (${g(m.mark)}).`);
      if (kind === "tp" && ((long && triggerPx <= m.mark) || (!long && triggerPx >= m.mark)))
        throw new PaperError(`Take-profit for a ${long ? "long" : "short"} must be ${long ? "above" : "below"} mark (${g(m.mark)}).`);
      if (sz != null) sz = Math.min(roundSize(Math.abs(sz), m.sz_decimals), Math.abs(p.size));
      const order = {id: this.nextId(), coin, type: kind, side: long ? "sell" : "buy", sz, trigger_px: triggerPx,
                     reduce_only: true, ts: this.now()};
      this.state.orders.push(order);
      this.save();
      return order;
    }
    cancel(target = "all") {
      const before = this.state.orders.length;
      if (target === "all") this.state.orders = [];
      else if (/^\d+$/.test(String(target))) this.state.orders = this.state.orders.filter(o => o.id !== +target);
      else { const name = this.market(target).name; this.state.orders = this.state.orders.filter(o => o.coin !== name); }
      this.save();
      return before - this.state.orders.length;
    }
    async close(coin, fraction = 1) {
      await this.refresh();
      const name = this.market(coin).name, p = this.state.positions[name];
      if (!p) throw new PaperError(`No open ${name} position.`);
      return this.marketOrder(name, -p.size * fraction, true, MAX_SLIPPAGE, "close");
    }
    setLeverage(coin, lev) {
      const m = this.market(coin);
      const cap = this.maxLeverage(coin);
      if (!(Number.isInteger(lev) && lev >= 1 && lev <= cap)) throw new PaperError(this.overCap ? `Leverage must be a whole number from 1 to ${cap}x.`
        : `${m.name} leverage must be 1-${cap}x. Leverage above Hyperliquid's limits is switched off on Aureous at the moment.`);
      const old = this.state.leverage[m.name];
      this.state.leverage[m.name] = lev;
      if (this.available() < 0) {
        if (old === undefined) delete this.state.leverage[m.name]; else this.state.leverage[m.name] = old;
        throw new PaperError("Not enough margin to lower leverage that far with your open position.");
      }
      this.save();
      return lev;
    }

    // ----------------------------------------------------------- the loop
    async update() {
      await this.refresh();
      const events = [];
      events.push(...await this.applyFunding());
      events.push(...await this.processTriggers());
      events.push(...this.processLimits());
      events.push(...this.checkLiquidation());
      this.recordEquity();
      this.save();
      return events;
    }
    async applyFunding() {
      const now = this.now(), last = this.state.last_funding_ms;
      if (Math.floor(now / HOUR_MS) === Math.floor(last / HOUR_MS)) return [];
      const events = [], pending = [];
      try {
        for (const [coin, p] of Object.entries(this.state.positions)) {
          const m = this.market(coin), start = Math.max(last, p.opened_ms);
          let total = 0, history;
          try { history = await this.client.fundingHistory(coin, start + 1, now); }
          catch (e) {
            if (!coin.includes(":")) throw e;
            // builder markets: if their history can't be read, use the current hourly rate for each hour passed
            history = [];
            for (let t = (Math.floor(start / HOUR_MS) + 1) * HOUR_MS; t <= now; t += HOUR_MS) history.push({time: t, fundingRate: m.funding});
          }
          for (const h of history) {
            const t = +h.time;
            if (t <= start || t > now) continue;
            const rate = parseFloat(h.fundingRate), pay = -p.size * m.oracle * rate;   // positive rate: longs pay
            total += pay;
            pending.push({ts: t, coin, rate, size: p.size, payment: pay});
          }
          if (total) events.push([coin, total]);
        }
      } catch (e) {
        return [`Funding update skipped (${e.message})`];   // don't advance the clock
      }
      for (const f of pending) { this.state.funding_log.push(f); this.state.balance += f.payment; this.state.positions[f.coin].funding += f.payment; }
      this.state.last_funding_ms = now;
      return events.map(([coin, total]) => `Funding ${coin}: ${total > 0 ? "received" : "paid"} $${Math.abs(total).toFixed(4)}`);
    }
    async processTriggers() {
      const events = [];
      for (const o of this.state.orders.filter(o => o.type === "sl" || o.type === "tp")) {
        if (!this.state.orders.includes(o)) continue;
        const m = this.market(o.coin), sell = o.side === "sell";
        const hit = o.type === "sl" ? (sell ? m.mark <= o.trigger_px : m.mark >= o.trigger_px)
                                    : (sell ? m.mark >= o.trigger_px : m.mark <= o.trigger_px);
        if (!hit) continue;
        this.state.orders = this.state.orders.filter(x => x !== o);
        const p = this.state.positions[o.coin];
        if (!p) continue;
        const sz = o.sz || Math.abs(p.size);
        try {
          const t = await this.marketOrder(o.coin, -sign(p.size) * sz, true, MAX_SLIPPAGE, o.type);
          events.push(`${o.type.toUpperCase()} #${o.id} triggered: ${t.side} ${g(t.sz)} ${t.coin} @ ${g(t.px)}  pnl $${fmt2(t.realized)}`);
        } catch (e) {
          if (!(e instanceof PaperError)) throw e;
          events.push(`${o.type.toUpperCase()} #${o.id} failed: ${e.message}`);
        }
      }
      return events;
    }
    processLimits() {
      const events = [];
      for (const o of this.state.orders.filter(o => o.type === "limit")) {
        if (!this.state.orders.includes(o)) continue;
        const m = this.market(o.coin), buy = o.side === "buy";
        if (!((buy && m.refPx <= o.px) || (!buy && m.refPx >= o.px))) continue;
        this.state.orders = this.state.orders.filter(x => x !== o);
        let sz = buy ? o.sz : -o.sz;
        try {
          if (o.reduce_only) sz = this.clampReduce(o.coin, sz);
          this.marginCheck(o.coin, sz, o.px, this.makerFee);
          const t = this.execute(o.coin, sz, o.px, this.makerFee, "limit");
          events.push(`Limit #${o.id} filled: ${t.side} ${g(t.sz)} ${t.coin} @ ${g(t.px)}`);
        } catch (e) {
          if (!(e instanceof PaperError)) throw e;
          events.push(`Limit #${o.id} cancelled: ${e.message}`);
        }
      }
      return events;
    }
    checkLiquidation() {
      if (!Object.keys(this.state.positions).length || this.equity() >= this.maintenance()) return [];
      const eq = this.equity(), mm = this.maintenance();
      for (const [coin, p] of Object.entries(this.state.positions)) this.execute(coin, -p.size, this.market(coin).mark, this.takerFee, "liquidation");
      this.state.orders = [];
      return [`LIQUIDATED: equity $${fmt2(eq)} fell below maintenance margin $${fmt2(mm)}. All positions closed at mark.`];
    }
    recordEquity() {
      const curve = this.state.equity_curve, now = this.now();
      if (!curve.length || now - curve[curve.length - 1][0] >= this.curveMs) {
        curve.push([now, roundTo(this.equity(), 4)]);
        if (curve.length > MAX_CURVE) curve.splice(0, curve.length - MAX_CURVE);
      }
    }
    stats() {
      const trades = this.state.trades, closes = trades.filter(t => Math.abs(t.realized) > EPS);
      const wins = closes.filter(t => t.realized > 0);
      return {
        equity: this.equity(), start: this.state.starting_balance, return: this.equity() / this.state.starting_balance - 1,
        realized: trades.reduce((s, t) => s + t.realized, 0), fees: trades.reduce((s, t) => s + t.fee, 0),
        funding: this.state.funding_log.reduce((s, f) => s + f.payment, 0), trades: trades.length,
        closing_trades: closes.length, win_rate: closes.length ? wins.length / closes.length : null,
        best: closes.length ? Math.max(...closes.map(t => t.realized)) : 0,
        worst: closes.length ? Math.min(...closes.map(t => t.realized)) : 0,
        volume: trades.reduce((s, t) => s + t.sz * t.px, 0),
      };
    }
  }
  function fmt2(x) { return Number(x).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}); }

  // ------------------------------------------- local API (mirrors server.py)
  function fillMsg(t) {
    let msg = `${t.side === "buy" ? "Bought" : "Sold"} ${g(t.sz)} ${displayName(t.coin)} at ${g(t.px)}`;
    if (Math.abs(t.realized) > 1e-9) msg += ` · PnL ${t.realized >= 0 ? "+" : "-"}$${fmt2(Math.abs(t.realized))}`;
    if (t.requested && t.sz < t.requested - 1e-12) msg += ` (partial: book only had ${g(t.sz)} of ${g(t.requested)} within 5% of mark)`;
    return msg;
  }

  const ACTIONS = new Set(["/api/order", "/api/close", "/api/cancel", "/api/tpsl", "/api/leverage", "/api/reset"]);

  class LocalApp {
    /* opts.passive: this page only displays an account that lives on a server. Prices are
         fetched here for the live view, but every action goes to opts.remote / setRemote(fn)
         and nothing is filled locally. */
    constructor(ex, opts = {}) {
      this.ex = ex; this.events = []; this.eventId = 0; this.error = null;
      this.queue = Promise.resolve();
      this.passive = !!opts.passive;
      this.remote = opts.remote || null;
      this.serverEvent = 0;
      this.profile = null;
    }
    setRemote(fn) { this.remote = fn; this.serverEvent = 0; if (!fn) { this.ex.state = this.ex.newState(10000); this.events = []; this.profile = null; } }
    // take the server's copy of the account and any new notifications
    adopt(r) {
      if (!r) return;
      if (r.state) this.ex.state = r.state;
      if (r.profile) this.profile = r.profile;
      for (const e of r.events || []) {
        if (e.id <= this.serverEvent) continue;
        this.serverEvent = e.id;
        this.log(e.kind, e.msg);
      }
    }
    // one operation at a time, so the background loop and clicks never interleave mid-trade
    locked(fn) { const p = this.queue.then(fn, fn); this.queue = p.catch(() => {}); return p; }
    log(kind, msg) {
      this.events.push({id: ++this.eventId, ts: Date.now(), kind, msg});
      if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    }
    start(everyMs = 2000) {
      const tick = async () => {
        try {
          await this.locked(async () => {
            if (this.passive) { await this.ex.refresh(); return; }   // the server does the trading
            for (const e of await this.ex.update()) this.log(e.includes("LIQUIDATED") ? "liquidation" : "event", e);
          });
          this.error = null;
        } catch (e) { this.error = e.message; }
        setTimeout(tick, everyMs);
      };
      tick();
    }

    async handle(path, q = {}, body = {}) {
      if (this.passive && ACTIONS.has(path)) {
        if (!this.remote) throw new PaperError("Sign in to trade.");
        return this.locked(async () => {
          const r = await this.remote(path, body);
          this.adopt(r);
          return {messages: r.messages || [], warnings: r.warnings || [], leverage: r.leverage};
        });
      }
      const routes = {
        "/api/markets": () => this.markets(),
        "/api/state": () => this.state(+(q.since || 0)),
        "/api/book": () => this.book(q.coin),
        "/api/candles": () => this.candles(q.coin, q.interval || "1h", Math.min(+(q.n || 120), 1000), q.end ? +q.end : null),
        "/api/order": () => this.locked(() => this.order(body)),
        "/api/close": () => this.locked(() => this.close(body)),
        "/api/cancel": () => this.locked(() => this.cancel(body)),
        "/api/tpsl": () => this.locked(() => this.tpsl(body)),
        "/api/leverage": () => this.locked(() => this.leverage(body)),
        "/api/reset": () => this.locked(() => this.reset(body)),
      };
      if (!routes[path]) throw new PaperError("Not found");
      return routes[path]();
    }

    async markets() {
      const ex = this.ex;
      await ex.refresh();
      return [...ex.markets.values()].map(m => ({
        name: m.name, mark: m.mark, mid: m.mid, oracle: m.oracle, change: m.change24h, funding: m.funding,
        volume: m.day_volume, oi: m.open_interest * m.mark, max_lev: m.max_leverage, cap: ex.maxLeverage(m.name), sz_dec: m.sz_decimals, lev: ex.leverage(m.name),
      }));
    }
    async state(since = 0) {
      const ex = this.ex;
      await ex.refresh();
      const orders = ex.state.orders;
      const positions = Object.entries(ex.state.positions).map(([coin, p]) => {
        const m = ex.market(coin), lev = ex.leverage(coin), upnl = ex.upnl(coin), margin = Math.abs(p.size) * p.entry / lev;
        return {coin, size: p.size, entry: p.entry, mark: m.mark, value: Math.abs(p.size) * m.mark, upnl,
                roe: margin ? upnl / margin : 0, liq: ex.liqPrice(coin), lev, funding: p.funding, margin,
                tp: orders.filter(o => o.coin === coin && o.type === "tp"), sl: orders.filter(o => o.coin === coin && o.type === "sl")};
      });
      const eq = ex.equity();
      return {
        equity: eq, balance: ex.state.balance, upnl: eq - ex.state.balance, margin_used: ex.marginUsed(),
        maintenance: ex.maintenance(), order_margin: ex.orderMargin(), available: ex.available(),
        start: ex.state.starting_balance, fees: {taker: ex.takerFee, maker: ex.makerFee},
        positions, orders, trades: ex.state.trades.slice(-200).reverse(), funding: ex.state.funding_log.slice(-200).reverse(),
        stats: ex.stats(), curve: ex.state.equity_curve.slice(-1000),
        events: this.events.filter(e => e.id > since), last_event: this.eventId,
        error: this.error, saved: ex.saveOk,
        server: this.passive, signed_in: !this.passive || !!this.remote, profile: this.profile,
      };
    }
    async book(coin) {
      await this.ex.refresh();
      const name = this.ex.market(coin).name, b = await this.ex.book(name);
      return {coin: name, bids: b.bids.slice(0, 14), asks: b.asks.slice(0, 14)};
    }
    async candles(coin, interval, n, end = null) {
      const secs = INTERVAL_SECS[interval];
      if (!secs) throw new PaperError("Unsupported interval");
      await this.ex.refresh();
      const name = this.ex.market(coin).name;
      end = end || Date.now();
      const raw = await this.ex.client.candles(name, interval, end - n * secs * 1000, end);
      return raw.map(k => [k.t, +k.o, +k.h, +k.l, +k.c, +k.v]).slice(-n);
    }
    async order(b) {
      const ex = this.ex, msgs = [], warnings = [];
      await ex.refresh();
      const m = ex.market(b.coin), coin = m.name;
      if (b.leverage && +b.leverage !== ex.leverage(coin)) ex.setLeverage(coin, +b.leverage);
      if (!b.reduce_only && ex.leverage(coin) > ex.maxLeverage(coin))
        throw new PaperError(`Your ${coin} leverage is ${ex.leverage(coin)}x, but leverage above ${ex.maxLeverage(coin)}x is switched off at the moment. Lower it to place new orders (closing is fine).`);
      const dir = b.side === "buy" ? 1 : -1, isLimit = b.type === "limit";
      const price = isLimit ? +b.price : m.mark;
      if (isLimit && !(price > 0)) throw new PaperError("Enter a limit price.");
      const size = +b.size;
      if (!(size > 0)) throw new PaperError("Enter a size.");
      const coins = (b.unit || "usd") === "usd" ? size / price : size, ro = !!b.reduce_only;
      if (isLimit) {
        const res = await ex.limitOrder(coin, dir * coins, price, b.tif || "Gtc", ro);
        if (res.fill) msgs.push(fillMsg(res.fill));
        if (res.order) msgs.push(`Limit ${res.order.side} ${g(res.order.sz)} ${coin} at ${g(res.order.px)} placed`);
        else if (!res.fill) msgs.push("Order didn't fill and was cancelled (IOC)");
      } else {
        msgs.push(fillMsg(await ex.marketOrder(coin, dir * coins, ro)));
      }
      if (ex.state.positions[coin]) {
        for (const kind of ["tp", "sl"]) {
          if (!b[kind]) continue;
          try {
            const old = ex.state.orders.filter(o => o.coin === coin && o.type === kind && o.sz == null);
            ex.triggerOrder(coin, kind, +b[kind]);
            ex.state.orders = ex.state.orders.filter(o => !old.includes(o));
            ex.save();
            msgs.push(`${kind === "tp" ? "Take-profit" : "Stop-loss"} set at ${g(+b[kind])}`);
          } catch (e) { if (!(e instanceof PaperError)) throw e; warnings.push(e.message); }
        }
      }
      msgs.forEach(x => this.log("fill", x));
      return {messages: msgs, warnings};
    }
    async close(b) {
      const ex = this.ex;
      await ex.refresh();
      const coins = b.coin === "all" ? Object.keys(ex.state.positions) : [b.coin];
      if (!coins.length) throw new PaperError("No open positions.");
      const msgs = [];
      for (const c of coins) msgs.push(fillMsg(await ex.close(c, +(b.fraction ?? 1))));
      msgs.forEach(x => this.log("fill", x));
      return {messages: msgs};
    }
    async cancel(b) {
      await this.ex.refresh();
      const n = this.ex.cancel(String(b.target ?? "all"));
      return {messages: [`Cancelled ${n} order${n !== 1 ? "s" : ""}`]};
    }
    async tpsl(b) {
      const ex = this.ex;
      await ex.refresh();
      const coin = ex.market(b.coin).name, saved = ex.state.orders.slice();
      ex.state.orders = saved.filter(o => !(o.coin === coin && (o.type === "tp" || o.type === "sl")));
      const msgs = [];
      try {
        for (const [kind, label] of [["tp", "Take-profit"], ["sl", "Stop-loss"]]) {
          if (b[kind] == null || b[kind] === "") continue;
          const o = ex.triggerOrder(coin, kind, +b[kind]);
          msgs.push(`${label} set at ${g(o.trigger_px)}`);
        }
      } catch (e) { ex.state.orders = saved; ex.save(); throw e; }
      ex.save();
      return {messages: msgs.length ? msgs : [`TP/SL removed from ${coin}`]};
    }
    async leverage(b) {
      await this.ex.refresh();
      const lev = this.ex.setLeverage(b.coin, parseInt(b.leverage, 10));
      return {messages: [`${b.coin} leverage set to ${lev}x`], leverage: lev};
    }
    async reset(b) {
      const bal = +(b.balance || 0) || null;
      if (bal !== null && bal <= 0) throw new PaperError("Starting balance must be positive.");
      this.ex.reset(bal);
      this.events = [];
      return {messages: [`Fresh account with $${fmt2(this.ex.state.balance)}`]};
    }
  }

  // Account-value milestones (Roman coins). Shared by the server (awards them) and the site (shows them).
  const TIERS = [
    {id: "sestertius", name: "Sestertius", at: 20000, color: "#C27D4A", letter: "S"},
    {id: "denarius", name: "Denarius", at: 50000, color: "#BFC7D2", letter: "D"},
    {id: "aureus", name: "Aureus", at: 100000, color: "#E3B341", letter: "A"},
    {id: "solidus", name: "Solidus", at: 250000, color: "#E8A9A0", letter: "S"},
    {id: "imperium", name: "Imperium", at: 1000000, color: "#A58BF5", letter: "I"},
  ];
  const SPOTLIGHT_MS = 7 * 24 * 3600 * 1000;

  root.Aureous = {MAX_LEVERAGE, EXTRA_MARKETS, MARKET_LABELS, displayName, HyperliquidClient, PaperExchange, LocalApp, PaperError, APIError, applyFill, roundSize, roundPx, HOUR_MS, TIERS, SPOTLIGHT_MS};
})(typeof window !== "undefined" ? window : globalThis);
