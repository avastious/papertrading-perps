// Alerts: "tell me when BTC goes above 80,000", and a warning when a position gets close to liquidation.
// The trading server checks them every minute (worker/extras.js); when one goes off it arrives like any other
// notification on the site, as a browser notification if allowed, and by email if asked for.
// Also shows browser notifications for traders you follow opening trades. Uses the page's helpers.
(function () {
  "use strict";
  const A = window.AureousAlerts = {api: null, list: [], emailOk: false, at: 0};
  const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  // ------------------------------------------------------------------ markup
  $("#settingsBtn").insertAdjacentHTML("beforebegin",
    `<button class="icon-btn" id="alertsBtn" type="button" aria-label="Alerts" title="Price and liquidation alerts" hidden>${BELL}<span class="po-badge al-badge" id="alertsBadge" hidden></span></button>`);
  $("#resetView").insertAdjacentHTML("afterend", `<button id="alertHere" type="button" title="Get told when this market reaches a price" hidden>${BELL}Alert</button>`);
  document.body.insertAdjacentHTML("beforeend", `
<dialog id="alertsDlg" aria-labelledby="alTitle" class="wide-dlg">
  <div class="auth">
    <button class="dlg-x" type="button" id="alClose" aria-label="Close">&times;</button>
    <h3 id="alTitle">Alerts</h3>
    <p>Aureous checks your alerts every minute, even when this page is closed. They show up here on the site, as a notification on this device if you allow it, and by email if you tick the box.</p>
    <form id="alForm" class="al-box">
      <b>Price alert</b>
      <div class="al-row"><span class="al-coin" id="alCoin">BTC</span><span class="muted" id="alNow"></span></div>
      <div class="inp"><input id="alPx" inputmode="decimal" placeholder="Price" aria-label="Alert price"></div>
      <div class="chips" id="alChips"><button type="button" data-move="-0.05">−5%</button><button type="button" data-move="-0.01">−1%</button><button type="button" data-move="0.01">+1%</button><button type="button" data-move="0.05">+5%</button></div>
      <label class="toggle al-email"><input type="checkbox" id="alEmail"> Also email me</label>
      <button class="btn primary" id="alAdd">Add alert</button>
      <small class="muted">To alert on another market, open it on the chart first.</small>
    </form>
    <div class="al-box">
      <b>Liquidation warning</b>
      <div class="al-row"><label class="toggle"><input type="checkbox" id="alLiqOn"> Warn me when a position gets within</label>
        <select id="alLiqPct" aria-label="Distance to liquidation"><option value="2">2%</option><option value="3">3%</option><option value="5" selected>5%</option><option value="10">10%</option><option value="20">20%</option></select>
        <span>of liquidation</span></div>
      <label class="toggle al-email"><input type="checkbox" id="alLiqEmail"> Also email me</label>
    </div>
    <div class="al-box" id="alNotify"></div>
    <div id="alList"></div>
    <p class="auth-msg" id="alMsg" hidden></p>
  </div>
</dialog>`);

  // ------------------------------------------------------------------ setup
  A.enable = api => {
    if (!api.alerts) return;
    A.api = api;
    $("#alertsBtn").hidden = false; $("#alertHere").hidden = false;
  };
  async function load() {
    if (!A.api) return;
    if (!A.api.isSignedIn()) { A.list = []; badge(); return; }
    try { const r = await A.api.alerts(); A.list = r.alerts; A.emailOk = !!r.email_ok; A.err = null; }
    catch (e) { A.err = e.message; }
    A.at = Date.now();
    badge(); if ($("#alertsDlg").open) render();
  }
  A.load = load;
  function badge() {
    const n = A.list.filter(a => a.kind === "price" && !a.fired).length;
    $("#alertsBadge").hidden = !n; $("#alertsBadge").textContent = n > 9 ? "9+" : n;
  }
  function open(prefill) {
    if (!A.api) return;
    if (!S.user) { if (window.AureousUI && typeof openAuth === "function") openAuth(); return; }
    const m = market();
    $("#alCoin").textContent = cname(S.coin);
    $("#alNow").textContent = m ? "now " + fpx(m.mark) : "";
    $("#alPx").value = prefill ? String(prefill).replace(/,/g, "") : m ? fpx(m.mark).replace(/,/g, "") : "";
    msg("");
    render();
    if (!$("#alertsDlg").open) $("#alertsDlg").showModal();
    load();
    setTimeout(() => $("#alPx").select(), 30);
  }
  A.open = open;
  $("#alertsBtn").addEventListener("click", () => open());
  $("#alertHere").addEventListener("click", () => open());
  $("#alClose").addEventListener("click", () => $("#alertsDlg").close());
  $("#alertsDlg").addEventListener("click", e => { if (e.target === $("#alertsDlg")) $("#alertsDlg").close(); });

  // ------------------------------------------------------------------ view
  function msg(text, good = false) { const m = $("#alMsg"); m.hidden = !text; m.textContent = text; m.classList.toggle("ok", good); }
  function render() {
    document.querySelectorAll("#alertsDlg .al-email").forEach(l => (l.hidden = !A.emailOk));
    const liq = A.list.find(a => a.kind === "liq");
    $("#alLiqOn").checked = !!liq;
    if (liq) { $("#alLiqPct").value = String(liq.value); if (![...$("#alLiqPct").options].some(o => o.value === String(liq.value))) $("#alLiqPct").insertAdjacentHTML("beforeend", `<option value="${liq.value}" selected>${liq.value}%</option>`); $("#alLiqEmail").checked = liq.email; }
    renderNotify();
    const price = A.list.filter(a => a.kind === "price");
    const waiting = price.filter(a => !a.fired), fired = price.filter(a => a.fired);
    const row = a => `<div class="al-item${a.fired ? " done" : ""}"><span><b>${esc(cname(a.coin))}</b> ${a.dir === "above" ? "rises to" : "falls to"} <b>${fpx(a.value)}</b>${a.email ? ' <span class="muted">· email</span>' : ""}</span>
      <span class="muted">${a.fired ? "Went off " + ago(a.fired) : "Waiting"}</span><button type="button" class="dlg-x al-rm" data-rm="${a.id}" aria-label="Remove alert">&times;</button></div>`;
    $("#alList").innerHTML = (A.err ? `<div class="empty">${esc(A.err)}</div>` : "") +
      (waiting.length ? `<h4>Waiting</h4>${waiting.map(row).join("")}` : `<div class="empty" style="padding:10px 0">No price alerts waiting.</div>`) +
      (fired.length ? `<h4>Went off <button type="button" class="link-btn" id="alClear">Clear</button></h4>${fired.map(row).join("")}` : "");
  }
  function renderNotify() {
    const box = $("#alNotify");
    if (!("Notification" in window)) { box.innerHTML = `<b>Notifications on this device</b><span class="muted">This browser can't show notifications. Alerts still show on the site${A.emailOk ? " and by email" : ""}.</span>`; return; }
    const p = Notification.permission;
    box.innerHTML = `<b>Notifications on this device</b>` + (p === "granted" ? `<span class="up">On. You'll get a notification when an alert goes off or a trader you follow opens a trade, while Aureous is open in a tab.</span>`
      : p === "denied" ? `<span class="muted">Blocked in this browser's settings for this site. Allow notifications for aureous.trade there to get them.</span>`
      : `<span class="muted">Get a notification when an alert goes off, even while you're on another tab.</span><button type="button" class="btn sm" id="alAsk">Turn on notifications</button>`);
  }
  $("#alertsDlg").addEventListener("click", async e => {
    if (e.target.id === "alAsk") { try { await Notification.requestPermission(); } catch {} renderNotify(); return; }
    if (e.target.id === "alClear") { await send({action: "clear"}); return; }
    const rm = e.target.closest("[data-rm]"); if (rm) { await send({action: "remove", id: +rm.dataset.rm}); return; }
    const mv = e.target.closest("[data-move]");
    if (mv) { const m = market(); if (m) $("#alPx").value = fpx(m.mark * (1 + +mv.dataset.move)).replace(/,/g, ""); }
  });
  async function send(body) {
    try { const r = await A.api.alertsAction(body); A.list = r.alerts; A.emailOk = !!r.email_ok; badge(); render(); if (r.messages) msg(r.messages[0], true); return true; }
    catch (e) { msg(e.message); return false; }
  }
  $("#alForm").addEventListener("submit", async e => {
    e.preventDefault();
    const v = num($("#alPx").value);
    if (!(v > 0)) { msg("Enter the price to be alerted at."); return; }
    $("#alAdd").disabled = true;
    try { if (await send({action: "add", kind: "price", coin: S.coin, value: v, email: $("#alEmail").checked})) maybeAskNotify(); }
    finally { $("#alAdd").disabled = false; }
  });
  const saveLiq = () => $("#alLiqOn").checked ? send({action: "add", kind: "liq", value: +$("#alLiqPct").value, email: $("#alLiqEmail").checked}).then(ok => ok && maybeAskNotify())
    : (() => { const l = A.list.find(a => a.kind === "liq"); return l ? send({action: "remove", id: l.id}) : null; })();
  $("#alLiqOn").addEventListener("change", saveLiq);
  $("#alLiqPct").addEventListener("change", () => { if ($("#alLiqOn").checked) saveLiq(); });
  $("#alLiqEmail").addEventListener("change", () => { if ($("#alLiqOn").checked) saveLiq(); });
  // the first time someone sets an alert, offer notifications on this device
  function maybeAskNotify() {
    if (!("Notification" in window) || Notification.permission !== "default" || store.get("askedNotify", false)) return;
    store.set("askedNotify", true);
    Notification.requestPermission().then(renderNotify).catch(() => {});
  }

  // ------------------------------------------------------------------ incoming (called by the page for each new notification)
  A.onEvent = e => {
    if (e.kind === "alert") load();
    if (!["alert", "follow", "milestone"].includes(e.kind) || !("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;          // the pop-up on the page is enough
    try {
      const m = /\s#trader-([0-9a-f]{12})\.?$/.exec(e.msg), body = String(e.msg).replace(/\s#trader-[0-9a-f]{12}\.?$/, "").replace(/\b[a-z][a-z0-9]*:([A-Z0-9]+)\b/g, "$1");
      const n = new Notification(e.kind === "follow" ? "Aureous: a trader you follow" : e.kind === "alert" ? "Aureous alert" : "Aureous", {body, icon: "icons/icon-192.png", tag: "aureous-" + e.id});
      n.onclick = () => { window.focus(); if (m && typeof openTrader === "function") openTrader(m[1]); n.close(); };
    } catch {}
  };
  setInterval(() => { if (A.api && document.visibilityState === "visible" && Date.now() - A.at > 60000) load(); }, 20000);
})();
