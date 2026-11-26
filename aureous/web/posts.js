// Posts: live posts on X and Truth Social from market-moving people, in a "Posts" tab beside the order book.
// The trading server reads both (see worker/posts.js); this file only shows what it serves at /api/posts.
// Cashtags that match an Aureous market ($NVDA, $BTC) open that market. "This market" shows only posts
// that mention the market you're looking at. Uses the page's helpers ($, S, esc, cname, selectCoin, setBookTab).
(function () {
  "use strict";
  const P = window.AureousPosts = {api: null, on: false, list: [], ids: new Set(), unread: 0, here: false, src: "", updated: 0, at: 0, err: null};
  const FAST = 15000, SLOW = 60000;
  const ALIAS = {SPX: "xyz:SP500", ES: "xyz:SP500", NDX: "xyz:XYZ100", NQ: "xyz:XYZ100", WTI: "xyz:CL", OIL: "xyz:CL", XAU: "xyz:GOLD",
                 XAG: "xyz:SILVER", BRK: "xyz:BRKB", BRKB: "xyz:BRKB", GOOG: "xyz:GOOGL", NATGAS: "xyz:NATGAS", PEPE: "kPEPE", BONK: "kBONK", SHIB: "kSHIB"};
  const NAMES = {BTC: ["bitcoin"], ETH: ["ethereum", "ether"], SOL: ["solana"], HYPE: ["hyperliquid"], DOGE: ["dogecoin"], XRP: ["ripple"],
                 "xyz:SP500": ["S&P 500", "S&P", "SPX"], "xyz:XYZ100": ["Nasdaq"], "xyz:GOLD": ["gold"], "xyz:CL": ["oil", "crude"], "xyz:BRENTOIL": ["oil", "brent"]};
  const VAGUE = new Set(["strategy", "block", "meta", "visa", "circle", "snap", "oracle", "arm", "silver", "copper"]);
  const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.71 7.67L22 21h-6.18l-4.84-6.33L5.44 21H2.37l7.18-8.2L2 3h6.34l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z"/></svg>';
  const TS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 4h18v4.2h-6.9V20H9.9V8.2H3z"/></svg>';
  const SRC = {x: {name: "X", icon: X_ICON}, ts: {name: "Truth Social", icon: TS_ICON}};
  const TICK = '<svg class="po-ok" viewBox="0 0 24 24" aria-label="Verified"><path fill="currentColor" d="M12 1.6 14.6 4l3.5-.3.8 3.4 3 1.9-1.4 3.2 1.4 3.2-3 1.9-.8 3.4-3.5-.3L12 22.4 9.4 20l-3.5.3-.8-3.4-3-1.9 1.4-3.2L2.1 8.6l3-1.9.8-3.4 3.5.3L12 1.6Zm-1.3 13.9 6-6-1.4-1.4-4.6 4.6-2.3-2.3-1.4 1.4 3.7 3.7Z"/></svg>';

  // ------------------------------------------------------------------ setup
  P.enable = async api => {
    if (!api.posts) return;
    P.api = api;
    await load();
    setInterval(() => { if (document.visibilityState === "visible") load(); }, FAST);
    setInterval(() => { if (P.on && S.bk === "posts") render(); }, 30000);      // keep "5m" times current
    if (location.hash === "#posts" && P.on) open();
  };
  function open() {
    const mv = document.querySelector('#mswitch [data-mv="posts"]');
    if (matchMedia("(max-width:899px)").matches && mv) mv.click(); else setBookTab("posts");
    document.querySelector(".book").scrollIntoView({block: "nearest", behavior: "smooth"});
  }
  $("#navPosts").addEventListener("click", e => { e.preventDefault(); history.replaceState(null, "", "#posts"); open(); });

  // ------------------------------------------------------------------ data
  async function load() {
    const showing = S.bk === "posts";
    if (!P.api || (!showing && Date.now() - P.at < SLOW - 1000)) return;
    P.at = Date.now();
    let r;
    try { r = await P.api.posts(); P.err = null; }
    catch (e) { P.err = e.message; if (showing) render(); return; }
    setOn(!!r.on);
    if (!r.on) return;
    P.updated = r.updated || 0;
    const fresh = P.ids.size ? r.posts.filter(p => !P.ids.has(p.id)) : [];
    if (!showing) P.unread += fresh.length;
    P.newIds = new Set(fresh.map(p => p.id));
    P.list = r.posts; P.ids = new Set(r.posts.map(p => p.id));
    if (fresh.length || !P.drawn) { P.drawn = true; if (typeof drawNews === "function") drawNews(); }
    badge();
    if (showing) render();
  }
  function setOn(on) {
    if (on === P.on) return;
    P.on = on;
    $("#navPosts").hidden = !on;
    document.querySelectorAll("[data-bk=posts],[data-mv=posts]").forEach(b => (b.hidden = !on));
    if (!on && S.bk === "posts") setBookTab("book");
  }
  function badge() {
    document.querySelectorAll(".po-badge").forEach(b => { b.textContent = P.unread > 9 ? "9+" : P.unread; b.hidden = !P.unread; });
  }
  P.shown = () => { P.unread = 0; badge(); render(); if (Date.now() - P.at > FAST) load(); };
  P.coinChanged = () => { if (S.bk === "posts" && P.here) render(); };

  // ------------------------------------------------------------------ which market a post is about
  function coinFor(sym) {
    sym = String(sym).toUpperCase();
    for (const c of [ALIAS[sym], sym, "xyz:" + sym, "io:" + sym, "k" + sym]) if (c && S.mk && S.mk[c]) return c;
    return null;
  }
  function words(coin) {
    const out = new Set([cname(coin)].filter(t => t.length >= 2));
    (NAMES[coin] || []).forEach(w => out.add(w));
    const label = (window.Aureous && Aureous.MARKET_LABELS || {})[coin];
    if (label && !/pre-IPO|index|vs |ETF/.test(label)) {
      for (const part of label.replace(/\)/g, "").split(/\s*\(\s*/)) if (part.length >= 3 && !VAGUE.has(part.toLowerCase())) out.add(part);
    }
    return [...out];
  }
  const reCache = new Map();
  function mentions(p, coin) {
    if (p.segs.some(s => s.c && coinFor(s.c) === coin)) return true;
    if (!reCache.has(coin)) {
      const ws = words(coin).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      reCache.set(coin, ws.length ? new RegExp(`(^|[^\\w$])(${ws.join("|")})(?![\\w])`, "i") : null);
    }
    const re = reCache.get(coin);
    return !!re && p.segs.some(s => typeof s === "string" && re.test(s));
  }
  P.mentions = mentions;                               // used by the news markers on the chart

  // ------------------------------------------------------------------ view
  const ago = ms => { const s = Math.max(0, (Date.now() - ms) / 1000);
    return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const when = ms => new Date(ms).toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"});
  const postUrl = p => p.url || `https://x.com/${encodeURIComponent(p.author.handle)}/status/${p.id}`;
  const whoUrl = p => p.author.url || `https://x.com/${encodeURIComponent(p.author.handle)}`;
  function text(p) {
    return p.segs.map(s => {
      if (typeof s === "string") return esc(s);
      if (s.u) return `<a href="${esc(s.u)}" target="_blank" rel="noopener nofollow ugc">${esc(s.d)}</a>`;
      if (s.m && p.src !== "ts") return `<a href="https://x.com/${encodeURIComponent(s.m)}" target="_blank" rel="noopener nofollow">@${esc(s.m)}</a>`;
      if (s.c) { const c = coinFor(s.c);
        return c ? `<button type="button" class="po-tag${c === S.coin ? " on" : ""}" data-coin="${esc(c)}" title="Open ${esc(cname(c))}">$${esc(s.c)}</button>` : `<span class="po-cash">$${esc(s.c)}</span>`; }
      return "";
    }).join("");
  }
  function card(p) {
    const a = p.author, init = esc((a.name || a.handle).trim().charAt(0).toUpperCase());
    const av = a.avatar ? `<img class="po-av" src="${esc(a.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-init="${init}">`
                        : `<span class="po-av">${init}</span>`;
    const src = SRC[p.src] || SRC.x;
    const extras = [p.media ? `<a href="${esc(postUrl(p))}" target="_blank" rel="noopener">Photo</a>` : "", p.quote ? `<a href="${esc(postUrl(p))}" target="_blank" rel="noopener">Quoting a post</a>` : ""].filter(Boolean).join("");
    return `<article class="po${P.newIds && P.newIds.has(p.id) ? " new" : ""}">
      <a class="po-avl" href="${esc(whoUrl(p))}" target="_blank" rel="noopener" tabindex="-1">${av}</a>
      <div class="po-main">
        <div class="po-head"><a class="po-who" href="${esc(whoUrl(p))}" target="_blank" rel="noopener"><b>${esc(a.name)}</b>${a.verified ? TICK : ""}<span>@${esc(a.handle)}</span></a>
          <a class="po-time" href="${esc(postUrl(p))}" target="_blank" rel="noopener" title="${esc(when(p.at))}"><time datetime="${new Date(p.at).toISOString()}">${ago(p.at)}</time></a>
          <a class="po-x po-${p.src === "ts" ? "ts" : "xx"}" href="${esc(postUrl(p))}" target="_blank" rel="noopener" aria-label="Open this post on ${src.name}" title="On ${src.name}">${src.icon}</a></div>
        <p class="po-text">${text(p)}</p>${extras ? `<div class="po-extra">${extras}</div>` : ""}
      </div></article>`;
  }
  function render() {
    const el = $("#postsList"); if (!el) return;
    const stale = P.updated && Date.now() - P.updated > 5 * 60000;
    $("#poLive").className = "po-live" + (stale || P.err ? " off" : "");
    $("#poLive").lastChild.textContent = P.err ? " Offline" : stale ? " Paused" : " Live";
    $("#poLive").title = P.err ? P.err : P.updated ? "Checked " + ago(P.updated).replace(/^now$/, "just now") + (/\d/.test(ago(P.updated)) ? " ago" : "") : "";
    document.querySelectorAll("#poFilter [data-here]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.here === "1") === P.here)));
    const srcs = new Set(P.list.map(p => p.src || "x"));
    $("#poSrc").hidden = srcs.size < 2;                  // only worth showing when both sources have posts
    if (srcs.size < 2) P.src = "";
    document.querySelectorAll("#poSrc [data-src]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.src === P.src)));
    $("#poHere").textContent = S.coin ? cname(S.coin) : "This market";
    const list = P.list.filter(p => (!P.src || (p.src || "x") === P.src) && (!P.here || mentions(p, S.coin)));
    const top = el.scrollTop, oldH = el.scrollHeight, oldFirst = el.dataset.first;
    if (!P.list.length) el.innerHTML = `<div class="po-empty">${P.err ? esc(P.err) : "No posts in the last few days yet. New ones appear here as they're posted."}</div>`;
    else if (!list.length) el.innerHTML = `<div class="po-empty">Nothing${P.here ? " about " + esc(cname(S.coin)) : ""} lately${P.src ? " on " + SRC[P.src].name : ""} from the accounts Aureous follows.<button type="button" class="po-all" data-here="0" data-src="">Show all posts</button></div>`;
    else el.innerHTML = list.map(card).join("");
    el.dataset.first = list[0] ? list[0].id : "";
    // reading further down: keep your place when new posts arrive on top
    el.scrollTop = top > 40 && oldFirst && oldFirst !== el.dataset.first ? top + el.scrollHeight - oldH : top;
    P.newIds = null;
  }

  // a profile picture that won't load becomes the first letter of the name
  $("#postsList").addEventListener("error", e => {
    const img = e.target;
    if (img.tagName === "IMG" && img.classList.contains("po-av")) img.replaceWith(Object.assign(document.createElement("span"), {className: "po-av", textContent: img.dataset.init || ""}));
  }, true);
  $("#bkPosts").addEventListener("click", e => {
    const h = e.target.closest("[data-here],[data-src]");
    if (h) { if (h.dataset.here !== undefined) P.here = h.dataset.here === "1"; if (h.dataset.src !== undefined) P.src = h.dataset.src; render(); return; }
    const t = e.target.closest(".po-tag[data-coin]");
    if (t && S.mk[t.dataset.coin]) {
      selectCoin(t.dataset.coin);
      const chartBtn = document.querySelector('#mswitch [data-mv="chart"]');
      if (matchMedia("(max-width:899px)").matches && chartBtn) chartBtn.click();
      else render();
    }
  });
})();
