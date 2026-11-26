// Journal: what your trading record says about you (win rate, average win and loss, best and worst markets,
// longs against shorts) and a private note on any trade: why you took it, what you learned.
// Stats are worked out here from your trade history; notes are kept on the trading server (worker/extras.js)
// or, without an account, in this browser. Shown in the Journal tab. Uses the page's helpers.
(function () {
  "use strict";
  const J = window.AureousJournal = {api: null, notes: {}, loaded: false, onlyNotes: false, editing: null, saving: false};
  const LOCAL_KEY = "notes";
  const EPS = 1e-9;
  const keyOf = t => `${t.ts}:${t.coin}`;

  J.enable = api => { if (api.notes) J.api = api; };
  async function load() {
    if (J.api && J.api.isSignedIn()) {
      try { J.notes = (await J.api.notes()).notes || {}; J.loaded = true; J.err = null; } catch (e) { J.err = e.message; }
      J.ver = (J.ver || 0) + 1;
    } else if (!J.api) { J.notes = store.get(LOCAL_KEY, {}); J.loaded = true; }
    else { J.notes = {}; J.loaded = false; }
    if (S.tab === "journal") J.render($("#bview"));
  }
  J.load = load;
  async function save(key, text) {
    text = text.trim().slice(0, 500);
    if (J.api) {
      await J.api.setNote(key, text);
    } else {
      const all = store.get(LOCAL_KEY, {}); if (text) all[key] = text; else delete all[key]; store.set(LOCAL_KEY, all);
    }
    if (text) J.notes[key] = text; else delete J.notes[key];
    J.ver = (J.ver || 0) + 1;
  }

  // ------------------------------------------------------------------ the numbers
  function allTrades() {
    const st = (typeof LOCAL !== "undefined" && LOCAL && LOCAL.ex && LOCAL.ex.state) || null;
    return (st && st.trades) || (S.acct && S.acct.trades ? S.acct.trades.slice().reverse() : []);
  }
  J.stats = trades => {
    const closes = trades.filter(t => Math.abs(t.realized) > EPS);
    const wins = closes.filter(t => t.realized > 0), losses = closes.filter(t => t.realized < 0);
    const sum = a => a.reduce((s, t) => s + t.realized, 0);
    const grossWin = sum(wins), grossLoss = -sum(losses);
    const side = s => { const c = closes.filter(t => t.side === s); return {n: c.length, pnl: sum(c), win: c.length ? c.filter(t => t.realized > 0).length / c.length : null}; };
    const byMarket = new Map();
    for (const t of closes) { const m = byMarket.get(t.coin) || {coin: t.coin, n: 0, wins: 0, pnl: 0}; m.n++; m.pnl += t.realized; if (t.realized > 0) m.wins++; byMarket.set(t.coin, m); }
    const markets = [...byMarket.values()].sort((a, b) => b.pnl - a.pnl);
    const opens = trades.filter(t => Math.abs(t.realized) <= EPS && t.kind !== "liquidation");
    return {
      trades: trades.length, closes: closes.length, wins: wins.length, losses: losses.length,
      winRate: closes.length ? wins.length / closes.length : null,
      avgWin: wins.length ? grossWin / wins.length : null, avgLoss: losses.length ? -grossLoss / losses.length : null,
      ratio: wins.length && losses.length ? (grossWin / wins.length) / (grossLoss / losses.length) : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null, expectancy: closes.length ? sum(closes) / closes.length : null,
      pnl: sum(closes), fees: trades.reduce((s, t) => s + (t.fee || 0), 0),
      longs: side("sell"), shorts: side("buy"),             // a sell closes a long, a buy closes a short
      best: markets[0] || null, worst: markets.length > 1 ? markets[markets.length - 1] : null, markets,
      avgLev: opens.length ? opens.reduce((s, t) => s + (t.lev || 1), 0) / opens.length : null,
      liquidations: trades.filter(t => t.kind === "liquidation").length,
    };
  };

  // ------------------------------------------------------------------ view
  const n2 = x => x == null ? "–" : x.toFixed(2);
  const pc = x => x == null ? "–" : (x * 100).toFixed(0) + "%";
  function card(label, value, cl = "", hint = "") { return `<div title="${esc(hint)}"><span>${label}</span><b class="${cl}">${value}</b></div>`; }
  J.render = v => {
    if (!v) return;
    if (locked()) { v.innerHTML = `<div class="empty">Sign in to keep a trading journal.</div>`; return; }
    if (!J.loaded && !J.err && !J.loading) { J.loading = true; load().finally(() => { J.loading = false; }); }
    const trades = allTrades();
    // the page redraws this tab every couple of seconds: only rebuild it when something changed, never mid-typing
    const sig = [trades.length, trades.length ? trades[trades.length - 1].ts : 0, J.ver, J.onlyNotes, J.editing, J.err, J.loaded].join("|");
    if (sig === J.sig && v.querySelector(".journal")) return;
    J.sig = sig;
    const typing = J.editing && v.querySelector("[data-jr-text]");     // keep what's being typed across a redraw
    if (typing) J.draft = typing.value;
    const s = J.stats(trades);
    if (!trades.length) { v.innerHTML = `<div class="empty">Your journal fills in as you trade: win rate, average win and loss, your best and worst markets, and a note on any trade.</div>`; return; }
    const tips = {
      wr: "Share of closing trades that made money.",
      ratio: "Average win divided by average loss. Above 1 means your wins are bigger than your losses.",
      pf: "Money won divided by money lost. Above 1 means you're profitable overall.",
      exp: "Average result per closing trade, after fees on the closing side.",
    };
    let html = `<div class="stats jr-stats">` +
      card("Closed trades", String(s.closes)) + card("Win rate", pc(s.winRate), "", tips.wr) +
      card("Average win", s.avgWin == null ? "–" : sgnUsd(s.avgWin), "up") + card("Average loss", s.avgLoss == null ? "–" : sgnUsd(s.avgLoss), "down") +
      card("Win / loss size", s.ratio == null ? "–" : n2(s.ratio) + "x", s.ratio == null ? "" : s.ratio >= 1 ? "up" : "down", tips.ratio) +
      card("Profit factor", s.profitFactor == null ? (s.wins ? "No losses" : "–") : n2(s.profitFactor), s.profitFactor == null ? "" : s.profitFactor >= 1 ? "up" : "down", tips.pf) +
      card("Average per trade", s.expectancy == null ? "–" : sgnUsd(s.expectancy), cls(s.expectancy), tips.exp) +
      card("Longs", s.longs.n ? `${sgnUsd(s.longs.pnl)} <small>${pc(s.longs.win)} won</small>` : "–", cls(s.longs.pnl)) +
      card("Shorts", s.shorts.n ? `${sgnUsd(s.shorts.pnl)} <small>${pc(s.shorts.win)} won</small>` : "–", cls(s.shorts.pnl)) +
      card("Best market", s.best ? `${esc(cname(s.best.coin))} <small>${sgnUsd(s.best.pnl)}</small>` : "–", s.best ? cls(s.best.pnl) : "") +
      card("Worst market", s.worst ? `${esc(cname(s.worst.coin))} <small>${sgnUsd(s.worst.pnl)}</small>` : "–", s.worst ? cls(s.worst.pnl) : "") +
      card("Average leverage", s.avgLev == null ? "–" : (Math.round(s.avgLev * 10) / 10) + "x") +
      card("Liquidations", String(s.liquidations), s.liquidations ? "down" : "") + card("Fees paid", usd(s.fees)) +
      `</div>`;
    html += insight(s);
    if (s.markets.length > 1) html += `<div class="jr-markets"><h4>By market</h4><table><thead><tr><th style="text-align:left">Market</th><th>Closing trades</th><th>Win rate</th><th>Closed PnL</th></tr></thead><tbody>` +
      s.markets.slice(0, 10).map(m => `<tr><td style="text-align:left">${esc(cname(m.coin))}</td><td>${m.n}</td><td>${pc(m.wins / m.n)}</td><td class="${cls(m.pnl)}">${sgnUsd(m.pnl)}</td></tr>`).join("") + `</tbody></table></div>`;
    // trades with notes
    const list = trades.slice(-200).reverse().filter(t => !J.onlyNotes || J.notes[keyOf(t)]);
    const kind = {market: "Market", limit: "Limit", close: "Close", tp: "Take profit", sl: "Stop loss", liquidation: "Liquidation"};
    html += `<div class="jr-bar"><h4>Notes on your trades</h4><label class="toggle"><input type="checkbox" data-jr-only ${J.onlyNotes ? "checked" : ""}> Only trades with a note</label>` +
      (J.err ? `<span class="down">${esc(J.err)}</span>` : "") + `<span class="muted">Private: only you can see them.</span></div>`;
    html += list.length ? `<table class="jr-trades"><thead><tr><th>Time</th><th>Market</th><th>Trade</th><th>Price</th><th>Closed PnL</th><th style="text-align:left;width:45%">Note</th></tr></thead><tbody>` +
      list.map(t => {
        const k = keyOf(t), note = J.notes[k] || "", closing = Math.abs(t.realized) > EPS;
        const cell = J.editing === k
          ? `<textarea data-jr-text="${esc(k)}" rows="3" maxlength="500" placeholder="Why did you take it? What happened? What would you do differently?">${esc(J.draft ?? note)}</textarea><div class="jr-btns"><button class="btn sm primary" data-jr-save="${esc(k)}">Save</button><button class="btn sm" data-jr-cancel>Cancel</button></div>`
          : note ? `<button class="jr-note" data-jr-edit="${esc(k)}" title="Edit note">${esc(note)}</button>` : `<button class="link-btn" data-jr-edit="${esc(k)}">Add a note</button>`;
        return `<tr><td>${tstr(t.ts)}</td><td>${esc(cname(t.coin))}</td><td class="${t.side === "buy" ? "up" : "down"}">${t.side === "buy" ? "Buy" : "Sell"} ${t.sz}${t.lev ? ` · ${t.lev}x` : ""} <span class="muted">${kind[t.kind] || esc(t.kind)}${closing ? "" : ", opened"}</span></td>
          <td>${fpx(t.px)}</td><td class="${cls(t.realized)}">${closing ? sgnUsd(t.realized) : "–"}</td><td style="text-align:left">${cell}</td></tr>`;
      }).join("") + `</tbody></table>` : `<div class="empty">No notes yet. Use "Add a note" on any trade.</div>`;
    v.innerHTML = `<div class="journal">${html}</div>`;
    const ta = v.querySelector("[data-jr-text]"); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  };
  // one plain-English observation, when there's enough history to say something
  function insight(s) {
    if (s.closes < 5) return "";
    const tips = [];
    if (s.winRate != null && s.winRate >= .5 && s.ratio != null && s.ratio < .7) tips.push(`You win more often than you lose, but your average loss is bigger than your average win. Cutting losers sooner (a stop loss) would help most.`);
    else if (s.winRate != null && s.winRate < .4 && s.ratio != null && s.ratio > 1.5) tips.push(`You lose more often than you win, but your wins are much bigger. That can work: keep losses small and let winners run.`);
    if (s.liquidations >= 2) tips.push(`You've been liquidated ${s.liquidations} times. Lower leverage gives a position more room to move.`);
    if (s.longs.n >= 3 && s.shorts.n >= 3 && Math.sign(s.longs.pnl) !== Math.sign(s.shorts.pnl)) tips.push(`Your ${s.longs.pnl > s.shorts.pnl ? "longs" : "shorts"} make money and your ${s.longs.pnl > s.shorts.pnl ? "shorts" : "longs"} lose it.`);
    if (s.worst && s.worst.pnl < 0 && s.worst.n >= 3) tips.push(`${cname(s.worst.coin)} is your weakest market (${sgnUsd(s.worst.pnl)} over ${s.worst.n} closing trades).`);
    return tips.length ? `<div class="jr-insight"><b>What your record says</b> ${tips.slice(0, 2).map(esc).join(" ")}</div>` : "";
  }
  $("#bview").addEventListener("click", async e => {
    if (S.tab !== "journal") return;
    const ed = e.target.closest("[data-jr-edit]"); if (ed) { J.editing = ed.dataset.jrEdit; J.draft = null; J.render($("#bview")); return; }
    if (e.target.closest("[data-jr-cancel]")) { J.editing = null; J.draft = null; J.render($("#bview")); return; }
    const sv = e.target.closest("[data-jr-save]");
    if (sv && !J.saving) {
      const k = sv.dataset.jrSave, ta = $("#bview").querySelector("[data-jr-text]");
      J.saving = true; sv.disabled = true;
      try { await save(k, ta ? ta.value : J.draft || ""); J.editing = null; J.draft = null; toast("Note saved."); }
      catch (err) { toast(err.message, "error"); }
      finally { J.saving = false; J.render($("#bview")); }
    }
  });
  $("#bview").addEventListener("change", e => { if (S.tab === "journal" && e.target.matches("[data-jr-only]")) { J.onlyNotes = e.target.checked; J.render($("#bview")); } });
  $("#bview").addEventListener("keydown", e => {
    if (S.tab !== "journal" || !e.target.matches("[data-jr-text]")) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const b = $("#bview").querySelector("[data-jr-save]"); if (b) b.click(); }
    if (e.key === "Escape") { e.preventDefault(); J.editing = null; J.draft = null; J.render($("#bview")); }
  });
})();
