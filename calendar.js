// Economic calendar: the US releases that move every market (Fed decisions, inflation, jobs), with a countdown to
// the next big one in the price bar and the week's list one click away. The trading server reads the calendar about
// once an hour (worker/extras.js); this file only shows it. Released events also show on the chart (index.html).
(function () {
  "use strict";
  const K = window.AureousCal = {api: null, events: [], at: 0};

  document.body.insertAdjacentHTML("beforeend", `
<dialog id="calDlg" aria-labelledby="calTitle" class="wide-dlg">
  <div class="auth">
    <button class="dlg-x" type="button" id="calClose" aria-label="Close">&times;</button>
    <h3 id="calTitle">Economic calendar</h3>
    <p>US releases that move crypto, stocks and gold alike. Prices often jump in the minutes around them. Times are in your time zone.</p>
    <div id="calList"></div>
    <small class="muted">Calendar: <a href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener">Forex Factory</a>, this week's releases. Fed meeting dates from the <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noopener">Federal Reserve</a>.</small>
  </div>
</dialog>`);

  K.enable = api => {
    if (!api.calendar) return;
    K.api = api;
    load();
    setInterval(() => { if (document.visibilityState === "visible") load(); }, 10 * 60000);
    setInterval(chip, 15000);
  };
  async function load() {
    try { const r = await K.api.calendar(); K.events = r.events || []; K.at = Date.now(); }
    catch { return; }
    chip();
    if ($("#calDlg").open) render();
    if (typeof drawNews === "function") drawNews();
  }
  const big = e => e.impact === "High";
  function span(ms) {
    const m = Math.round(Math.abs(ms) / 60000);
    return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor(m % 1440 / 60)}h`;
  }
  // the next big release (or one that came out in the last half hour)
  function chip() {
    const now = Date.now(), next = K.events.find(e => big(e) && e.at > now - 30 * 60000);
    const el = $("#calChip");
    el.hidden = !next;
    if (!next) return;
    const d = next.at - now, same = K.events.filter(e => big(e) && Math.abs(e.at - next.at) < 60000).map(e => e.label);
    const what = same.length > 1 ? `${same[0]} + ${same.length - 1} more` : next.label;
    el.querySelector("span").textContent = d > 0 ? "Next big release" : "Just released";
    $("#calNext").textContent = d > 0 ? `${what} in ${span(d)}` : `${what}, ${span(d)} ago`;
    el.classList.toggle("soon", d > 0 && d < 3600000); el.classList.toggle("now", d <= 5 * 60000);
    el.title = `${same.join(", ")}: ${new Date(next.at).toLocaleString(undefined, {weekday: "short", hour: "2-digit", minute: "2-digit"})}. Click for the week's calendar.`;
  }
  function render() {
    const now = Date.now(), today = new Date(); today.setHours(0, 0, 0, 0);
    const list = K.events.filter(e => e.at >= today.getTime() - 86400000);
    if (!list.length) { $("#calList").innerHTML = `<div class="empty">Nothing on the calendar right now.</div>`; return; }
    let html = "", day = "";
    for (const e of list) {
      const d = new Date(e.at).toLocaleDateString(undefined, {weekday: "long", day: "numeric", month: "short"});
      if (d !== day) { html += `<h4 class="cal-day">${esc(d)}</h4>`; day = d; }
      const past = e.at < now;
      html += `<div class="cal-row${past ? " past" : ""}"><span class="cal-time">${new Date(e.at).toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"})}</span>
        <span class="cal-imp ${big(e) ? "hi" : "md"}" title="${big(e) ? "High impact" : "Medium impact"}"></span>
        <span class="cal-name" title="${esc(e.title)}">${esc(e.label)}</span>
        <span class="cal-num muted">${e.forecast ? "Forecast " + esc(e.forecast) : ""}${e.previous ? (e.forecast ? " · " : "") + "Previous " + esc(e.previous) : ""}${!past && e.at - now < 7 * 86400000 ? ` · in ${span(e.at - now)}` : ""}</span></div>`;
    }
    $("#calList").innerHTML = html;
  }
  $("#calChip").addEventListener("click", () => { render(); $("#calDlg").showModal(); load(); });
  $("#calClose").addEventListener("click", () => $("#calDlg").close());
  $("#calDlg").addEventListener("click", e => { if (e.target === $("#calDlg")) $("#calDlg").close(); });
})();
