// Live trading on Hyperliquid's testnet: real orders, test money.
// The trader's own wallet (MetaMask, Rabby…) approves a trading key that lives in this browser; that key signs
// orders, which go straight to Hyperliquid. Aureous never holds funds or keys on its server. The site owner turns
// this on in /admin (off by default); only the testnet can be switched on there.
// Uses the page's helpers ($, S, market, toast, usd, fpx, cname, esc, num…) from index.html.
(function () {
  "use strict";
  const NETWORK = "testnet";
  const KEY = "aureous.live.v1";
  const APP = "https://app.hyperliquid-testnet.xyz";
  const SLIPPAGE = 0.05;                 // market orders: limit price 5% through the mid, filled now or cancelled
  const L = {
    cfg: null, on: false, lib: null, wallet: null, user: null, agent: null, exAgent: null, exMain: null, info: null,
    meta: null, mids: {}, state: null, orders: [], fills: [], levSet: {}, busy: false, err: null, timer: 0,
  };
  window.AureousLive = L;

  const store = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const short = a => a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
  const apiUrl = () => window.AUREOUS_LIVE_API || undefined;     // tests point this at a stand-in
  const feePct = f => (f / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%";

  // ------------------------------------------------------------------ config from the server
  L.config = c => {
    const was = L.enabled();
    L.cfg = c;
    const en = L.enabled();
    $("#modeSwitch").hidden = !en;
    $("#liveTab").hidden = !en;
    if (!en && L.on) setMode(false);
    if (en && !was && store().mode === "live") setMode(true);
  };
  L.enabled = () => !!(L.cfg && L.cfg.live === NETWORK);
  L.builder = () => (L.cfg && /^0x[0-9a-f]{40}$/.test(L.cfg.builder || "") && L.cfg.builder_fee > 0) ? {b: L.cfg.builder, f: L.cfg.builder_fee} : null;

  // ------------------------------------------------------------------ library (loaded only when someone goes live)
  async function lib() {
    if (L.lib) return L.lib;
    await new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "vendor/hl-live.js"; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load the live trading library.")); document.head.appendChild(s); });
    L.lib = window.AureousHL;
    const t = new L.lib.HttpTransport({isTestnet: true, apiUrl: apiUrl()});
    L.transport = t; L.info = new L.lib.InfoClient({transport: t});
    return L.lib;
  }

  // ------------------------------------------------------------------ paper / live switch
  function setMode(live) {
    L.on = live;
    const st = store(); st.mode = live ? "live" : "paper"; save(st);
    document.documentElement.classList.toggle("live-on", live);
    document.querySelectorAll("#modeSwitch [data-mode]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.mode === "live") === live)));
    $("#liveAcct").hidden = !live;
    $("#paperAcct").hidden = live;
    if (live) { $("#tpslOn").checked = false; $("#tpslFields").hidden = true; }
    $("#tpslWrap").hidden = live || S.type === "limit";
    clearInterval(L.timer);
    if (live) { boot().catch(e => fail(e)); L.timer = setInterval(() => refresh().catch(() => {}), 3000); const t = document.querySelector('#btabs [data-t="live"]'); t.click(); t.parentElement.scrollLeft = t.offsetLeft - 16; }
    else if (S.tab === "live") document.querySelector('#btabs [data-t="positions"]').click();
    syncLeverage(); renderSummary(); render();
  }
  async function boot() {
    await lib();
    const st = store();
    if (st.user && st.network === NETWORK) {
      L.user = st.user;
      if (st.key) { L.agent = L.lib.privateKeyToAccount(st.key); L.exAgent = new L.lib.ExchangeClient({transport: L.transport, wallet: L.agent}); }
    }
    await refresh();
  }
  const fail = e => { L.err = friendly(e); render(); };
  function friendly(e) {
    const m = String((e && (e.shortMessage || e.message)) || e || "Something went wrong.");
    if (/user rejected|denied|rejected the request/i.test(m)) return "You cancelled it in your wallet.";
    if (/does not exist|not exist/i.test(m) && /agent|api wallet|user/i.test(m)) return "Your trading key isn't active on Hyperliquid. Press Enable trading again.";
    if (/deposit/i.test(m)) return "This wallet has no test USDC on Hyperliquid's testnet yet. Get some from the faucet first.";
    if (/insufficient margin|not enough/i.test(m)) return "Not enough test USDC for that order.";
    if (/minimum value of \$?10/i.test(m)) return "Hyperliquid's smallest order is $10 of position value.";
    return m.replace(/^.*?Error:\s*/, "").slice(0, 220);
  }

  // ------------------------------------------------------------------ wallet: connect, enable trading, disconnect
  L.connect = async () => {
    const eth = window.ethereum;
    if (!eth) { L.err = "No wallet found in this browser. Install Rabby or MetaMask (or open Aureous in your wallet app's browser), then try again."; render(); return; }
    L.busy = true; L.err = null; render();
    try {
      await lib();
      const w = await L.lib.browserWallet(eth);
      L.wallet = w.client; L.user = w.address.toLowerCase();
      L.exMain = new L.lib.ExchangeClient({transport: L.transport, wallet: L.wallet});
      const st = store();
      if (st.user !== L.user || st.network !== NETWORK) { save({mode: "live", network: NETWORK, user: L.user}); L.agent = null; L.exAgent = null; }
      await refresh();
    } catch (e) { fail(e); } finally { L.busy = false; render(); renderSummary(); }
  };
  // One-time setup: a trading key for this browser (approved by the wallet, can trade but never withdraw),
  // plus the Aureous builder fee if the site owner has set one.
  L.enable = async () => {
    if (!L.exMain) { await L.connect(); if (!L.exMain) return; }
    L.busy = true; L.err = null; render();
    try {
      const key = L.lib.generatePrivateKey(), agent = L.lib.privateKeyToAccount(key);
      await L.exMain.approveAgent({agentAddress: agent.address, agentName: "aureous"});
      const b = L.builder();
      if (b) {
        let have = 0; try { have = +(await L.info.maxBuilderFee({user: L.user, builder: b.b})) || 0; } catch {}
        if (have < b.f) await L.exMain.approveBuilderFee({builder: b.b, maxFeeRate: feePct(b.f)});
      }
      save({...store(), network: NETWORK, user: L.user, key});
      L.agent = agent; L.exAgent = new L.lib.ExchangeClient({transport: L.transport, wallet: agent}); L.levSet = {};
      toast("Live trading is ready on Hyperliquid's testnet.", "fill");
      await refresh();
    } catch (e) { fail(e); } finally { L.busy = false; render(); renderSummary(); }
  };
  L.disconnect = () => {
    save({mode: "live"}); Object.assign(L, {wallet: null, user: null, agent: null, exAgent: null, exMain: null, state: null, orders: [], fills: [], err: null});
    render(); renderSummary();
  };

  // ------------------------------------------------------------------ market data and account from Hyperliquid testnet
  async function refresh() {
    if (!L.on || !L.info) return;
    if (!L.meta) {
      const meta = await L.info.meta();
      L.meta = Object.fromEntries(meta.universe.map((u, i) => [u.name, {asset: i, szDec: u.szDecimals, maxLev: u.maxLeverage, delisted: u.isDelisted}]));
    }
    L.mids = await L.info.allMids();
    if (L.user) {
      const [st, oo, fl] = await Promise.all([L.info.clearinghouseState({user: L.user}), L.info.openOrders({user: L.user}), L.info.userFills({user: L.user})]);
      L.state = st; L.orders = oo; L.fills = fl.slice(0, 50);
    }
    render(); renderSummary();
    if (S.tab === "live") renderBottom();
  }
  L.mid = coin => +L.mids[coin] || NaN;
  L.tm = coin => L.meta && L.meta[coin] && !L.meta[coin].delisted ? L.meta[coin] : null;
  L.maxLev = coin => (L.tm(coin) || {}).maxLev || null;

  // Hyperliquid's price rule for perps: at most 5 significant figures and 6 - szDecimals decimals
  function hlPrice(px, szDec) {
    let p = +(+px).toPrecision(5);
    const d = Math.max(0, 6 - szDec);
    p = +p.toFixed(d);
    return String(p);
  }
  const hlSize = (sz, szDec) => { const f = 10 ** szDec; return String(Math.floor(sz * f + 1e-9) / f); };

  // ------------------------------------------------------------------ orders
  L.submit = async (body, m) => {
    if (!L.user) return L.connect();
    if (!L.exAgent) return L.enable();
    const t = L.tm(m.name);
    if (!t) { toast(`${cname(m.name)} isn't on Hyperliquid's testnet. Pick another market for live trading.`, "error"); return; }
    const mid = L.mid(m.name);
    if (!(mid > 0)) { toast("No testnet price for this market yet. Try again in a moment.", "error"); return; }
    const lev = Math.min(body.leverage, t.maxLev);
    const coins = body.unit === "coin" ? body.size : body.size / (body.type === "limit" ? body.price : mid);
    const sz = hlSize(coins, t.szDec);
    if (!(+sz > 0)) { toast("That size is too small for this market.", "error"); return; }
    const isBuy = body.side === "buy";
    const px = body.type === "limit" ? hlPrice(body.price, t.szDec) : hlPrice(mid * (isBuy ? 1 + SLIPPAGE : 1 - SLIPPAGE), t.szDec);
    const order = {a: t.asset, b: isBuy, p: px, s: sz, r: !!body.reduce_only, t: {limit: {tif: body.type === "limit" ? (body.tif || "Gtc") : "Ioc"}}};
    const req = {orders: [order], grouping: "na"}, b = L.builder();
    if (b) req.builder = b;
    try {
      if (!body.reduce_only && L.levSet[t.asset] !== lev) { await L.exAgent.updateLeverage({asset: t.asset, isCross: true, leverage: lev}); L.levSet[t.asset] = lev; }
      const r = await L.exAgent.order(req);
      const s = r && r.response && r.response.data && r.response.data.statuses && r.response.data.statuses[0] || {};
      if (s.error) throw new Error(s.error);
      if (s.filled) toast(`Testnet: ${isBuy ? "bought" : "sold"} ${s.filled.totalSz} ${cname(m.name)} at ${fpx(+s.filled.avgPx)}.`, "fill");
      else if (s.resting) toast(`Testnet: limit order placed, ${isBuy ? "buy" : "sell"} ${sz} ${cname(m.name)} at ${fpx(+px)}.`, "fill");
      else toast("Testnet: order sent.", "fill");
      if (lev < body.leverage) toast(`Hyperliquid allows up to ${lev}x on ${cname(m.name)}, so the order used ${lev}x.`);
      $("#size").value = ""; renderSummary();
      refresh().catch(() => {});
    } catch (e) { const msg = friendly(e); toast(msg, "error"); if (/trading key/.test(msg)) { const st = store(); delete st.key; save(st); L.agent = L.exAgent = null; render(); } }
  };
  L.closePos = async coin => {
    const p = ((L.state && L.state.assetPositions) || []).map(x => x.position).find(x => x.coin === coin); if (!p) return;
    const szi = +p.szi, m = {name: coin};
    await L.submit({side: szi > 0 ? "sell" : "buy", type: "market", size: Math.abs(szi), unit: "coin", leverage: (p.leverage && p.leverage.value) || 1, reduce_only: true}, m);
  };
  L.cancel = async (coin, oid) => {
    const t = L.tm(coin); if (!t || !L.exAgent) return;
    try { await L.exAgent.cancel({cancels: [{a: t.asset, o: +oid}]}); toast("Testnet: order cancelled."); refresh().catch(() => {}); }
    catch (e) { toast(friendly(e), "error"); }
  };

  // ------------------------------------------------------------------ what the page shows
  L.buttonText = m => {
    if (!L.user) return "Connect wallet";
    if (!L.exAgent) return "Enable live trading";
    if (m && !L.tm(m.name)) return `${cname(m.name)} isn't on testnet`;
    return `${S.side === "buy" ? "Long" : "Short"} ${m ? cname(m.name) : ""} on testnet`;
  };
  L.available = () => L.state ? +L.state.withdrawable : null;
  function render() {
    const box = $("#liveAcct"); if (!box || box.hidden) return;
    const ms = L.state && L.state.marginSummary, b = L.builder();
    let html = `<div class="acct-top"><h2>Live account <span class="net-tag">Testnet</span></h2>${L.user ? `<button class="link-btn" type="button" data-live="disconnect">Disconnect</button>` : ""}</div>`;
    if (!L.user) {
      html += `<p class="note">Trade on Hyperliquid's test network with your own wallet. Orders are real, the money is test USDC with no value. Aureous never holds your funds or keys.</p>
        <button class="btn primary" type="button" data-live="connect"${L.busy ? " disabled" : ""}>${L.busy ? "Waiting for your wallet…" : "Connect wallet"}</button>`;
    } else {
      html += `<div class="live-who"><span class="mono">${esc(short(L.user))}</span><a href="${APP}/explorer/address/${esc(L.user)}" target="_blank" rel="noopener">View on explorer</a></div>
        <div class="equity">${ms ? usd(+ms.accountValue) : "–"}</div>
        <dl class="kv"><dt>Available</dt><dd>${L.state ? usd(+L.state.withdrawable) : "–"}</dd><dt>Margin used</dt><dd>${ms ? usd(+ms.totalMarginUsed) : "–"}</dd>
        <dt>Position value</dt><dd>${ms ? usd(+ms.totalNtlPos) : "–"}</dd>${b ? `<dt>Aureous fee</dt><dd>${feePct(b.f)} per trade</dd>` : ""}</dl>`;
      if (ms && +ms.accountValue === 0) html += `<p class="note">No test USDC yet. Claim some from <a href="${APP}/drip" target="_blank" rel="noopener">Hyperliquid's testnet faucet</a>, then come back.</p>`;
      if (!L.exAgent) html += `<p class="note">One-time setup: your wallet approves a trading key for this browser${b ? " and the Aureous fee" : ""}. The key can place trades but can never withdraw.</p>
        <button class="btn primary" type="button" data-live="enable"${L.busy ? " disabled" : ""}>${L.busy ? "Check your wallet…" : "Enable live trading"}</button>`;
    }
    if (L.err) html += `<p class="note warn">${esc(L.err)}</p>`;
    box.innerHTML = html;
  }
  L.renderBottom = v => {
    if (!L.user) { v.innerHTML = `<div class="empty">Connect a wallet to see your live testnet positions.</div>`; return; }
    const pos = ((L.state && L.state.assetPositions) || []).map(x => x.position).filter(p => +p.szi !== 0);
    let html = `<h4 class="live-h">Positions</h4>`;
    html += pos.length ? `<table><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Value</th><th>Entry</th><th>PnL (ROE)</th><th>Liq. price</th><th></th></tr></thead><tbody>` +
      pos.map(p => `<tr><td>${esc(p.coin)}</td><td class="${+p.szi > 0 ? "up" : "down"}">${+p.szi > 0 ? "Long" : "Short"} ${p.leverage ? p.leverage.value + "x" : ""}</td><td>${Math.abs(+p.szi)}</td>
        <td>${usd(+p.positionValue)}</td><td>${fpx(+p.entryPx)}</td><td class="${cls(+p.unrealizedPnl)}">${sgnUsd(+p.unrealizedPnl)} (${pct(+p.returnOnEquity, 1)})</td>
        <td>${p.liquidationPx ? fpx(+p.liquidationPx) : "None"}</td>
        <td><span class="act"><button data-live="close" data-coin="${esc(p.coin)}">Close</button></span></td></tr>`).join("") + `</tbody></table>`
      : `<div class="empty">No live positions.</div>`;
    html += `<h4 class="live-h">Open orders</h4>` + (L.orders.length ? `<table><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Price</th><th>Placed</th><th></th></tr></thead><tbody>` +
      L.orders.map(o => `<tr><td>${esc(o.coin)}</td><td class="${o.side === "B" ? "up" : "down"}">${o.side === "B" ? "Buy" : "Sell"}</td><td>${o.sz}</td><td>${fpx(+o.limitPx)}</td><td>${tstr(o.timestamp)}</td>
        <td><span class="act"><button data-live="cancel" data-coin="${esc(o.coin)}" data-oid="${o.oid}">Cancel</button></span></td></tr>`).join("") + `</tbody></table>` : `<div class="empty">No open orders.</div>`);
    html += `<h4 class="live-h">Recent fills</h4>` + (L.fills.length ? `<table><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Size</th><th>Price</th><th>Fee</th><th>Closed PnL</th></tr></thead><tbody>` +
      L.fills.map(f => `<tr><td>${tstr(f.time)}</td><td>${esc(f.coin)}</td><td class="${f.side === "B" ? "up" : "down"}">${esc(f.dir || (f.side === "B" ? "Buy" : "Sell"))}</td><td>${f.sz}</td><td>${fpx(+f.px)}</td>
        <td>${usd(+f.fee + (+f.builderFee || 0))}</td><td class="${cls(+f.closedPnl)}">${+f.closedPnl ? sgnUsd(+f.closedPnl) : "–"}</td></tr>`).join("") + `</tbody></table>` : `<div class="empty">No fills yet.</div>`);
    v.innerHTML = html;
  };

  // ------------------------------------------------------------------ events
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-live]"); if (!b) return;
    const a = b.dataset.live;
    if (a === "connect") L.connect(); else if (a === "enable") L.enable(); else if (a === "disconnect") L.disconnect();
    else if (a === "close") L.closePos(b.dataset.coin); else if (a === "cancel") L.cancel(b.dataset.coin, b.dataset.oid);
  });
  $("#modeSwitch").addEventListener("click", e => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    const live = b.dataset.mode === "live"; if (live !== L.on) setMode(live);
  });
})();
