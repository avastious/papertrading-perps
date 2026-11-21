// Calls: publicly call a position you hold and say why. The entry is your real fill and the result is tracked
// until you close the position. Calls can't be edited or deleted, so everyone's record stays honest.
// Shown in the Calls tab (feed), on trader profiles and from each open position. Uses the page's helpers.
(function () {
  "use strict";
  const MIN = 20, MAX = 600;
  const C = window.AureousCalls = {api: null, list: null, at: 0, sort: "latest", openOnly: false, here: false, focus: null, posting: null};

  // ------------------------------------------------------------------ setup (signed-in features need the server)
  C.enable = api => {
    if (!api.calls) return;
    C.api = api;
    $("#callsTab").hidden = false; $("#navCalls").hidden = false;
    const id = hashCall(); if (id) openCall(id);
  };
  const hashCall = () => { const m = /^#call-(\d{1,9})$/.exec(location.hash); return m && +m[1]; };
  window.addEventListener("hashchange", () => { const id = hashCall(); if (id && C.api) openCall(id); });
  function openCall(id) { C.focus = id; C.sort = "latest"; C.openOnly = false; C.here = false; showTab(); load(true); }
  function showTab() { document.querySelector('#btabs [data-t="calls"]').click(); $(".bottom").scrollIntoView({block: "nearest", behavior: "smooth"}); }
  $("#navCalls").addEventListener("click", e => { e.preventDefault(); history.replaceState(null, "", "#calls"); showTab(); });
  if (location.hash === "#calls") setTimeout(() => C.api && showTab(), 1500);

  // ------------------------------------------------------------------ feed
  async function load(force) {
    if (!C.api || (!force && Date.now() - C.at < 15000)) return;
    C.at = Date.now();
    const q = {sort: C.sort === "top" ? "top" : undefined, status: C.openOnly ? "open" : undefined, coin: C.here ? S.coin : undefined, id: C.focus || undefined};
    try { const r = await C.api.calls(q); C.list = r.calls; C.err = null; }
    catch (e) { C.err = e.message; }
    if (S.tab === "calls") render($("#bview"));
  }
  C.load = load;
  C.render = v => { if (!C.list && !C.err) { v.innerHTML = `<div class="empty">Loading calls…</div>`; load(true); return; } render(v); load(); };

  const outcome = c => c.outcome === "open" ? `<span class="call-status open">Open</span>` : c.outcome === "liquidated" ? `<span class="call-status liq">Liquidated</span>` : `<span class="call-status">Closed ${ago(c.closed_at)}</span>`;
  function card(c) {
    const long = c.side === "long", lev = Math.round(c.lev * 10) / 10;
    return `<article class="call${C.focus === c.id ? " focus" : ""}" id="call-${c.id}">
      <header class="call-head"><div class="call-who">${traderName(c)}<span class="call-time">${ago(c.created)}</span></div>${outcome(c)}</header>
      <div class="call-trade">
        <button class="call-chip ${long ? "up" : "down"}" data-call-coin="${esc(c.coin)}" title="Open ${esc(cname(c.coin))} on the chart">${long ? "Long" : "Short"} ${esc(cname(c.coin))} <span>${lev}x</span></button>
        <div class="call-nums"><span>Entry <b>${fpx(c.entry)}</b></span><span>${c.outcome === "open" ? "Now" : "Exit"} <b>${fpx(c.price)}</b></span></div>
        <div class="call-result ${cls(c.move)}"><b>${pct(c.move, 2)}</b><span>${pct(c.roe, 1)} at ${lev}x</span></div>
      </div>
      <p class="call-thesis">${esc(c.thesis)}</p>
      <footer class="call-foot">
        <button class="vote${c.my_vote === 1 ? " on" : ""}" data-vote="1" data-id="${c.id}" ${c.self ? "disabled title=\"Your call\"" : ""} aria-pressed="${c.my_vote === 1}">Agree <span>${c.agree}</span></button>
        <button class="vote${c.my_vote === -1 ? " on" : ""}" data-vote="-1" data-id="${c.id}" ${c.self ? "disabled title=\"Your call\"" : ""} aria-pressed="${c.my_vote === -1}">Disagree <span>${c.disagree}</span></button>
        <button class="link-btn" data-call-link="${c.id}">Copy link</button>
      </footer>
    </article>`;
  }
  function render(v) {
    const seg = (k, label) => `<button type="button" data-call-sort="${k}" aria-pressed="${C.sort === k}">${label}</button>`;
    const myPos = S.acct && S.acct.positions && S.acct.positions.length && S.user;
    let html = `<div class="calls-bar"><div class="choice">${seg("latest", "Latest")}${seg("top", "Best this week")}</div>
      <label class="toggle"><input type="checkbox" data-call-open ${C.openOnly ? "checked" : ""}> Open only</label>
      <label class="toggle"><input type="checkbox" data-call-here ${C.here ? "checked" : ""}> ${esc(cname(S.coin))} only</label>
      <span class="grow"></span>${myPos ? `<button class="btn primary sm" type="button" data-call-new>Make a call</button>` : ""}</div>`;
    if (C.focus) html += `<div class="calls-note">Showing one call. <button class="link-btn" data-call-all>See all calls</button></div>`;
    if (C.err) html += `<div class="empty">${esc(C.err)}</div>`;
    else if (!C.list.length) html += `<div class="empty">${C.focus ? "That call isn't available any more." : "No calls yet. Open a position and tell everyone why: press <b>Call</b> next to it."}</div>`;
    else html += `<div class="calls">${C.list.map(card).join("")}</div>`;
    v.innerHTML = html;
  }
  $("#bview").addEventListener("click", async e => {
    if (S.tab !== "calls") return;
    const t = e.target;
    const s = t.closest("[data-call-sort]"); if (s) { C.sort = s.dataset.callSort; C.focus = null; load(true); return; }
    if (t.closest("[data-call-all]")) { C.focus = null; history.replaceState(null, "", "#calls"); load(true); return; }
    if (t.closest("[data-call-new]")) { const p = S.acct.positions.find(p => p.coin === S.coin) || S.acct.positions[0]; openPost(p.coin); return; }
    const cc = t.closest("[data-call-coin]"); if (cc) { selectCoin(cc.dataset.callCoin); return; }
    const l = t.closest("[data-call-link]"); if (l) { copyText(SITE_URL.replace(/#.*$/, "") + "#call-" + l.dataset.callLink, "Link to this call copied."); return; }
    const vb = t.closest("[data-vote]");
    if (vb) {
      if (!S.user) { openAuth("signin"); return; }
      const c = C.list.find(c => c.id === +vb.dataset.id); if (!c) return;
      const vote = c.my_vote === +vb.dataset.vote ? 0 : +vb.dataset.vote;
      try { Object.assign(c, await C.api.voteCall(c.id, vote)); render($("#bview")); } catch (err) { toast(err.message, "error"); }
    }
  });
  $("#bview").addEventListener("change", e => {
    if (S.tab !== "calls") return;
    if (e.target.matches("[data-call-open]")) { C.openOnly = e.target.checked; C.focus = null; load(true); }
    if (e.target.matches("[data-call-here]")) { C.here = e.target.checked; C.focus = null; load(true); }
  });
  C.coinChanged = () => { if (C.here && S.tab === "calls") load(true); };

  // ------------------------------------------------------------------ posting a call
  function openPost(coin) {
    if (!C.api) return;
    if (!S.user) { openAuth("signin"); return; }
    const p = S.acct.positions.find(p => p.coin === coin);
    if (!p) { toast("You can only call a market you hold. Open the position first.", "error"); return; }
    C.posting = coin;
    $("#cdTrade").innerHTML = `<span class="${p.size > 0 ? "up" : "down"}">${p.size > 0 ? "Long" : "Short"} ${esc(cname(coin))} ${p.lev}x</span> from ${fpx(p.entry)}`;
    $("#cdThesis").value = ""; count(); $("#cdMsg").hidden = true;
    $("#callDlg").showModal(); $("#cdThesis").focus();
  }
  C.openPost = openPost;
  const count = () => { const n = $("#cdThesis").value.trim().length; $("#cdCount").textContent = `${n} / ${MAX}`; $("#cdCount").classList.toggle("down", n > MAX); $("#cdPost").disabled = n < MIN || n > MAX; };
  $("#cdThesis").addEventListener("input", count);
  $("#cdCancel").addEventListener("click", () => $("#callDlg").close());
  $("#callForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#cdPost"); btn.disabled = true;
    try {
      const r = await C.api.postCall(C.posting, $("#cdThesis").value);
      $("#callDlg").close(); toast(r.messages[0], "fill");
      C.focus = null; C.sort = "latest"; showTab(); load(true);
    } catch (err) { $("#cdMsg").textContent = err.message; $("#cdMsg").hidden = false; btn.disabled = false; }
  });

  // a "Read" link on a profile closes the profile and shows that call
  $("#traderDlg").addEventListener("click", e => { if (e.target.closest('a[href^="#call-"]')) $("#traderDlg").close(); });

  // ------------------------------------------------------------------ calls on a trader's profile
  C.profileSection = d => {
    const list = d.calls || []; if (!list.length) return "";
    return `<div class="tr-section"><h4>Calls</h4><div class="tbl-wrap"><table><thead><tr><th>Called</th><th>Market</th><th>Side</th><th>Entry</th><th>Now / exit</th><th>Move</th><th>Status</th><th></th></tr></thead><tbody>` +
      list.map(c => `<tr><td>${ago(c.created)}</td><td><b>${esc(cname(c.coin))}</b></td><td class="${c.side === "long" ? "up" : "down"}">${c.side === "long" ? "Long" : "Short"} ${Math.round(c.lev * 10) / 10}x</td>
        <td>${fpx(c.entry)}</td><td>${fpx(c.price)}</td><td class="${cls(c.move)}">${pct(c.move, 2)}</td><td>${c.outcome === "open" ? "Open" : c.outcome === "liquidated" ? "Liquidated" : "Closed"}</td>
        <td><a class="link-btn" href="#call-${c.id}">Read</a></td></tr>`).join("") + `</tbody></table></div></div>`;
  };
})();
