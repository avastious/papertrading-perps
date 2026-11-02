/* Aureous chart drawing tools (TradingView-style) for Lightweight Charts.
 *
 * Tools: trend line, ray, extended line, horizontal line, vertical line, rectangle, Fibonacci
 * retracement, measure (price range), text. Click a drawing to select it, drag its handles or its
 * body to move it, change its colour or delete it. Ctrl/Cmd+Z undoes; Delete removes; Esc cancels.
 * Drawings are kept per market in this browser and are anchored to time and price, so they stay put
 * when you switch timeframes.
 *
 * Usage (index.html): AureousDraw.create({chart, series, wrap, bar, panel, candles, intervalMs, toChartTime,
 *                                         coin, fmt, store, accent})
 */
(function (root) {
  "use strict";
  const TOOLS = [
    {id: "cursor", label: "Cursor (Esc)", icon: '<path d="M5 3l14 8-6 1.5L10 19z"/>'},
    {id: "trend", label: "Trend line (Alt+T)", pts: 2, icon: '<path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>'},
    {id: "ray", label: "Ray", pts: 2, ext: "right", icon: '<path d="M4 19L21 4"/><circle cx="4" cy="19" r="1.6"/><circle cx="11" cy="13" r="1.6"/>'},
    {id: "extended", label: "Extended line", pts: 2, ext: "both", icon: '<path d="M2 21L22 3"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="9" r="1.6"/>'},
    {id: "hline", label: "Horizontal line (Alt+H)", pts: 1, icon: '<path d="M2 12h20"/><circle cx="12" cy="12" r="1.6"/>'},
    {id: "vline", label: "Vertical line (Alt+V)", pts: 1, icon: '<path d="M12 2v20"/><circle cx="12" cy="12" r="1.6"/>'},
    {id: "rect", label: "Rectangle (Alt+R)", pts: 2, icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>'},
    {id: "fib", label: "Fibonacci retracement (Alt+F)", pts: 2, icon: '<path d="M3 5h18M3 9.5h18M3 13h18M3 16h18M3 20h18"/>'},
    {id: "range", label: "Measure (Alt+M)", pts: 2, icon: '<path d="M4 20V4M20 20V4M4 12h16M15 8l4 4-4 4"/>'},
    {id: "text", label: "Text", pts: 1, icon: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'},
  ];
  const BY_ID = Object.fromEntries(TOOLS.map(t => [t.id, t]));
  const COLORS = ["#5B8DEF", "#E3B341", "#2FA57D", "#DB5A55", "#B48CF2", "#E6EBF1"];
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const HIT = 6, HANDLE = 8, MAX_PER_COIN = 300, UNDO = 50;
  const svg = (body, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const distSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function create(o) {
    const {chart, series, wrap} = o;
    const ts = chart.timeScale();
    const st = {tool: "cursor", list: [], sel: null, draft: null, drag: null, hidden: false, magnet: !!o.store.get("drawMagnet", false),
                color: o.store.get("drawColor", COLORS[0]), undo: [], coin: null, request: () => {}};

    // ---------------------------------------------------------------- time <-> x
    // Points are stored as real time (ms) and price, mapped through the bar index so they work on any
    // timeframe, between bars and in the empty space to the right of the last candle.
    function logicalOf(t) {
      const c = o.candles(), d = o.intervalMs();
      if (!c.length) return null;
      if (t <= c[0][0]) return (t - c[0][0]) / d;
      const n = c.length - 1;
      if (t >= c[n][0]) return n + (t - c[n][0]) / d;
      let lo = 0, hi = n;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid][0] <= t) lo = mid; else hi = mid; }
      return lo + (t - c[lo][0]) / Math.max(1, c[hi][0] - c[lo][0]);
    }
    function timeOf(logical) {
      const c = o.candles(), d = o.intervalMs();
      if (!c.length || logical == null) return null;
      const n = c.length - 1;
      if (logical <= 0) return c[0][0] + logical * d;
      if (logical >= n) return c[n][0] + (logical - n) * d;
      const i = Math.floor(logical);
      return c[i][0] + (logical - i) * (c[i + 1][0] - c[i][0]);
    }
    // The chart converts only whole bar positions, so positions between bars are interpolated.
    const xOfLogical = l => {
      const i = Math.floor(l), f = l - i, x0 = ts.logicalToCoordinate(i);
      if (x0 == null || f < 1e-9) return x0;
      const x1 = ts.logicalToCoordinate(i + 1);
      return x1 == null ? x0 : x0 + (x1 - x0) * f;
    };
    const xOf = t => { const l = logicalOf(t); return l == null ? null : xOfLogical(l); };
    const yOf = p => series.priceToCoordinate(p);
    function pointAt(x, y, snap = st.magnet) {
      const l = ts.coordinateToLogical(x), t = timeOf(l);
      let p = series.coordinateToPrice(y);
      if (t == null || p == null) return null;
      if (snap) {                                       // magnet: the nearest open/high/low/close of the bar under the pointer
        const c = o.candles(), i = Math.round(l);
        if (c[i]) {
          let best = null, bd = 1e9;
          for (const v of [c[i][1], c[i][2], c[i][3], c[i][4]]) { const d = Math.abs(yOf(v) - y); if (d < bd) { bd = d; best = v; } }
          if (bd < 30) return {t: c[i][0], p: best};
        }
      }
      return {t, p};
    }

    // ---------------------------------------------------------------- storage + undo
    const key = () => "draw:" + st.coin;
    function save() { o.store.set(key(), st.list.slice(-MAX_PER_COIN)); }
    function snapshot() { st.undo.push(JSON.stringify(st.list)); if (st.undo.length > UNDO) st.undo.shift(); }
    function changed(keepSel) { save(); if (!keepSel && st.sel && !st.list.find(d => d.id === st.sel)) st.sel = null; renderPanel(); st.request(); }
    function setCoin(coin) {
      st.coin = coin; st.list = o.store.get(key(), []) || []; st.sel = null; st.draft = null; st.undo = [];
      renderPanel(); st.request();
    }

    // ---------------------------------------------------------------- geometry per drawing (media px)
    function geom(d, W, H) {
      const pts = d.pts.map(q => ({x: xOf(q.t), y: yOf(q.p)}));
      if (pts.some(q => q.x == null || q.y == null)) return null;
      return {pts, W, H};
    }
    function lineEnds(d, a, b, W) {
      let [x1, y1, x2, y2] = [a.x, a.y, b.x, b.y];
      const ext = d.ext || "none";
      if (ext !== "none" && (x1 !== x2 || y1 !== y2)) {
        const dx = x2 - x1, dy = y2 - y1;
        const far = (W * 4 + Math.abs(dy) * 4) / Math.max(1e-6, Math.hypot(dx, dy)) * 1000;
        if (ext === "right" || ext === "both") { x2 = x1 + dx * far; y2 = y1 + dy * far; }
        if (ext === "both") { x1 = a.x - dx * far; y1 = a.y - dy * far; }
      }
      return [x1, y1, x2, y2];
    }
    function hit(d, x, y, W, H) {                     // -> {part: index of handle | "body"} or null
      const g = geom(d, W, H); if (!g) return null;
      const P = g.pts;
      for (let i = 0; i < P.length; i++) {
        const hx = d.type === "hline" ? Math.min(W - 40, Math.max(40, x)) : P[i].x, hy = d.type === "vline" ? y : P[i].y;
        if (d.type !== "hline" && d.type !== "vline" && Math.hypot(x - hx, y - hy) <= HANDLE) return {part: i};
      }
      if (d.type === "hline") return Math.abs(y - P[0].y) <= HIT ? {part: "body"} : null;
      if (d.type === "vline") return Math.abs(x - P[0].x) <= HIT ? {part: "body"} : null;
      if (d.type === "text") { const w = (d.text || "").length * 7.5 + 12; return x >= P[0].x - 4 && x <= P[0].x + w && y >= P[0].y - 18 && y <= P[0].y + 6 ? {part: "body"} : null; }
      const [a, b] = P;
      if (d.type === "fib") {                         // only its level lines and diagonal, so things under it stay clickable
        const l = Math.min(a.x, b.x) - HIT, r = Math.max(a.x, b.x) + HIT;
        if (x < l || x > r) return null;
        const p1 = d.pts[0].p, p2 = d.pts[1].p;
        if (FIB.some(lv => { const yy = yOf(p2 + (p1 - p2) * lv); return yy != null && Math.abs(y - yy) <= HIT; })) return {part: "body"};
        return distSeg(x, y, a.x, a.y, b.x, b.y) <= HIT ? {part: "body"} : null;
      }
      if (d.type === "rect" || d.type === "range") {
        const l = Math.min(a.x, b.x), r = Math.max(a.x, b.x), t = Math.min(a.y, b.y), bo = Math.max(a.y, b.y);
        return x >= l - HIT && x <= r + HIT && y >= t - HIT && y <= bo + HIT ? {part: "body"} : null;
      }
      const [x1, y1, x2, y2] = lineEnds(d, a, b, W);
      return distSeg(x, y, x1, y1, x2, y2) <= HIT ? {part: "body"} : null;
    }

    // ---------------------------------------------------------------- drawing
    function drawOne(ctx, d, W, H, selected) {
      const g = geom(d, W, H); if (!g) return;
      const P = g.pts, col = d.color || COLORS[0];
      ctx.save();
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = selected ? 2 : 1.5;
      ctx.font = "11.5px 'IBM Plex Sans', system-ui, sans-serif"; ctx.textBaseline = "middle";
      const label = (txt, x, y, align = "left", bg = "rgba(14,19,27,.85)") => {
        const w = ctx.measureText(txt).width;
        const lx = align === "center" ? x - w / 2 - 5 : align === "right" ? x - w - 10 : x;
        ctx.fillStyle = bg; ctx.fillRect(lx, y - 9, w + 10, 18);
        ctx.fillStyle = col; ctx.textAlign = "left"; ctx.fillText(txt, lx + 5, y);
      };
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      if (d.type === "hline") {
        line(0, P[0].y, W, P[0].y);
      } else if (d.type === "vline") {
        line(P[0].x, 0, P[0].x, H);
      } else if (d.type === "text") {
        ctx.font = "13px 'IBM Plex Sans', system-ui, sans-serif"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = col; ctx.fillText(d.text || "", P[0].x, P[0].y);
        if (selected) { const w = ctx.measureText(d.text || "").width; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeRect(P[0].x - 4, P[0].y - 16, w + 8, 21); }
      } else if (P.length === 2) {
        const [a, b] = P;
        if (d.type === "rect") {
          ctx.fillStyle = alpha(col, .12); ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        } else if (d.type === "fib") {
          const l = Math.min(a.x, b.x), r = Math.max(a.x, b.x), p1 = d.pts[0].p, p2 = d.pts[1].p;
          FIB.forEach((lv, i) => {
            const price = p2 + (p1 - p2) * lv, y = yOf(price);
            if (y == null) return;
            if (i < FIB.length - 1) {
              const yn = yOf(p2 + (p1 - p2) * FIB[i + 1]);
              if (yn != null) { ctx.fillStyle = alpha(col, i % 2 ? .05 : .10); ctx.fillRect(l, Math.min(y, yn), r - l, Math.abs(yn - y)); }
            }
            ctx.globalAlpha = lv === 0 || lv === 1 ? 1 : .8; line(l, y, r, y); ctx.globalAlpha = 1;
            label(`${lv} (${o.fmt(price)})`, l + 4, y - 10);
          });
          ctx.setLineDash([4, 4]); ctx.lineWidth = 1; line(a.x, a.y, b.x, b.y); ctx.setLineDash([]);
        } else if (d.type === "range") {
          const up = d.pts[1].p >= d.pts[0].p, c2 = up ? "#2FA57D" : "#DB5A55";
          ctx.fillStyle = alpha(c2, .15); ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.strokeStyle = c2; const mx = (a.x + b.x) / 2;
          line(mx, a.y, mx, b.y); line(mx - 5, b.y + (up ? 6 : -6), mx, b.y); line(mx + 5, b.y + (up ? 6 : -6), mx, b.y);
          const dp = d.pts[1].p - d.pts[0].p, pc = dp / d.pts[0].p * 100;
          const bars = Math.round((logicalOf(d.pts[1].t) - logicalOf(d.pts[0].t)) * 10) / 10;
          const ms = Math.abs(d.pts[1].t - d.pts[0].t), dur = ms >= 864e5 ? `${(ms / 864e5).toFixed(1).replace(/\.0$/, "")}d` : ms >= 36e5 ? `${(ms / 36e5).toFixed(1).replace(/\.0$/, "")}h` : `${Math.round(ms / 6e4)}m`;
          const txt = `${dp >= 0 ? "+" : "-"}${o.fmt(Math.abs(dp))} (${pc >= 0 ? "+" : ""}${pc.toFixed(2)}%) · ${Math.abs(bars)} bars, ${dur}`;
          ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif";
          const ly = up ? Math.min(a.y, b.y) - 14 : Math.max(a.y, b.y) + 14;
          const w = ctx.measureText(txt).width;
          ctx.fillStyle = c2; ctx.fillRect(mx - w / 2 - 7, ly - 10, w + 14, 20);
          ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(txt, mx, ly);
        } else {
          const [x1, y1, x2, y2] = lineEnds(d, a, b, W); line(x1, y1, x2, y2);
        }
      }
      if (selected || (st.draft && st.draft.d === d)) {
        const hp = d.type === "hline" ? [{x: Math.max(20, Math.min(W / 2, W - 20)), y: P[0].y}] : d.type === "vline" ? [{x: P[0].x, y: H / 2}] : P;
        for (const q of hp) { ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#0E131B"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke(); }
      }
      ctx.restore();
    }
    const renderer = {
      draw(target) {
        if (st.hidden) return;
        target.useMediaCoordinateSpace(({context: ctx, mediaSize: {width: W, height: H}}) => {
          for (const d of st.list) drawOne(ctx, d, W, H, d.id === st.sel);
          if (st.draft) drawOne(ctx, st.draft.d, W, H, true);
        });
      },
    };
    const paneView = {renderer: () => renderer, zOrder: () => "top"};
    // price-axis labels for horizontal lines and the selected drawing's points
    function axisViews() {
      if (st.hidden) return [];
      const out = [];
      const add = (d, p) => out.push({coordinate: () => yOf(p) ?? -100, text: () => o.fmt(p), textColor: () => "#0E131B", backColor: () => d.color || COLORS[0], visible: () => true, tickVisible: () => true});
      for (const d of st.list) {
        if (d.type === "hline") add(d, d.pts[0].p);
        else if (d.id === st.sel && d.type !== "vline" && d.type !== "text") d.pts.forEach(q => add(d, q.p));
      }
      if (st.draft && st.draft.d.type !== "vline") st.draft.d.pts.forEach(q => add(st.draft.d, q.p));
      return out;
    }
    const primitive = {
      attached({requestUpdate}) { st.request = requestUpdate; },
      detached() { st.request = () => {}; },
      updateAllViews() {},
      paneViews: () => [paneView],
      priceAxisViews: axisViews,
      hitTest(x, y) {                                   // pointer cursor over drawings (the chart asks this)
        if (st.hidden || st.tool !== "cursor") return null;
        const W = wrap.clientWidth, H = wrap.clientHeight;
        for (let i = st.list.length - 1; i >= 0; i--) { const h = hit(st.list[i], x, y, W, H); if (h) return {cursorStyle: h.part === "body" ? "move" : "pointer", externalId: st.list[i].id, zOrder: "top"}; }
        return null;
      },
    };
    series.attachPrimitive(primitive);

    // ---------------------------------------------------------------- pointer handling
    const chartEl = o.chartEl;
    const local = e => { const r = chartEl.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top, W: chart.paneSize ? chart.paneSize().width : r.width, H: r.height}; };
    const freezeChart = on => chart.applyOptions({handleScroll: on ? false : o.scrollOpts, handleScale: on ? false : o.scaleOpts});
    function finishDraft() {
      const d = st.draft.d; st.draft = null;
      if (d.type === "text") {
        const t = (prompt("Text:", "") || "").trim().slice(0, 120);
        if (!t) { freezeChart(false); setTool("cursor"); st.request(); return; }
        d.text = t;
      }
      snapshot(); st.list.push(d); st.sel = d.id;
      freezeChart(false); setTool("cursor"); changed(true);
    }
    chartEl.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const {x, y, W, H} = local(e);
      if (y > chartEl.clientHeight - 28 || x > (chart.paneSize ? chart.paneSize().width : chartEl.clientWidth)) return;   // axes
      if (st.tool !== "cursor") {
        const p = pointAt(x, y); if (!p) return;
        e.stopPropagation();
        const tool = BY_ID[st.tool];
        if (!st.draft) {
          const d = {id: uid(), type: tool.ext ? "trend" : tool.id, ext: tool.ext || undefined, color: st.color, pts: [p]};
          if (tool.pts === 1) { st.draft = {d}; finishDraft(); return; }
          d.pts.push({...p}); st.draft = {d, start: {x, y}};
          st.request(); return;
        }
        st.draft.d.pts[1] = p; finishDraft(); return;
      }
      if (st.hidden) return;
      for (let i = st.list.length - 1; i >= 0; i--) {
        const d = st.list[i], h = hit(d, x, y, W, H);
        if (!h) continue;
        e.stopPropagation();
        st.sel = d.id; freezeChart(true); snapshot();
        st.drag = {d, part: h.part, from: pointAt(x, y, false), orig: d.pts.map(q => ({...q})), moved: false};
        chartEl.setPointerCapture(e.pointerId);
        renderPanel(); st.request(); return;
      }
      if (st.sel) { st.sel = null; renderPanel(); st.request(); }
    }, true);
    chartEl.addEventListener("pointermove", e => {
      const {x, y} = local(e);
      if (st.draft && st.draft.d.pts.length === 2) {
        const p = pointAt(x, y);
        if (p) { st.draft.d.pts[1] = p; st.request(); }
        return;
      }
      if (!st.drag) return;
      const {d, part, from, orig} = st.drag;
      if (part === "body") {
        const now = pointAt(x, y, false); if (!now || !from) return;
        const dt = now.t - from.t, dp = now.p - from.p;
        d.pts = orig.map(q => ({t: d.type === "hline" ? q.t : q.t + dt, p: d.type === "vline" ? q.p : q.p + dp}));
      } else {
        const p = pointAt(x, y); if (!p) return;
        d.pts[part] = p;
      }
      st.drag.moved = true; st.request();
    }, true);
    const endDrag = () => {
      if (!st.drag) return;
      if (!st.drag.moved) st.undo.pop();               // a click, not a move: nothing to undo
      st.drag = null; freezeChart(false); changed(true);
    };
    chartEl.addEventListener("pointerup", endDrag, true);
    chartEl.addEventListener("pointercancel", endDrag, true);
    chartEl.addEventListener("dblclick", e => {        // double-click a text note to edit it
      const {x, y, W, H} = local(e);
      const d = st.list.slice().reverse().find(q => hit(q, x, y, W, H));
      if (!d) return;
      e.stopPropagation(); e.preventDefault();
      if (d.type === "text") { const t = prompt("Text:", d.text || ""); if (t != null && t.trim()) { snapshot(); d.text = t.trim().slice(0, 120); changed(true); } }
    }, true);
    document.addEventListener("keydown", e => {
      if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") { if (st.draft) { st.draft = null; freezeChart(false); } setTool("cursor"); if (st.sel) { st.sel = null; renderPanel(); } st.request(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && st.sel) { e.preventDefault(); removeSel(); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && st.undo.length) {
        e.preventDefault(); st.list = JSON.parse(st.undo.pop()); changed(); return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = {t: "trend", h: "hline", v: "vline", r: "rect", f: "fib", m: "range"}[e.code.replace(/^Key/, "").toLowerCase()];
        if (k) { e.preventDefault(); setTool(k); }
      }
    });

    // ---------------------------------------------------------------- toolbar + selected-drawing panel
    function setTool(id) {
      st.tool = id;
      if (st.draft && id === "cursor") st.draft = null;
      freezeChart(id !== "cursor");
      o.bar.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === id));
      chartEl.classList.toggle("drawing", id !== "cursor");
      st.request();
    }
    function removeSel() { snapshot(); st.list = st.list.filter(d => d.id !== st.sel); st.sel = null; changed(); }
    o.bar.innerHTML = TOOLS.map(t => `<button type="button" data-tool="${t.id}" title="${t.label}" aria-label="${t.label}">${svg(t.icon)}</button>`).join("") +
      `<span class="draw-sep"></span>` +
      `<button type="button" data-act="magnet" title="Magnet: snap to candle open, high, low and close" aria-label="Magnet">${svg('<path d="M6 3v9a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>')}</button>` +
      `<button type="button" data-act="hide" title="Hide drawings" aria-label="Hide drawings">${svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}</button>` +
      `<button type="button" data-act="clear" title="Delete all drawings on this market" aria-label="Delete all drawings">${svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button>`;
    const renderBar = () => {
      o.bar.querySelector('[data-act="magnet"]').classList.toggle("on", st.magnet);
      o.bar.querySelector('[data-act="hide"]').classList.toggle("on", st.hidden);
      o.bar.querySelector('[data-act="hide"]').title = st.hidden ? "Show drawings" : "Hide drawings";
    };
    o.bar.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tool) { setTool(st.tool === b.dataset.tool && b.dataset.tool !== "cursor" ? "cursor" : b.dataset.tool); return; }
      if (b.dataset.act === "magnet") { st.magnet = !st.magnet; o.store.set("drawMagnet", st.magnet); renderBar(); }
      if (b.dataset.act === "hide") { st.hidden = !st.hidden; st.sel = null; renderBar(); renderPanel(); st.request(); }
      if (b.dataset.act === "clear" && st.list.length && confirm(`Delete all ${st.list.length} drawing${st.list.length === 1 ? "" : "s"} on this market? (Ctrl+Z brings them back.)`)) {
        snapshot(); st.list = []; changed();
      }
    });
    function renderPanel() {
      const d = st.list.find(q => q.id === st.sel), pnl = o.panel;
      if (!d || st.hidden) { pnl.hidden = true; return; }
      pnl.hidden = false;
      const ext = d.type === "trend" ? `<button type="button" data-ext title="Extend the line">${{none: "Segment", right: "Ray", both: "Extended"}[d.ext || "none"]}</button>` : "";
      const txt = d.type === "text" ? `<button type="button" data-edit>Edit text</button>` : "";
      pnl.innerHTML = COLORS.map(c => `<button type="button" class="sw${(d.color || COLORS[0]) === c ? " on" : ""}" data-color="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join("") +
        ext + txt + `<button type="button" data-del title="Delete (Del)" aria-label="Delete drawing">${svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 15)}</button>`;
    }
    o.panel.addEventListener("click", e => {
      const b = e.target.closest("button"), d = st.list.find(q => q.id === st.sel); if (!b || !d) return;
      if (b.dataset.color) { snapshot(); d.color = b.dataset.color; st.color = d.color; o.store.set("drawColor", st.color); changed(true); }
      if (b.dataset.ext !== undefined) { snapshot(); d.ext = {none: "right", right: "both", both: "none"}[d.ext || "none"]; changed(true); }
      if (b.dataset.edit !== undefined) { const t = prompt("Text:", d.text || ""); if (t != null && t.trim()) { snapshot(); d.text = t.trim().slice(0, 120); changed(true); } }
      if (b.dataset.del !== undefined) removeSel();
    });
    renderBar(); setTool("cursor");

    return {
      setCoin, refresh: () => st.request(),
      get count() { return st.list.length; },
      _state: st,                                      // for tests
    };
  }

  root.AureousDraw = {create, TOOLS, COLORS};
})(typeof window !== "undefined" ? window : globalThis);
