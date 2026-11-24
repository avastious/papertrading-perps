# Aureous — notes for Claude

Aureous (aureous.trade) is a paper-trading site for Hyperliquid perpetuals, plus an optional live mode on
Hyperliquid testnet. Owner: Billy Storrs (billystorrs15@gmail.com), Sydney time. README.md is the full
manual; this file is the short version plus the things that bite.

## How it's put together

- **Website**: static files in `aureous/web/`, served by Cloudflare Pages from the `gh-pages` branch.
  Publish with `scripts/publish_pages.sh` (runs `scripts/build_pages.py`, which also writes the FAQ,
  terms and about pages). Pushing `main` alone does NOT update the site.
- **Trading server**: Cloudflare Worker `aureous-api` in `worker/`, auto-deployed from `main`.
  One Durable Object `Exchange` (SQLite) holds every account, position, clan, call and setting.
  - `worker/index.js` routes, `worker/exchange.js` the exchange, `worker/calls.js` public calls,
    `worker/moderation.js` name/text checks, `worker/mailer.js` emails.
- **Sign-in**: Firebase Auth, project `aureous-14551` (Google + email). The worker checks Firebase ID
  tokens against Google's signing keys (`JWKS_URL`). Stay on the free Spark plan.
- **Trading maths**: `aureous/web/engine.js` is shared by the browser and the worker; `aureous/api.py`
  and `aureous/server.py` are the Python twin (terminal version). Keep the two in step —
  `tests/engine.test.mjs` and `tests/test_engine.py` run the same cases.
- **Markets**: Hyperliquid main dex plus HIP-3 builder dexes via `EXTRA_MARKETS` in engine.js
  (`{xyz: "*", io: ["ANTH"]}` — every trade.xyz stock/index, and Anthropic pre-IPO). Display names in
  `MARKET_LABELS`; ticker clashes show as "TICKER (dex)". Builder lists refresh at most every 10s
  because Hyperliquid rate-limits per IP (metaAndAssetCtxs weighs 20).
- **Live mode** (testnet): `aureous/web/live.js` + bundled `aureous/web/vendor/hl-live.js`
  (built by `scripts/build_live.sh` from `scripts/live-entry.js`, @nktkas/hyperliquid + viem).
  Agent key in localStorage `aureous.live.v1`; builder fee set in the admin dashboard.
- **Look**: bg #0C0D10, panel #131418, text #ECE8E1, gold #D1A85A, long #26B58A, short #E5575E.
  Cinzel for the wordmark only, IBM Plex Sans everywhere else. Themes/accents in `aureous/web/theme.js`.
- **Posts from X**: `worker/posts.js` reads X's API (pay-per-use, $0.005/post) on the cron and a 20s DO alarm while
  someone watches; `aureous/web/posts.js` is the Posts tab. Needs secret `X_BEARER_TOKEN`; account list and daily cap
  in the admin dashboard. Keep reads cheap: one search for all accounts with since_id, no media/user expansions.
- Bots were removed for good; the cron job deletes any leftover `bot:` accounts.

## Testing

`scripts/dev.sh` starts the stand-in Hyperliquid (8500), `wrangler dev` (8787) and a local copy of
the site (8400). Then run the checks listed under "Tests" in README.md. Some checks need a fresh
server: `npx wrangler dev --port 8788 --persist-to <empty dir> ...` with the same `--var`s.
`api.check` needs `--test-scheduled`. Browser tests use Playwright.

## Rules

- Never commit `.dev.vars` or any real key. Real secrets (Resend key, Firebase service account,
  admin emails) live only in Cloudflare → aureous-api → Settings → Variables and Secrets.
- Pushing `main` deploys the live trading server — run the tests first.
- Never delete, move or push to the `checkpoint/*` branches. They are the owner's restore points:
  `checkpoint/2026-11-21-code` (main) and `checkpoint/2026-11-21-site` (gh-pages), a known-good
  state from before work moved to Claude Code. To restore, make new commits on `main`/`gh-pages`
  that bring the files back to the checkpoint (e.g. `git checkout checkpoint/2026-11-21-code -- .`),
  never force-push.
- Write user-facing text in plain English; the owner isn't a developer, so explain dashboard steps
  click by click with direct links.

## Unfinished

- **TikTok edits** (`tools/tiktok/`): `render.py` makes a vertical video per winning trade in
  `trades.json` (names hidden), `sound.py` makes the music. Needs real candles in
  `tools/tiktok/candles/<id>.json` (`[[t,o,h,l,c,v],...]` from Hyperliquid candleSnapshot), then
  `python3 render.py <id>`. The plan was 5 videos uploaded to TikTok as "Only me" first.
- Live mode has only been tested against the stand-in; do a real testnet round trip.
- Brand files: `brand/linkedin/` (LinkedIn logo/cover for Aureous and Aureous Research),
  `brand/gold/` (metallic gold coin and lockup), `brand/canvas/` (the design canvas source).
