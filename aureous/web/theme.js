// Aureous display settings, shared by every page. Loaded in <head> so the chosen theme applies
// before anything is drawn. Settings are saved in this browser only.
(function () {
  "use strict";
  const KEY = "aureous.settings";
  const DEFAULTS = {theme: "dark", accent: "cobalt", prices: "classic", density: "comfortable", confirm: false, book: true};
  const BASE = {
    dark: {bg: "#0E131B", panel: "#121924", raise: "#19222F", line: "#232E3D", lineSoft: "#1B2431",
           text: "#D5DCE5", muted: "#7F8B9B", faint: "#58647A", crossLabel: "#2A3647", long: "#2FA57D", short: "#DB5A55", wash: .13},
    light: {bg: "#EDF0F4", panel: "#FFFFFF", raise: "#F2F4F7", line: "#D8DEE6", lineSoft: "#E8ECF1",
            text: "#17202B", muted: "#5A6575", faint: "#8B95A4", crossLabel: "#5A6575", long: "#168A63", short: "#CC423E", wash: .10},
  };
  const ACCENTS = {cobalt: "#5B8DEF", violet: "#8B78F0", teal: "#1FA595", amber: "#D8962A"};
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
    try { return {...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}")}; } catch { return {...DEFAULTS}; }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  const prefersLight = () => !!(window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
  const resolve = t => (t === "system" ? (prefersLight() ? "light" : "dark") : t === "light" ? "light" : "dark");

  /** Applies settings to the page and returns the resolved palette (for canvas/chart drawing). */
  function apply(s) {
    s = s || load();
    const theme = resolve(s.theme), b = BASE[theme];
    const [up, down] = (PRICES[s.prices] || PRICES.classic)(b);
    const accent = ACCENTS[s.accent] || ACCENTS.cobalt;
    const root = document.documentElement, st = root.style;
    const vars = {"--bg": b.bg, "--panel": b.panel, "--raise": b.raise, "--line": b.line, "--line-soft": b.lineSoft,
                  "--text": b.text, "--muted": b.muted, "--faint": b.faint, "--accent": accent, "--accent-wash": rgba(accent, b.wash - .01),
                  "--long": up, "--long-wash": rgba(up, b.wash), "--short": down, "--short-wash": rgba(down, b.wash)};
    for (const k in vars) st.setProperty(k, vars[k]);
    st.colorScheme = theme;
    root.dataset.theme = theme;
    root.dataset.density = s.density === "compact" ? "compact" : "comfortable";
    root.dataset.book = s.book === false ? "off" : "on";
    return {...b, theme, accent, long: up, short: down, longWash: rgba(up, .35), shortWash: rgba(down, .35)};
  }

  window.AureousSettings = {DEFAULTS, ACCENTS, load, save, apply, resolve};
  apply();
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (load().theme === "system") { apply(); window.dispatchEvent(new Event("aureous-settings")); }
    });
  }
})();
