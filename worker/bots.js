// Aureous bots: 20 house accounts that trade on real Hyperliquid prices with simple, published
// strategies. They live in the same database as everyone else, use the same engine, fees, funding
// and liquidation rules, and show on the leaderboard with a BOT tag so nobody mistakes them for people.
//
// Each minute (the cron job) every bot "wakes up" with probability `wake`, looks at one of its
// markets and may open, close or flip a position. Bots that blow up reset themselves to $10,000
// (their profile shows the reset count, the same as anyone else's).

export const BOT_PREFIX = "bot:";
export const isBot = uid => typeof uid === "string" && uid.startsWith(BOT_PREFIX);

// style: trend | breakout | meanrev | contrarian | momentum | hold | dips | funding | degen | scalp | short | index
// risk: share of account value used as margin per new position; tp/sl: % move from entry (null = none);
// hold: max minutes to keep a position; max: most positions at once
export const BOTS = [
  {id: "cato",      name: "Cato",      style: "trend",      coins: ["BTC"],                      lev: 5,  risk: .35, tp: 4,   sl: 2,   hold: 2880, max: 1, wake: .25},
  {id: "scipio",    name: "Scipio",    style: "trend",      coins: ["ETH", "SOL"],               lev: 8,  risk: .25, tp: 5,   sl: 2.5, hold: 2160, max: 2, wake: .25},
  {id: "hadrian",   name: "Hadrian",   style: "trend",      coins: ["BTC", "ETH", "SOL", "HYPE"], lev: 3,  risk: .2,  tp: null, sl: 4,  hold: 4320, max: 3, wake: .2},
  {id: "marius",    name: "Marius",    style: "breakout",   coins: ["BTC"],                      lev: 10, risk: .3,  tp: 3,   sl: 1.2, hold: 720,  max: 1, wake: .3},
  {id: "sulla",     name: "Sulla",     style: "breakout",   coins: ["HYPE", "SOL"],              lev: 10, risk: .25, tp: 6,   sl: 2.5, hold: 720,  max: 2, wake: .3},
  {id: "crassus",   name: "Crassus",   style: "breakout",   coins: ["ETH"],                      lev: 15, risk: .3,  tp: 2.5, sl: 1,   hold: 480,  max: 1, wake: .3},
  {id: "seneca",    name: "Seneca",    style: "meanrev",    coins: ["BTC", "ETH"],               lev: 5,  risk: .3,  tp: 1.5, sl: 2,   hold: 360,  max: 2, wake: .3},
  {id: "cicero",    name: "Cicero",    style: "meanrev",    coins: ["XRP", "LINK", "AVAX"],      lev: 5,  risk: .2,  tp: 2.5, sl: 3,   hold: 480,  max: 3, wake: .25},
  {id: "livia",     name: "Livia",     style: "meanrev",    coins: ["SOL"],                      lev: 10, risk: .3,  tp: 1.5, sl: 1.5, hold: 240,  max: 1, wake: .35},
  {id: "brutus",    name: "Brutus",    style: "contrarian", coins: ["BTC", "ETH"],               lev: 7,  risk: .3,  tp: 2,   sl: 2,   hold: 600,  max: 1, wake: .25},
  {id: "cassius",   name: "Cassius",   style: "contrarian", coins: ["kPEPE", "DOGE"],            lev: 5,  risk: .25, tp: 5,   sl: 5,   hold: 720,  max: 2, wake: .25},
  {id: "augustus",  name: "Augustus",  style: "hold",       coins: ["BTC"],                      lev: 2,  risk: .9,  tp: null, sl: null, hold: 0,  max: 1, wake: .15},
  {id: "trajan",    name: "Trajan",    style: "dips",       coins: ["ETH"],                      lev: 3,  risk: .45, tp: 6,   sl: null, hold: 0,   max: 1, wake: .2},
  {id: "octavia",   name: "Octavia",   style: "funding",    coins: ["BTC", "ETH", "SOL", "HYPE", "DOGE", "SUI", "kPEPE"], lev: 3, risk: .25, tp: null, sl: 4, hold: 1440, max: 2, wake: .2},
  {id: "nero",      name: "Nero",      style: "degen",      coins: ["BTC", "ETH", "SOL", "HYPE", "DOGE", "kPEPE", "SUI"], lev: 40, risk: .5, tp: 3, sl: null, hold: 90, max: 1, wake: .4},
  {id: "fabius",    name: "Fabius",    style: "momentum",   coins: ["BTC", "ETH", "SOL"],        lev: 6,  risk: .25, tp: 4,   sl: 2,   hold: 1440, max: 2, wake: .2},
  {id: "drusus",    name: "Drusus",    style: "momentum",   coins: ["HYPE"],                     lev: 5,  risk: .35, tp: 7,   sl: 3.5, hold: 1440, max: 1, wake: .25},
  {id: "gracchus",  name: "Gracchus",  style: "short",      coins: ["SOL", "DOGE", "SUI", "AVAX"], lev: 4, risk: .2, tp: 6,   sl: 3,   hold: 2880, max: 3, wake: .2},
  {id: "pompey",    name: "Pompey",    style: "scalp",      coins: ["BTC"],                      lev: 20, risk: .3,  tp: .6,  sl: .4,  hold: 45,   max: 1, wake: .45},
  {id: "vespasian", name: "Vespasian", style: "index",      coins: ["BTC", "ETH", "SOL"],        lev: 2,  risk: .3,  tp: null, sl: null, hold: 0,  max: 3, wake: .1},
];
export const BOT_BY_UID = new Map(BOTS.map(b => [BOT_PREFIX + b.id, b]));

const STYLE_TEXT = {
  trend: "Trend follower: goes with the 15-minute moving-average crossover",
  breakout: "Breakout trader: buys new 5-hour highs, sells new lows",
  meanrev: "Mean reversion: fades stretched moves back to the average",
  contrarian: "Contrarian: bets against the last 4 hours' move",
  momentum: "Momentum: rides whichever way the last 4 hours went",
  hold: "Holder: stays long and never sells",
  dips: "Dip buyer: only buys below the average, sells into strength",
  funding: "Funding harvester: takes the side that gets paid funding",
  degen: "Degen: random coin, random side, maximum leverage",
  scalp: "Scalper: tiny targets, tight stops, high leverage",
  short: "Short seller: shorts weak altcoins",
  index: "Index: holds a long BTC, ETH and SOL basket",
};
export function describe(bot) {
  const coins = bot.coins.length > 4 ? "Majors and memecoins" : bot.coins.join(", ");
  return `${STYLE_TEXT[bot.style]}. ${coins}, up to ${bot.lev}x.`;
}

// ---------------------------------------------------------------- indicators
const ema = (xs, n) => { const k = 2 / (n + 1); let e = xs[0]; for (const x of xs) e = x * k + e * (1 - k); return e; };
const sma = (xs, n) => { const s = xs.slice(-n); return s.reduce((a, b) => a + b, 0) / s.length; };
const sd = (xs, n) => { const s = xs.slice(-n), m = sma(s, n); return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length); };
const pick = xs => xs[Math.floor(Math.random() * xs.length)];

// +1 long, -1 short, 0 nothing; `c` is {close[], high[], low[]} of 15-minute candles ending with the live mark
function signal(bot, c, m) {
  const cl = c && c.close, last = cl && cl[cl.length - 1];
  switch (bot.style) {
    case "trend": return ema(cl.slice(-60), 9) > ema(cl.slice(-60), 21) ? 1 : -1;
    case "breakout": {
      const hi = Math.max(...c.high.slice(-21, -1)), lo = Math.min(...c.low.slice(-21, -1));
      return last > hi ? 1 : last < lo ? -1 : 0;
    }
    case "meanrev": { const z = (last - sma(cl, 20)) / (sd(cl, 20) || 1); return z < -1.6 ? 1 : z > 1.6 ? -1 : 0; }
    case "contrarian": { const r = last / cl[cl.length - 17] - 1; return r > .012 ? -1 : r < -.012 ? 1 : 0; }
    case "momentum": { const r = last / cl[cl.length - 17] - 1; return r > .008 ? 1 : r < -.008 ? -1 : 0; }
    case "dips": return last < sma(cl, 48) * .99 ? 1 : 0;
    case "short": return last < sma(cl, 50) && ema(cl.slice(-40), 9) < ema(cl.slice(-40), 21) ? -1 : 0;
    case "scalp": { const r = last / cl[cl.length - 3] - 1; return r > .002 ? 1 : r < -.002 ? -1 : 0; }
    case "funding": return Math.abs(m.funding) > 0.000008 ? (m.funding > 0 ? -1 : 1) : 0;
    case "degen": return Math.random() < .5 ? 1 : -1;
    case "hold": case "index": return 1;
  }
  return 0;
}
const NEEDS_CANDLES = new Set(["trend", "breakout", "meanrev", "contrarian", "momentum", "dips", "short", "scalp"]);

// Decide what one bot does this minute. Returns [{path, body}] for LocalApp.handle.
// `candles(coin)` gives {close, high, low} or null when no data is available this minute.
export async function decide(bot, ex, candles, now = Date.now()) {
  const positions = ex.state.positions, mine = Object.keys(positions);
  let coin;
  if (bot.style === "funding") {
    // the market paying the most funding right now, or one we already hold
    const ranked = bot.coins.filter(c => { try { ex.market(c); return true; } catch { return false; } })
      .sort((a, b) => Math.abs(ex.market(b).funding) - Math.abs(ex.market(a).funding));
    coin = mine.length && Math.random() < .5 ? pick(mine) : ranked[0];
  } else if (bot.style === "index") {
    coin = bot.coins.find(c => !positions[c]) || pick(bot.coins);
  } else {
    coin = mine.length && Math.random() < .5 ? pick(mine) : pick(bot.coins);
  }
  let m;
  try { m = ex.market(coin); } catch { return []; }          // market not listed (any more)
  coin = m.name;

  let c = null;
  if (NEEDS_CANDLES.has(bot.style)) {
    c = await candles(coin);
    if (!c || c.close.length < 52) return [];
    c = {close: [...c.close, m.mark], high: [...c.high, m.mark], low: [...c.low, m.mark]};
  }
  const sig = signal(bot, c, m), pos = positions[coin];

  if (pos) {
    const dir = Math.sign(pos.size), held = (now - pos.opened_ms) / 60000;
    if (bot.hold && held > bot.hold) return [{path: "/api/close", body: {coin}}];
    if (bot.style === "dips" && m.mark > pos.entry * 1.05) return [{path: "/api/close", body: {coin}}];
    if (sig === -dir && !["hold", "index", "dips", "degen", "funding"].includes(bot.style)) return [{path: "/api/close", body: {coin}}];
    if (bot.style === "funding" && sig === -dir) return [{path: "/api/close", body: {coin}}];
    return [];
  }
  if (!sig || mine.length >= bot.max) return [];
  const equity = ex.equity(), avail = ex.available();
  const lev = Math.min(bot.lev, m.max_leverage);
  const margin = Math.min(equity * bot.risk, avail * .9);
  const usd = margin * lev;
  if (usd < 50) return [];
  const body = {coin, side: sig > 0 ? "buy" : "sell", size: Math.round(usd), unit: "usd", leverage: lev};
  if (bot.tp) body.tp = +(m.mark * (1 + sig * bot.tp / 100)).toPrecision(5);
  if (bot.sl) body.sl = +(m.mark * (1 - sig * bot.sl / 100)).toPrecision(5);
  return [{path: "/api/order", body}];
}
