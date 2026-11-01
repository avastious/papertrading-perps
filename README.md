# Aureous

Paper-trade **Hyperliquid perpetuals** with **live Hyperliquid market data**: real prices, real order books, real funding. All fills are simulated against your own fake USDC balance. No wallet, no API key, no real orders. It only reads Hyperliquid's public `info` endpoint.

**Live site: https://avastious.github.io/papertrading-perps/**. Open it and trade, nothing to install. Each visitor gets their own $10,000 paper account, saved in their browser or, once they sign in, to their account.

You can also run it on your own computer, as a local website or in the terminal. Those two share one paper account, kept in a file.

## Install

Needs Python 3.10+.

```bash
git clone https://github.com/avastious/papertrading-perps.git && cd papertrading-perps
pip install -e .
```

On Windows use `py -m pip install -e .`. With no Git, download the ZIP from GitHub instead and run that line inside the unzipped folder.

## How the public site works

The site is static files (`aureous/web/`) on GitHub Pages. The trading engine is `aureous/web/engine.js`, a JavaScript port of the Python engine, and runs inside the visitor's browser. The page fetches live data straight from Hyperliquid's public API and stores the paper account in `localStorage`, so there's no server and no sign-up. Orders, stops and funding only run while the page is open. Clearing browser data erases the account.

To publish changes: commit them, then run `scripts/publish_pages.sh`. It pushes `aureous/web` to the `gh-pages` branch, which GitHub Pages serves. One-time setup: in the repo, go to Settings → Pages → Build and deployment, choose "Deploy from a branch", then pick `gh-pages` and `/ (root)`.

## Custom domain

1. Buy a domain from any registrar (Cloudflare, Porkbun, Namecheap, Squarespace, ...).
2. In the repo, go to Settings → Pages → Custom domain, enter the domain (e.g. `example.com`) and click Save.
3. At the registrar's DNS settings, add four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`. Then add a `CNAME` record for `www` pointing to `avastious.github.io`. Delete any other `A` or `CNAME` records for `@` and `www`, such as the registrar's parking page.
4. Once GitHub shows the DNS check passed (minutes to a few hours), tick **Enforce HTTPS**.
5. Add the domain everywhere sign-in is allowed:
   - Firebase → Authentication → Settings → Authorized domains (add both `example.com` and `www.example.com`).
   - The API key's website restrictions.
   - The reCAPTCHA key's domains, if you use App Check.

`scripts/publish_pages.sh` keeps the domain when republishing. It reads `aureous/web/CNAME` if present, otherwise it keeps whatever the live site has.

## Accounts (sign in with Google, GitHub or email)

The public site can let people sign in so their paper account follows them across devices. This uses Firebase (Auth + Firestore), which is free at this scale. Guests can still trade without signing in. The first time someone signs in, their guest account moves into their new account.

Accounts stay off until `aureous/web/firebase-config.js` has a config. To switch them on:

1. Go to https://console.firebase.google.com, choose **Create a project** and name it (e.g. `aureous`). Google Analytics isn't needed.
2. **Add an app → Web** (the `</>` icon) and register it. Don't tick Firebase Hosting. Copy the `firebaseConfig` values into `config` in `aureous/web/firebase-config.js`.
3. **Build → Authentication → Get started → Sign-in method**: enable **Google** and **Email/Password**.
4. **Authentication → Settings → Authorized domains → Add domain**: `avastious.github.io`.
5. **Build → Firestore Database → Create database** in production mode (e.g. `australia-southeast1`). Then open **Rules**, paste in `firestore.rules` from this repo, and click **Publish**.
6. Commit, then run `scripts/publish_pages.sh`.

**Optional: GitHub sign-in.** Create an OAuth app at https://github.com/settings/developers with homepage `https://avastious.github.io/papertrading-perps/`. Use the callback URL that Firebase shows under Sign-in method → GitHub, paste the client ID and secret back into Firebase, and add `"github"` to `providers`. Microsoft works the same way with `"microsoft"`.

What's stored: one document per person at `accounts/{uid}`, holding the paper account as JSON. The rules only let a signed-in person read, write or delete their own document. See the security checklist below. Since the account lives on the person's side, someone technical could edit their own paper balance. That doesn't matter for practice trading, but it would for a public leaderboard, which would need a server to check trades.

## Security checklist

Already built into the site:

- **Passwords:** Google Firebase handles them; the site never sees or stores one.
- **Database rules** (`firestore.rules`): each person can read, save and delete only their own account. Saves must match the exact shape the site writes, and everything else in the database is closed.
- **What's stored:** only name, email (in Firebase Auth) and the paper account. No real money or wallets.
- **Delete account** (account menu): confirms it's really them first, then removes their data and login.
- **Safe display:** everything shown from data is escaped, so a market name or account field can't inject code into the page.

Settings to switch on in the consoles:

1. **Publish the rules:** Firebase → Firestore Database → Rules → paste `firestore.rules` → Publish. Re-publish whenever the file changes.
2. **Restrict the API key:** Google Cloud console (project `aureous-14551`) → APIs & Services → Credentials → the "Browser key".
   - Under *Website restrictions*, allow `https://avastious.github.io/*` and `https://aureous-14551.firebaseapp.com/*`.
   - Under *API restrictions*, allow Identity Toolkit API, Token Service API, Cloud Firestore API, Firebase Installations API and (if you use App Check) Firebase App Check API.
3. **Sign-in hardening:** Firebase → Authentication → Settings.
   - Turn on *Email enumeration protection*, so the site doesn't reveal which emails have accounts.
   - Set a *Password policy* (e.g. at least 8 characters).
   - Remove `localhost` from *Authorized domains* unless you're testing locally.
4. **App Check** (stops scripts and bots from using your Firebase project directly):
   - Create a reCAPTCHA v3 key at https://www.google.com/recaptcha/admin with domain `avastious.github.io`, and register it in Firebase → App Check.
   - Put the *site key* in `appCheckSiteKey` in `aureous/web/firebase-config.js`, then publish.
   - After a day of traffic shows as verified, click **Enforce** for Cloud Firestore and Authentication.
5. **Protect the owner accounts:** turn on two-step verification for the Google account that owns Firebase and for your GitHub account. Whoever controls those controls the site and its data.
6. **No surprise bills:** stay on Firebase's free *Spark* plan. If you ever upgrade, set a budget alert in Google Cloud billing.

The Firebase config in `firebase-config.js` is not a secret. Google designs it to be public, and the rules, key restrictions and App Check are what protect the data.

## The website on your own computer

```bash
python -m aureous web        # Windows: py -m aureous web
```

Your browser opens at http://127.0.0.1:8321. Keep the terminal window open while you trade; Ctrl+C stops it. The site is only reachable from your own computer.

- **Markets list** (left): search and sort every Hyperliquid perp; click one to trade it.
- **Chart:** 1m to 1d candles with volume. Drag to move, scroll to zoom, drag either axis to stretch it, double-click or "Reset view" to snap back. Older history loads as you scroll left. Your entry, liquidation, take-profit, stop-loss and limit-order prices are drawn as lines.
- **Order book:** live depth. Click any price to place a limit order there.
- **Order ticket:** long/short, market/limit, size in dollars or coins, quick 10/25/50/Max buttons, leverage slider, reduce-only, post-only, and optional take-profit/stop-loss.
- **Account:** equity, a bar showing how much margin you're using with the liquidation line marked, balance and available margin.
- **Bottom tabs:** positions (TP/SL, close 50%, close), open orders (cancel), trade history, funding payments, performance stats and equity curve.

## The terminal version

```bash
python -m aureous            # or just `aureous`
```

One-shot mode, handy for scripts: `python -m aureous buy ETH $500`, `python -m aureous account`.

## Options

These work for both the website and the terminal, e.g. `python -m aureous --balance 50000 web`.

| flag | default | |
|---|---|---|
| `--balance 25000` | 10000 | starting USDC for a **new** account |
| `--state path.json` | `~/.aureous/account.json` | account file; use different files for separate accounts/strategies |
| `--port 9000` | 8321 | website port |
| `--no-browser` | off | start the website without opening a tab |
| `--testnet` | off | use Hyperliquid testnet data |
| `--taker-fee` / `--maker-fee` | 0.00045 / 0.00015 | Hyperliquid base-tier fees |

## Terminal commands

| command | what it does |
|---|---|
| `markets [filter] [sort=vol\|oi\|funding\|change\|name] [n=25]` | all perp markets: mark, 24h change, funding, volume, OI, max leverage |
| `price COIN` | details for one market incl. funding APR |
| `book COIN [depth]` | live L2 order book |
| `chart COIN [1m\|5m\|15m\|1h\|4h\|1d] [n]` | ASCII price chart from real candles |
| `buy` / `long COIN SIZE [20x] [ro]` | market buy. SIZE in coins (`0.01`) or USD notional (`$500`). `20x` sets leverage, `ro` = reduce-only |
| `sell` / `short COIN SIZE [20x] [ro]` | market sell |
| `limit buy\|sell COIN SIZE PRICE [gtc\|alo\|ioc] [ro]` | limit order. `alo` = post-only |
| `sl COIN PRICE [SIZE]` / `tp COIN PRICE [SIZE]` | stop-loss / take-profit on mark price (whole position by default) |
| `close COIN [50%]` / `close all` | market-close fully or partly |
| `cancel ID\|COIN\|all` | cancel orders |
| `lev COIN N` | set leverage for a coin |
| `account` (`a`, `bal`) | equity, balance, margin, positions, orders |
| `positions`, `orders`, `history [n]`, `funding [n]`, `stats` | the details |
| `watch [secs]` | live dashboard; keeps limit/TP/SL fills, funding and liquidation running. Ctrl-C to exit |
| `reset [balance]` | wipe the account |

## How the simulation matches Hyperliquid

- **Cross margin.** All positions share one balance. Per-coin leverage, capped at each market's max.
- **Market orders walk the live L2 book**, so big orders get real slippage. Like Hyperliquid, they won't fill more than 5% away from mark. If the top 20 levels can't fill you, you get a partial fill.
- **Limit orders:** a marketable limit fills immediately as taker; otherwise it rests and fills at your price (maker fee) once the mid price reaches it. Post-only (ALO) orders that would cross are rejected.
- **TP/SL** are reduce-only market orders triggered by the **mark price**. They're cancelled automatically when the position closes.
- **Funding** is settled hourly using Hyperliquid's actual `fundingHistory`, paid on oracle-price notional. A positive rate means longs pay shorts. If the app was closed, the missed hours are settled the next time it runs.
- **Liquidation:** maintenance margin = `1 / (2 × max leverage)` of notional. If equity drops below total maintenance, every position is closed at mark. The `liq px` column shows the price where that happens, assuming your other positions stay put.
- **Size/price rounding** follows Hyperliquid's `szDecimals` and the 5-significant-figure tick rule.

### Simplifications

- Only what happens **while Aureous is running** (the website, a command, or `watch`) can trigger limit/TP/SL fills and liquidations. Prices that spike and recover while it's closed won't be caught. Keep the website (or `watch`) open if you have resting orders.
- Resting limits fill fully once the price touches them; queue position isn't modelled.
- Liquidation closes at mark with no liquidation penalty and no partial liquidation.
- No isolated margin, no HIP-3 builder-deployed markets, no fee tiers or staking discounts.

## Tests

```bash
pip install pytest && pytest -q          # Python engine + local web API
node --test tests/engine.test.mjs        # browser engine (same cases)
```

The tests run both engines against a mock Hyperliquid client (no network needed).

## Files

- `aureous/api.py`: Hyperliquid info-endpoint client (`metaAndAssetCtxs`, `l2Book`, `fundingHistory`, `candleSnapshot`)
- `aureous/engine.py`: the paper exchange (margin, fills, orders, funding, liquidation, persistence)
- `aureous/cli.py`: terminal version
- `aureous/server.py`: local web server and JSON API
- `aureous/web/index.html`: the website (same page for the public site and the local server)
- `aureous/web/engine.js`: the browser engine used by the public site
- `aureous/web/auth.js`, `aureous/web/firebase-config.js`: sign-in and cloud-saved accounts (Firebase)
- `firestore.rules`: who can read and write account data
- `scripts/publish_pages.sh`: publish the site to GitHub Pages
- `tests/`: engine and web API tests

## Third-party

- Charts: [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0), bundled in `aureous/web/`.
- Fonts: IBM Plex Sans and Cinzel (SIL Open Font License), bundled in `aureous/web/fonts/` so the site works without Google Fonts.
