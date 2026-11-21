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

## Chart drawing tools

`aureous/web/draw.js` adds TradingView-style drawing tools to the Lightweight Charts chart. They're drawn by a series primitive, so they move with scrolling and zooming.

- **Tools:** trend line, ray, extended line, horizontal and vertical lines, rectangle, Fibonacci retracement, measure, text, a candle magnet, hide all and delete all.
- **Editing:** select, drag and resize, colour, Delete, Ctrl/Cmd+Z, and Alt shortcuts.
- **Storage:** drawings are saved per market in localStorage. Points are stored as time (ms) and price and placed through the bar index, interpolating between bars and past the last candle, so they stay put when you change timeframe.

## Leverage

Every market goes up to 1000x (`MAX_LEVERAGE` in `engine.js` / `engine.py`), past Hyperliquid's per-market caps. The site owner can switch this off on the admin page (**Settings → Leverage above Hyperliquid's limits**). That's stored on the server (`settings` table, `GET /api/config`) and applies to everyone at once. When it's off, new orders and leverage changes are limited to each market's Hyperliquid cap. Open positions keep their leverage and can still be closed.

- **Liquidation:** at or below a market's own cap, maintenance margin is the market's (1 / (2 × cap)). Above it, it's half the position's initial margin (1 / (2 × leverage)).
- **Order form:** a stepped slider (1x to 1000x) with quick buttons, and a warning above the market's cap showing the move that liquidates and the share of margin the opening fee takes.
- **Max button:** for market orders it counts the price impact of the visible order book as well as the fee.

## Markets

Every market on Hyperliquid's main list, plus chosen builder-run (HIP-3) markets. Hyperliquid only lists those when asked for their group by name, and calls them `<group>:<ticker>`, such as `xyz:XYZ100`. The choice lives in `EXTRA_MARKETS` in `aureous/web/engine.js` (website and trading server) and `aureous/api.py` (local server):

```js
const EXTRA_MARKETS = {xyz: "*", io: ["ANTH"]};   // every live trade.xyz market (stocks, SP500, XYZ100, commodities…); Entropy's Anthropic
```

- **More markets:** `"*"` takes a whole group (new trade.xyz listings appear on their own, delisted ones drop out); a list such as `["ANTH"]` takes only those tickers. Add company names to `MARKET_LABELS` so search finds them ("apple", "s&p"). Then push and publish.
- **Names:** the site shows `NVDA` without the group prefix. If a ticker clashes with one of Hyperliquid's own markets (`xyz:HYPE`), it shows as `HYPE (xyz)`. The market list has Crypto / Stocks, indices & more / Favourites filters.
- **Load:** a group costs one request to Hyperliquid however many markets it has, and groups are re-read at most every 10 seconds.
- **Outages:** if a group can't be reached, its last prices are kept, so open positions still have a price.
- **Funding:** if a builder market's funding history can't be read, its current hourly rate is used for each hour.

## Mobile app (install from the browser)

aureous.trade can be installed as an app (a Progressive Web App). On Android, Chrome offers **Install app**. On iPhone, Safari has **Share → Add to Home Screen**. The **Get the app** link in the header and footer walks people through it, or shows Android's install prompt directly. Installed, it opens full screen with its own icon.

- **Files:** `manifest.webmanifest` (name, colours, icons in `icons/`) and `sw.js`.
- **Service worker:** pages come from the network first and work offline from a saved copy. Our own scripts, styles and fonts are cached; prices, the trading server and sign-in are never cached.
- **Phone screens:** the layout makes room for the notch and home bar when installed.
- **Sign-in in the installed app:** home-screen apps can't use sign-in pop-ups, so Google sign-in redirects instead, through `aureous.trade/__/auth/*`. A Cloudflare Pages Function (`pages-functions/`, published as `functions/`) passes those requests to `aureous-14551.firebaseapp.com`, which keeps the sign-in on the same site as the app. This needs both `https://aureous.trade/__/auth/handler` and `https://www.aureous.trade/__/auth/handler` in Google Cloud Console → APIs & Services → Credentials → the "Web client (auto created by Google Service)" OAuth client → Authorized redirect URIs. Sign-in in a normal browser tab is unchanged.

## Share cards

Positions, closed trades and profiles can be shared as 1200×675 images drawn in the browser. People can put their own image or video behind a card:

- the whole picture shows by default (edges filled with a blurred copy). A Zoom slider goes up to filling the card, and dragging the preview moves the picture;
- the text is drawn as a separate layer over the background, with a Darken slider to keep it readable;
- a video background exports as a 1280×720 MP4 (WebM in browsers that can't record MP4), up to 15 seconds long, recorded in the browser with MediaRecorder. The video's sound is routed through Web Audio into the recording (H.264 + AAC where the browser can, as X requires), and can be switched off;
- the file never leaves the device. It's kept in IndexedDB (files up to 100 MB) so it's there next time.

## Clans

Clans let friends compete. Anyone signed in can start one from the account menu with a name and a 2–5 character tag, then share its invite link (`aureous.trade/#join-<code>`). Everyone still trades their own $10,000.

- **Clan page** (`#clan-<TAG>`): ranks the members against each other.
- **Clans view on the leaderboard:** ranks clans by their members' average account value. A clan needs 2 members to be ranked and can hold up to 50.
- **One clan per trader.** Each member's tag shows next to their name.
- **The leader** can rename the clan, make a new invite link (the old one stops working) and remove members.
- **When people leave:** if the leader leaves or deletes their account, the longest-standing member takes over. When the last member leaves, the clan closes.
- **Moderation:** the admin dashboard lists every clan and can close offensive ones.

## Calls

Traders can publicly **call** a position they hold, with a written thesis (`worker/calls.js`, `aureous/web/calls.js`):

- **From a position** (Call button) or from the order form (*Call it publicly*, market orders). The call takes the position's real entry and leverage.
- **Tracked to the result:** open calls show the live move since entry (and the return at their leverage); when the position is closed, flipped, liquidated or reset, the call closes at the exit price. Authors can't edit or delete calls, so records stay honest.
- **Feed:** the Calls tab (`#calls`, one call at `#call-<id>`) shows the latest or the best this week, optionally open only or this market only. Others can agree or disagree (one vote each, changeable). Calls also show on the trader's profile, even when their trades are hidden.
- **Rules:** 20–600 characters, filtered for swearing and slurs, no links, handles or contact details, one open call per position, 10 a day. The admin dashboard lists the latest calls with a Remove button.
- **API:** `GET /api/calls` (public; `sort=top`, `status=open`, `coin`, `pid`, `id`), `POST /api/call {coin, thesis}`, `POST /api/call/vote {id, vote: 1|-1|0}`, `POST /api/admin/call-remove {id}`.

## Bots

The 20 house bots were retired. Any bot account still in the database (user IDs starting `bot:`) is deleted by the cron job within a minute, with its trades, badges and clan membership; nobody can sign in with such an ID.

## Live trading (Hyperliquid testnet)

Off by default. In `/admin` → Settings, **Live trading on Hyperliquid's testnet** adds a **Paper / Live** switch to the order form. In live mode:

- the trader connects their own browser wallet (MetaMask, Rabby, or a wallet app's built-in browser);
- **Enable live trading** asks the wallet for two signatures, once: a trading key for this browser (it can place trades but never withdraw; it's kept in the browser's local storage, never on our server) and, if set, the Aureous builder fee;
- orders go straight from the browser to `api.hyperliquid-testnet.xyz`, signed by that key. Market orders are IOC limit orders 5% through the testnet mid; limit orders are GTC (or post-only). Leverage is set on Hyperliquid first and capped at Hyperliquid's own limit (the over-the-cap switch never applies to live trading);
- positions, orders and fills come from Hyperliquid (**Live (testnet)** tab); test USDC comes from Hyperliquid's testnet faucet. Builder markets (XYZ100, ANTH…) aren't on testnet.

**Builder fee:** set your builder address (a Hyperliquid account holding at least 100 USDC) and a fee of up to 0.1% in the same card. Every live order then carries `builder: {b, f}` and Hyperliquid pays the fee to that address.

**Real money (mainnet)** can't be switched on from admin: `live.js` only talks to testnet, and the server only accepts `off` or `testnet`. Turning on mainnet means changing that code, and should only happen after legal advice (perps are derivatives; offering them to Australians may need an AFS licence).

The signing library is `@nktkas/hyperliquid` with `viem`, bundled into `aureous/web/vendor/hl-live.js` (loaded only when someone switches to live). Rebuild with `scripts/build_live.sh`. Its signatures are checked against Hyperliquid's official Python SDK: see Tests.

## Real emails, email codes and name rules

**Email/password accounts must confirm a real address before trading.** The server (`worker/index.js`) refuses every request from a `password` sign-in whose token isn't `email_verified` (`code: "verify_email"`), and from addresses on throwaway domains (`code: "disposable_email"`; list in `worker/vendor/disposable-domains.js`, refresh with `scripts/update_disposable.sh`). Google sign-ins are already verified. The site shows a **Confirm your email** window:

- with **email codes** set up, a 6-digit code is emailed and checked by the server, which then marks the Firebase account verified;
- without, Firebase's own confirmation link is used (the person clicks it, then **I've confirmed**).

**Forgot password** works the same way: a 6-digit code plus a new password (8+ characters) when codes are set up, Firebase's reset link otherwise. Codes are hashed, expire after 10 minutes, allow 5 wrong tries, at most one email a minute and 5 an hour per address, plus a site-wide cap (`MAIL_HOURLY_LIMIT`, default 60). Resets give the same answer whether or not an account exists.

### Turning on email codes

You need two things, both added under Cloudflare → Workers & Pages → **aureous-api** → Settings → **Variables and Secrets** → **Add**, as type **Secret**:

1. **`FIREBASE_SERVICE_ACCOUNT`**: lets the server mark emails verified and set new passwords. Firebase console → ⚙ Project settings → **Service accounts** → **Generate new private key**. Paste the whole downloaded JSON file as the value. Keep that file private and delete it afterwards.
2. **A way to send email.** Either:
   - **Resend** (free: 3,000 emails a month, at most 100 a day). Sign up at resend.com, then **Domains → Add domain → aureous.trade** and add the DNS records it shows to Cloudflare (Resend can add them for you). Create an **API key** with sending access and add it as the secret **`RESEND_API_KEY`**.
   - **Cloudflare Email Service** (public beta; sending to any address needs the Workers Paid plan, $5 a month). Onboard aureous.trade under **Email → Email Sending**, then add `"send_email": [{"name": "EMAIL"}]` to `wrangler.jsonc` and push.

Mail comes from `no-reply@aureous.trade` (set `MAIL_FROM` to change it). `GET /api/auth-config` says `{"codes": true}` once both are in place. Everything works before that, using Firebase's links.

**Names** (leaderboard names, clan names and tags) are checked by `worker/moderation.js`. It uses [obscenity](https://github.com/jo3-l/obscenity) (MIT, bundled in `worker/vendor/obscenity.js`), which handles l33t-speak, look-alike characters and repeated letters, on the name as written and with spaces/dots/dashes removed. It also refuses staff-looking words ("admin", "moderator", "official", "aureous"…). Existing names that break the rules are renamed once at start-up (`sweepNames`), and their owners are told.

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
  --var JWKS_URL:http://127.0.0.1:8500/jwks --var ALLOWED_ORIGINS:http://127.0.0.1:8400 &
node tests/server/api.check.mjs          # sign-in, trading, every-minute job, cheating attempts, leaderboard
node tests/server/milestones.check.mjs   # badges, spotlight, public profiles, hiding trades (run after api.check on a fresh server)
node tests/server/admin.check.mjs        # owner-only dashboard (start wrangler dev with --var ADMIN_EMAILS:owner@example.com)
node tests/server/clans.check.mjs        # clans: create, invite, join, leader rules, rankings, moderation
node tests/server/settings.check.mjs     # the owner's leverage switch
node tests/server/markets.check.mjs      # builder markets (xyz:XYZ100)
node tests/server/live.browser.cjs       # live trading end to end with a test wallet (Playwright; site on 8400), then:
python3 tests/server/live_signatures.py /tmp/live-log.json <wallet>   # every signature recovers to the right signer (pip install hyperliquid-python-sdk)
node tests/server/calls.check.mjs        # public calls: posting rules, live result, votes, closing, removal
node tests/server/email.check.mjs        # real emails, email codes, name rules (needs a .dev.vars pointing email + Firebase admin at the stand-in; see the file's header)
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
