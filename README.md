# Aureous

Paper-trade **Hyperliquid perpetuals** with **live Hyperliquid market data**: real prices, real order books, real funding. All fills are simulated against your own fake USDC balance. No wallet, no API key, no real orders. It only reads Hyperliquid's public `info` endpoint.

**Live site: https://aureous.trade** (also https://aureous.pages.dev). X: [@aureoustrade](https://x.com/aureoustrade). Open it and trade, nothing to install. Each visitor gets their own $10,000 paper account, saved in their browser or, once they sign in, to their account.

You can also run it on your own computer, as a local website or in the terminal. Those two share one paper account, kept in a file.

## Install

Needs Python 3.10+.

```bash
git clone https://github.com/avastious/papertrading-perps.git && cd papertrading-perps
pip install -e .
```

On Windows use `py -m pip install -e .`. With no Git, download the ZIP from GitHub instead and run that line inside the unzipped folder.

## How the public site works

- **The website** (`aureous/web/`) is static files on Cloudflare Pages and GitHub Pages. It shows live Hyperliquid prices, charts and order books straight from Hyperliquid's public API.
- **Trading requires signing in** (Google or email, via Firebase Auth).
- **Accounts live on the trading server** (`worker/`), a Cloudflare Worker named `aureous-api` on the free plan. The server:
  - checks every sign-in token;
  - runs every order with the same engine (`aureous/web/engine.js`) against live Hyperliquid prices;
  - stores all accounts in a SQLite-backed Durable Object;
  - every minute, fills stops, take-profits, limits and liquidations and settles funding, even with nobody's page open.
- **The leaderboard is fair.** Everyone starts with $10,000 and ranks by account value (balance plus open positions at mark). Balances only ever change on the server. Resets always go back to $10,000.

To publish website changes: commit them, then run `scripts/publish_pages.sh`. It pushes `aureous/web` to the `gh-pages` branch, which both Cloudflare Pages and GitHub Pages serve. It also stamps script and style links with the commit (`auth.js?v=abc1234`), so browsers never mix a new page with old cached code. Server changes deploy automatically when `main` is pushed.

## Cloudflare Pages (aureous.pages.dev)

The main address is a Cloudflare Pages project built from the `gh-pages` branch, with no build command and no output directory. Every run of `scripts/publish_pages.sh` updates GitHub Pages and Cloudflare at once. `aureous.pages.dev` must be listed in Firebase → Authentication → Authorized domains.

## Sharing

- **Share cards:** "Share" on a position, a closed trade (Trade history) or a profile makes an image card. It can be downloaded, copied, shared from a phone's share sheet, or posted on X.
- **Profile links** look like `https://aureous.pages.dev/#trader-<id>` and open that trader's profile.
- **Link previews** use `aureous/web/og.png`. Regenerate it with `node scripts/make_og.mjs [domain]` (needs Playwright).

## Custom domain

1. Buy the domain. Cloudflare Registrar is simplest, because the domain then lives in the same account as the site.
2. Cloudflare → Workers & Pages → the `aureous` Pages project → **Custom domains → Set up a custom domain**. Enter the domain and follow the prompts; Cloudflare creates the DNS records and the HTTPS certificate. Add `www.` the same way if you want it.
   - If you bought the domain elsewhere, Cloudflare will ask you to switch the domain's nameservers to Cloudflare. Do that at your registrar.
3. Firebase → Authentication → Settings → **Authorized domains**: add the domain (and `www.` version).
4. Run `python3 scripts/set_domain.py yourdomain.com`. It updates share links and link previews, lets the domain call the trading server, and regenerates the pages and the preview image. Then commit, push, and run `scripts/publish_pages.sh`.

`aureous.pages.dev` and the GitHub Pages address keep working.

## The trading server (aureous-api)

One-time setup in Cloudflare (free plan):

1. **Workers & Pages → Create application → Import a repository →** `papertrading-perps`, branch `main`.
2. Set the project name to **`aureous-api`** (it must match `wrangler.jsonc`), keep the deploy command `npx wrangler deploy`, and click **Deploy**. Cloudflare creates the database (Durable Object) and the every-minute job (Cron Trigger) from `wrangler.jsonc`.
3. The server's address appears on its overview page, e.g. `https://aureous-api.<your-account>.workers.dev`. It must match `apiUrl` in `aureous/web/firebase-config.js`.

Settings live in `wrangler.jsonc`: `FIREBASE_PROJECT_ID`, and `ALLOWED_ORIGINS` (the websites allowed to call the server; add any new domain here).

Endpoints:

- Public: `GET /api/leaderboard` and `GET /api/trader/<id>` (a trader's profile).
- Signed in: `GET /api/account` and `POST /api/order|close|cancel|tpsl|leverage|reset|profile|privacy|delete`. These need a Firebase ID token.

**Badges and profiles.**

- Account-value milestones award permanent badges: Sestertius ($20k), Denarius ($50k), Aureus ($100k), Solidus ($250k) and Imperium ($1M).
- Each new badge starts a 7-day spotlight on the leaderboard.
- Reaching Denarius unlocks the gold accent, and Aureus turns your name gold.
- Profiles show open positions and the last 50 trades unless the trader chooses "Hide my trades".

## Share cards

Positions, closed trades and profiles can be shared as 1200×675 images drawn in the browser. People can put their own image or video behind a card:

- the text is drawn as a separate layer over the background, with a Darken slider to keep it readable;
- a video background exports as a 1280×720 MP4 (WebM in browsers that can't record MP4), up to 15 seconds long and without sound, recorded in the browser with MediaRecorder;
- the file never leaves the device. It's kept in IndexedDB (files up to 100 MB) so it's there next time.

## Clans

Clans let friends compete. Anyone signed in can start one from the account menu with a name and a 2–5 character tag, then share its invite link (`aureous.trade/#join-<code>`). Everyone still trades their own $10,000.

- **Clan page** (`#clan-<TAG>`): ranks the members against each other.
- **Clans view on the leaderboard:** ranks clans by their members' average account value. A clan needs 2 members to be ranked and can hold up to 50.
- **One clan per trader.** Each member's tag shows next to their name.
- **The leader** can rename the clan, make a new invite link (the old one stops working) and remove members.
- **When people leave:** if the leader leaves or deletes their account, the longest-standing member takes over. When the last member leaves, the clan closes.
- **Moderation:** the admin dashboard lists every clan and can close offensive ones.

## Bots

20 house bots (`worker/bots.js`) trade on the server so the leaderboard always has someone to beat. Each has $10,000 and one simple, published strategy: trend following, breakouts, mean reversion, contrarian, momentum, a holder, a dip buyer, a funding harvester, a scalper, a short seller, an index and a 40x degen. They use the same engine, live prices, fees, funding and liquidations as everyone else. Every minute the cron job wakes a few of them; a bot that blows up resets to $10,000, and its profile shows the reset.

They're always tagged **BOT** on the leaderboard and their profiles show their strategy. They earn badges but never take the spotlight or appear in the milestone feed. The admin dashboard lists them separately and keeps them out of the traders, sign-up and trading numbers. Nobody can sign in as a bot: user IDs starting `bot:` are refused.

To switch them off, set `"BOTS": "off"` in `wrangler.jsonc` and push. Within a minute they're removed from the database. Set it back to `"on"` and they start again from $10,000.

## Admin dashboard

`https://aureous.trade/admin.html` is a private dashboard. Sign in there with an email listed in `ADMIN_EMAILS` (in `wrangler.jsonc`); Google must have verified it. Everyone else is refused. It shows:

- traders online now (anyone whose page talked to the server in the last minute), total traders, sign-ups (today, this week, 30-day chart), active traders, trades, volume and liquidations today, open positions, popular markets and badges earned;
- every trader, searchable, filterable and sortable: last seen, joined, account value, return, positions and orders, trades, volume and resets;
- each trader's full detail (positions, orders, trades, notifications), with **Rename**, **Reset to $10,000** and **Remove**.

Emails stay in Firebase → Authentication → Users. Look a trader up there by the user ID the dashboard shows.

## Accounts (sign in with Google or email)

Sign-in uses Firebase Auth (project `aureous-14551`). In the Firebase console:

- Enable **Google** and **Email/Password** under Authentication → Sign-in method.
- Add `aureous.pages.dev` and `avastious.github.io` under Authentication → Settings → Authorized domains.

**Optional: GitHub sign-in.** Create an OAuth app at https://github.com/settings/developers with homepage `https://aureous.pages.dev`. Use the callback URL that Firebase shows under Sign-in method → GitHub, paste the client ID and secret back into Firebase, and add `"github"` to `providers` in `firebase-config.js`.

Firestore is no longer used. `firestore.rules` closes it completely.

## Security checklist

Already built into the site:

- **Passwords:** Google Firebase handles them; the site never sees or stores one.
- **Server-checked trading:** the server verifies each sign-in token's Google signature, project, issuer and expiry before doing anything.
  - Only the server changes balances; anything else in a request is ignored.
  - Requests are size-limited, actions are rate-limited (40 a minute per person), and only the listed websites may call it.
- **What's stored:** the paper account and a leaderboard name. Login details stay in Firebase Auth. The leaderboard never shows emails or user IDs. No real money or wallets.
- **Delete account** (account menu): confirms it's really them first, then removes their trading data from the server and their login from Firebase.
- **Safe display:** everything shown from data is escaped, so a market name or account field can't inject code into the page.

Settings to switch on in the consoles:

1. **Close Firestore:** Firebase → Firestore Database → Rules → paste `firestore.rules` → Publish. It isn't used any more.
2. **Restrict the API key:** Google Cloud console (project `aureous-14551`) → APIs & Services → Credentials → the "Browser key".
   - Under *Website restrictions*, allow `https://avastious.github.io/*` and `https://aureous-14551.firebaseapp.com/*`.
   - Under *API restrictions*, allow Identity Toolkit API, Token Service API, Firebase Installations API and (if you use App Check) Firebase App Check API.
3. **Sign-in hardening:** Firebase → Authentication → Settings.
   - Turn on *Email enumeration protection*, so the site doesn't reveal which emails have accounts.
   - Set a *Password policy* (e.g. at least 8 characters).
   - Remove `localhost` from *Authorized domains* unless you're testing locally.
4. **App Check** (stops scripts and bots from using your Firebase project directly):
   - Create a reCAPTCHA v3 key at https://www.google.com/recaptcha/admin with domain `avastious.github.io`, and register it in Firebase → App Check.
   - Put the *site key* in `appCheckSiteKey` in `aureous/web/firebase-config.js`, then publish.
   - After a day of traffic shows as verified, click **Enforce** for Authentication.
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
node --test tests/engine.test.mjs        # browser/server engine (same cases)
```

Trading server, run locally against stand-ins for Hyperliquid and Google's signing keys:

```bash
node tests/server/mock-hyperliquid.js &
npx wrangler dev --test-scheduled --var HL_API_URL:http://127.0.0.1:8500 \
  --var JWKS_URL:http://127.0.0.1:8500/jwks --var ALLOWED_ORIGINS:http://127.0.0.1:8400 --var BOTS:off &
node tests/server/api.check.mjs          # sign-in, trading, every-minute job, cheating attempts, leaderboard
node tests/server/milestones.check.mjs   # badges, spotlight, public profiles, hiding trades (run after api.check on a fresh server)
node tests/server/admin.check.mjs        # owner-only dashboard (start wrangler dev with --var ADMIN_EMAILS:owner@example.com)
node tests/server/bots.check.mjs         # house bots (fresh server, bots on, with the ADMIN_EMAILS var above)
node tests/server/clans.check.mjs        # clans: create, invite, join, leader rules, rankings, moderation
```

## Files

- `aureous/api.py`: Hyperliquid info-endpoint client (`metaAndAssetCtxs`, `l2Book`, `fundingHistory`, `candleSnapshot`)
- `aureous/engine.py`: the paper exchange (margin, fills, orders, funding, liquidation, persistence)
- `aureous/cli.py`: terminal version
- `aureous/server.py`: local web server and JSON API
- `aureous/web/index.html`: the website (same page for the public site and the local server)
- `aureous/web/engine.js`: the browser engine used by the public site
- `aureous/web/theme.js`: display settings (theme, accent, price colours, layout) shared by every page
- `aureous/web/about.html`, `how-it-works.html`, `terms.html`, `privacy.html`, `404.html`, `site.css`: the site's content pages
- `aureous/web/auth.js`, `aureous/web/firebase-config.js`: sign-in (Firebase Auth) and the connection to the trading server
- `worker/`: the trading server (Cloudflare Worker + Durable Object), `wrangler.jsonc` its settings
- `firestore.rules`: closes the unused Firestore database
- `scripts/publish_pages.sh`: publish the site to GitHub Pages and Cloudflare Pages
- `scripts/build_pages.py`: regenerates the content pages (edit the text there)
- `scripts/set_domain.py`: switch the site to a new domain in one step
- `scripts/make_og.mjs`, `scripts/og-card.html`: the link preview image
- `tests/`: engine and web API tests

## Third-party

- Charts: [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0), bundled in `aureous/web/`.
- Fonts: IBM Plex Sans and Cinzel (SIL Open Font License), bundled in `aureous/web/fonts/` so the site works without Google Fonts.
