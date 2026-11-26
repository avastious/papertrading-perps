// Aureous display settings, shared by every page. Loaded in <head> so the chosen theme applies
// before anything is drawn. Settings are saved in this browser only.
(function () {
  "use strict";
  const KEY = "aureous.settings";
  const DEFAULTS = {theme: "dark", accent: "aureus", prices: "classic", density: "comfortable", confirm: false, book: true};
  const BASE = {
    dark: {bg: "#0C0D10", panel: "#131418", raise: "#1B1D22", line: "#272A31", lineSoft: "#1E2026",
           text: "#ECE8E1", muted: "#9B978F", faint: "#67645E", crossLabel: "#2B2E35", long: "#26B58A", short: "#E5575E", wash: .13, gold: "#D1A85A"},
    light: {bg: "#ECEDEF", panel: "#FFFFFF", raise: "#F3F4F6", line: "#DADDE2", lineSoft: "#E9EBEE",
            text: "#16171A", muted: "#5D6168", faint: "#8E929A", crossLabel: "#5D6168", long: "#12936A", short: "#D23F48", wash: .10, gold: "#A9802F"},
  };
  // "aureus" is the house gold; Tyrian purple (the emperors' colour) is earned on the leaderboard
  const ACCENTS = {aureus: "#D1A85A", cobalt: "#5B8DEF", teal: "#1FA595", violet: "#8B78F0", tyrian: "#C2508F"};
  const LIGHT = {aureus: "#A57F33"};                 // deeper gold so it reads on white
  const OLD = {gold: "aureus", amber: "aureus"};       // accents that were renamed
  // accents earned on the leaderboard: name -> badge needed
  const EARNED = {tyrian: "denarius"};
  const PRICES = {
    classic: b => [b.long, b.short],            // green up, red down
    inverted: b => [b.short, b.long],           // red up, green down (common in East Asian markets)
    colorblind: () => ["#3B8BF6", "#EC8A2C"],   // blue up, orange down
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  function load() {
    let s;
    try { s = {...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}")}; } catch { return {...DEFAULTS}; }
    if (OLD[s.accent]) s.accent = OLD[s.accent];
    if (!s.v) { if (s.accent === "cobalt") s.accent = "aureus"; s.v = 2; }   // cobalt was the old default: move to the new house colour
    return s;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify({...s, v: 2})); } catch {} }
  // dark or white text, whichever reads better on the accent
  const lum = hex => { const n = parseInt(hex.slice(1), 16), f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
    return .2126 * f(n >> 16) + .7152 * f((n >> 8) & 255) + .0722 * f(n & 255); };
  const onColor = hex => ((lum(hex) + .05) / .05 > 1.05 / (lum(hex) + .05) ? "#17130B" : "#FFFFFF");
  const prefersLight = () => !!(window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
  const resolve = t => (t === "system" ? (prefersLight() ? "light" : "dark") : t === "light" ? "light" : "dark");

  /** Applies settings to the page and returns the resolved palette (for canvas/chart drawing). */
  function apply(s) {
    s = s || load();
    const theme = resolve(s.theme), b = BASE[theme];
    const [up, down] = (PRICES[s.prices] || PRICES.classic)(b);
    let accent = ACCENTS[s.accent] || ACCENTS.aureus;
    if (theme === "light" && LIGHT[s.accent in ACCENTS ? s.accent : "aureus"]) accent = LIGHT[s.accent in ACCENTS ? s.accent : "aureus"];
    const root = document.documentElement, st = root.style;
    const vars = {"--bg": b.bg, "--panel": b.panel, "--raise": b.raise, "--line": b.line, "--line-soft": b.lineSoft,
                  "--text": b.text, "--muted": b.muted, "--faint": b.faint, "--accent": accent, "--accent-wash": rgba(accent, b.wash - .01), "--on-accent": onColor(accent), "--gold": b.gold,
                  "--long": up, "--long-wash": rgba(up, b.wash), "--short": down, "--short-wash": rgba(down, b.wash)};
    for (const k in vars) st.setProperty(k, vars[k]);
    st.colorScheme = theme;
    root.dataset.theme = theme;
    root.dataset.density = s.density === "compact" ? "compact" : "comfortable";
    root.dataset.book = s.book === false ? "off" : "on";
    return {...b, theme, accent, long: up, short: down, longWash: rgba(up, .35), shortWash: rgba(down, .35)};
  }

  window.AureousSettings = {DEFAULTS, ACCENTS, EARNED, load, save, apply, resolve};
  apply();
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (load().theme === "system") { apply(); window.dispatchEvent(new Event("aureous-settings")); }
    });
  }
})();
