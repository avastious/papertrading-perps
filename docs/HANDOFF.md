# Handover from the claude.ai chat (Oct–Nov 2026)

Aureous was built in one long claude.ai chat before moving to Claude Code. This is what that chat built,
decided and left open, so nothing depends on remembering it. CLAUDE.md has the rules; README.md the manual.

## About the owner

- Billy Storrs, Sydney. Not a developer: explain anything he has to do click by click, with direct links,
  in plain English. He likes short answers and wants things done, not plans to approve.
- Cost-sensitive: asked how to make sure nothing can charge him without consent. Keep everything on free
  plans (Cloudflare Workers Free, Firebase Spark, Resend free, GitHub $0 budgets). Anything paid needs a
  hard cap and his say-so (X API is the one paid service; prepaid credits, auto-recharge off).
- Style he asked for: "professional but unique", like a real exchange. Gold (aureus = gold in Latin).

## What was built, in order

1. Paper exchange on real Hyperliquid prices: market/limit/TP-SL orders, cross margin, funding, liquidation
   (maintenance = half the initial margin, like Hyperliquid), leaderboard, profiles, badges, clans, seasons-free.
2. Accounts: Firebase sign-in, trading server on a Cloudflare Worker + Durable Object, admin dashboard
   (`/admin`, owner emails in the `ADMIN_EMAILS` secret).
3. Emails through Resend (welcome, password reset codes), name filtering (`worker/moderation.js`),
   60 emails an hour site-wide.
4. UI overhaul to look like a real exchange (topbar, ticker, markets dropdown, order book/trades tabs,
   mobile layout). Themes and accents in settings.
5. Markets: Anthropic pre-IPO (`io:ANTH`), every trade.xyz stock/index (`xyz:*`: S&P 500, NVDA, AAPL,
   SpaceX…). Hyperliquid rate limits forced a 10s refresh cap on builder market lists.
6. Live mode on Hyperliquid **testnet** (agent key + builder fee). Never tested against the real testnet.
7. Bots removed for good.
8. Public calls: post a position with a thesis; tracked to the result; agree/disagree votes.
9. Posts from X (Nov 24): live Posts tab beside the order book. Built and published, **not switched on yet**
   (needs the `X_BEARER_TOKEN` secret; see README "Posts from X").
10. Brand: logo, gold coin, LinkedIn logo/cover for Aureous and "Aureous Research" (`brand/`). The design
    canvas is a claude.ai artifact: https://claude.ai/artifact/KWHeDjYD8iyEGuGheXFB6F (source in `brand/canvas/`).

## Decisions worth keeping

- J7Tracker can't be embedded (no public feed; its API needs a wallet key). The Posts tab replaced it.
  Only j7tracker.io is official; .co/.gg/.top clones push bookmarklets, a known wallet-drain trick.
- Token launch to fund prize pools was discussed, not started.
- Never route around network blocks (e.g. using GitHub Actions to reach blocked sites).
- Restore points: `checkpoint/2026-11-21-code` and `checkpoint/2026-11-21-site` branches (see CLAUDE.md).

## Open

- **Liquidation question (Nov 25):** Billy had a 20x short (entry 68.729, liquidation 70.170) and says the
  liquidation price was about 78 earlier that day. 2–2.5% away is correct at 20x (checked with the engine),
  and with cross margin it moves when the position grows or the balance drops. He was asked to check Trade
  history for extra sells or losing trades that day. If there were none, investigate `liqPrice` in
  `aureous/web/engine.js` and the worker's copy of the state. Offered: show distance-to-liquidation %
  on positions and warn before opening a trade under ~3% away.
- **X posts:** waiting on Billy to create the X developer app, add credits (auto-recharge off, spending
  limit set), and save the Bearer Token as the `X_BEARER_TOKEN` secret. Default accounts are a starting
  list he can edit in /admin.
- **TikTok videos:** see CLAUDE.md "Unfinished". Needs real candles; upload as "Only me" first.
- **Live mode:** do one real testnet round trip.
- Offered, never asked for: app-store packages, a share card for calls, seasons, a 1584x396 personal
  LinkedIn banner, gold versions of the research logo.
