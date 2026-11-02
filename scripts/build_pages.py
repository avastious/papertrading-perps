#!/usr/bin/env python3
# Generates the content pages (about, how-it-works, terms, privacy, 404) in aureous/web with a shared header and footer.
# Edit the text below, then run: python3 scripts/build_pages.py
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "aureous", "web")
FAV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23121924'/%3E%3Ctext x='16' y='23' font-family='Georgia,serif' font-size='19' text-anchor='middle' fill='%23D5DCE5'%3EA%3C/text%3E%3C/svg%3E"
NAV = [("./#leaderboard", "Leaderboard", None), ("how-it-works.html", "How it works", "how"), ("about.html", "About", "about")]
X_URL = "https://x.com/aureoustrade"
X_HANDLE = "@aureoustrade"
SITE_URL = "https://aureous.trade/"   # change with scripts/set_domain.py

def slug_file(slug):
    return {"how": "how-it-works.html", "about": "about.html", "terms": "terms.html", "privacy": "privacy.html"}.get(slug, "")

def page(slug, title, desc, body, extra_head=""):
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if k == slug else ""}>{t}</a>' for h, t, k in NAV)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{extra_head}<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Aureous">
<meta property="og:url" content="{SITE_URL}{"" if slug == "404" else slug_file(slug)}">
<meta property="og:image" content="{SITE_URL}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@aureoustrade">
<meta name="twitter:image" content="{SITE_URL}og.png">
<link rel="icon" href="{FAV}">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0E131B">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<script src="theme.js"></script>
<link rel="stylesheet" href="site.css">
</head>
<body>
<header class="site-head">
  <a class="wordmark" href="./">Aureous</a>
  <nav aria-label="Site">{nav}</nav>
  <a class="btn primary" href="./">Open the app</a>
</header>
<main>
{body.strip()}
</main>
<footer class="site-foot">
  <nav aria-label="Footer"><a href="./">Trade</a><a href="how-it-works.html">How it works</a><a href="about.html">About</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="{X_URL}" rel="me">X {X_HANDLE}</a></nav>
  <span class="note">Paper trading only. Not financial advice. Not affiliated with Hyperliquid.</span>
</footer>
</body>
</html>
"""

ABOUT = """
<h1>Practise trading perpetuals on live markets, with nothing at stake.</h1>
<p class="lede">Aureous is a paper-trading exchange built on Hyperliquid's real prices and order books. You get $10,000 of pretend money, the same tools a real perps trader uses, and a leaderboard to measure yourself against everyone else.</p>
<div class="cta"><a class="btn primary" href="./">Start trading</a><a class="btn" href="how-it-works.html">How it works</a></div>

<div class="facts">
  <div><b>$10,000</b><span>paper balance for everyone</span></div>
  <div><b>Live</b><span>prices, order books and funding from Hyperliquid</span></div>
  <div><b>24/7</b><span>stops and limits filled even with the page closed</span></div>
</div>

<h2>Why it exists</h2>
<p>Perpetual futures are easy to start and easy to get wrong. Leverage, funding and liquidation behave in ways that only make sense once you've watched them happen to your own positions. Aureous lets you learn that with real market conditions and fake money, so the expensive lessons cost nothing.</p>

<h2>Where the numbers come from</h2>
<p>Every price, order book, chart and funding rate is read live from Hyperliquid's public market data. When you place an order, it's filled against the real order book at that moment, so a large order pays the same slippage it would on the real exchange. Nothing is sent to Hyperliquid, and no real orders are ever placed.</p>

<h2>What's simulated</h2>
<ul>
  <li><strong>Market and limit orders</strong>, including post-only, immediate-or-cancel and reduce-only.</li>
  <li><strong>Take-profit and stop-loss orders</strong>, triggered on the mark price.</li>
  <li><strong>Cross margin and leverage</strong> up to 1000x on every market, past Hyperliquid's own limits.</li>
  <li><strong>Trading fees</strong> at Hyperliquid's base rates: 0.045% when you take liquidity, 0.015% when you provide it.</li>
  <li><strong>Hourly funding</strong> using Hyperliquid's actual funding history.</li>
  <li><strong>Liquidation</strong> when your equity falls below maintenance margin.</li>
</ul>
<p>The details, and the few places the simulation is simpler than the real thing, are on <a href="how-it-works.html">How it works</a>.</p>

<h2>The leaderboard</h2>
<p>Everyone starts with the same $10,000, and the leaderboard ranks accounts by their current value, including open positions at the mark price. Trades are checked on the Aureous server against live prices, so a balance can't be edited to climb the rankings.</p>
<p>You'll also find 20 Aureous bots on the board, each tagged <b>BOT</b>. Each one trades a simple strategy (trend following, breakouts, mean reversion, buying dips, a maximum-leverage degen) on the same live prices, fees and rules as you. Click one to see its strategy and trades, then try to beat it.</p>
<p>Click any trader to see their open positions and recent trades, and learn from the best on the board. Account-value milestones earn Roman-coin badges, from the bronze Sestertius at $20,000 to Imperium at $1,000,000. Each new badge also earns a week in the spotlight.</p>

<h2>Who's behind it</h2>
<p>Aureous is an independent project. It isn't affiliated with, endorsed by or connected to Hyperliquid. The name comes from the Latin <em>aureus</em>, golden, and the gold coin of ancient Rome.</p>

<h2>Follow along</h2>
<p>News, leaderboard highlights and new features go out first on X at <a href="https://x.com/aureoustrade" rel="me">@aureoustrade</a>. Found a bug or have an idea? Send us a message there. We read everything.</p>
<div class="cta"><a class="btn" href="https://x.com/aureoustrade" rel="me">Follow @aureoustrade on X</a></div>
"""

HOW = """
<h1>How Aureous works</h1>
<p class="lede">Everything you need to start, and exactly how the simulation treats your orders.</p>

<h2>Getting started</h2>
<ol class="steps">
  <li><b>Sign in</b>with Google or an email address. Your account opens with $10,000 of paper money.</li>
  <li><b>Pick a market</b>from the list on the left. Star the ones you trade most to keep them at the top.</li>
  <li><b>Choose a direction and size</b>in the order panel. Long if you think the price will rise, short if you think it will fall. By default you enter your <b>margin</b>, the part of your own money you're putting in, and leverage multiplies it: $1,000 at 20x opens a $20,000 position. Tap the box next to the size to enter the position value or a number of coins instead. Max uses everything available, leaving room for the fee.</li>
  <li><b>Protect the trade</b>with a take-profit and a stop-loss. They're drawn on the chart and fire automatically.</li>
  <li><b>Watch it and close it</b>from the Positions tab, all at once or half at a time. Your result counts towards the leaderboard straight away.</li>
</ol>

<h2>Questions</h2>
<details><summary>Is any real money involved?</summary><div><p>No. Every balance is pretend, nothing is sent to Hyperliquid, and you never connect a wallet. There's nothing to deposit and nothing to win or lose.</p></div></details>
<details><summary>Where do prices come from?</summary><div><p>Live from Hyperliquid's public market data: mark prices, order books, candles and funding rates. They're the same numbers you'd see on Hyperliquid itself, give or take a second or two.</p></div></details>
<details><summary>How are my orders filled?</summary><div>
  <p><strong>Market orders</strong> fill against the real order book at that moment, level by level, so bigger orders get a worse average price, as they would on the real exchange. Like Hyperliquid, a market order won't fill more than 5% away from the mark price. If the book is too thin, you get a partial fill.</p>
  <p><strong>Limit orders</strong> that would cross the book fill immediately as taker orders. Otherwise they rest and fill at your price once the market reaches it. Post-only orders that would cross are rejected.</p>
</div></details>
<details><summary>What fees do I pay?</summary><div><p>Hyperliquid's base rates: 0.045% of the order's value when you take liquidity (market orders and crossing limits), and 0.015% when you provide it (resting limit orders).</p></div></details>
<details><summary>How do leverage and margin work?</summary><div><p>All positions share one balance (cross margin). Leverage is set per market, from 1x to 1000x, and decides how much margin a position ties up: a $5,000 position at 10x uses $500. Hyperliquid caps each market (40x on BTC, less on most coins), but because this is paper money Aureous lets you go further. Higher leverage leaves more of your balance free, but it doesn't change your profit or loss per dollar of position.</p></div></details>
<details><summary>When do I get liquidated?</summary><div><p>Each market has a maintenance margin of half its initial margin at Hyperliquid's maximum leverage. For a 40x market that's 1.25% of the position's value. Above that maximum, a position's maintenance margin is half the margin you put up: at 1000x that's 0.05%, so a 0.05% move against you, about $40 on BTC, closes it. The opening fee alone (0.045% of the position) is then almost half your margin, so very high leverage is mostly a fast way to get liquidated. If your account's equity falls below the total maintenance margin of your positions, every position is closed at the mark price. The Positions tab shows the price where that would happen, if there is one.</p></div></details>
<details><summary>What is funding?</summary><div><p>Every hour, one side of each market pays the other to keep the perpetual's price close to the underlying asset. When the rate is positive, longs pay shorts; when it's negative, shorts pay longs. Aureous uses Hyperliquid's actual hourly rates, so holding a position for days can cost or earn real (paper) money.</p></div></details>
<details><summary>Do stops and limits work when I close the page?</summary><div><p>Yes. The Aureous server checks every account once a minute and fills any take-profits, stop-losses and limit orders that have been reached, settles funding and handles liquidations. Because the check runs once a minute, a fast move can fill a stop at a worse price than you set, much like a real market gapping through it.</p></div></details>
<details><summary>How does the leaderboard work?</summary><div><p>Everyone starts with $10,000. Accounts are ranked by current value: cash balance plus the profit or loss of open positions at the mark price. The board refreshes every 20 seconds or so. Choose the name others see from the account menu; your email is never shown.</p></div></details>
<details><summary>Can I draw on the chart?</summary><div><p>Yes. The toolbar on the left of the chart has a trend line, ray, extended line, horizontal and vertical lines, a rectangle, Fibonacci retracement, a measure tool (price change, percentage and time between two points) and text. Pick a tool, then click once for a horizontal or vertical line or text, or twice for the others. The magnet snaps points to a candle's open, high, low or close.</p><p>Click a drawing to select it: drag it or its handles to move it, change its colour, or press Delete. Ctrl+Z (Cmd+Z on a Mac) undoes. Drawings are saved for each market in your browser and stay in place when you change timeframe. Shortcuts: Alt+T trend line, Alt+H horizontal line, Alt+V vertical line, Alt+R rectangle, Alt+F Fibonacci, Alt+M measure, Esc to stop drawing.</p></div></details>
<details><summary>Can I trade the Nasdaq?</summary><div><p>Yes: <b>XYZ100</b> tracks the Nasdaq 100. It's a market run by trade.xyz on Hyperliquid, and Aureous uses its live price, order book and funding, with up to 30x leverage (whatever trade.xyz allows at the time). Search "nasdaq" in the markets list to find it. On Aureous it trades under the same rules as every other market: one shared account balance, the same fees, and liquidation at the same maintenance margin, which can differ a little from trade.xyz's own rules.</p></div></details>
<details><summary>Can I put my own picture or video behind my PnL card?</summary><div><p>Yes. Press Share on a position, trade or profile, then <b>Use my image or video</b>. The whole picture shows by default. Use Zoom to fill more of the card, drag the picture to choose which part shows, and use Darken to keep the numbers readable. With an image you download a picture. With a video you can download a video up to 15 seconds long with your card over it (MP4 in Chrome, Edge and Safari), with the video's sound unless you switch it off, ready to post on X. Your file stays on your device.</p></div></details>
<details><summary>What are clans?</summary><div><p>Clans let you trade against your friends. Start one from the account menu with a name and a short tag, then send your friends the invite link. Everyone still trades their own $10,000. The clan page ranks members against each other, and the Clans view of the leaderboard ranks clans by their members' average account value. A clan needs at least 2 members to be ranked, and it can have up to 50.</p><p>You can be in one clan at a time. The leader can rename the clan, make a new invite link (the old one stops working) and remove members. If the leader leaves, the longest-standing member takes over. When the last member leaves, the clan closes.</p></div></details>
<details><summary>Who are the BOT accounts?</summary><div><p>They're 20 house bots run by Aureous, so the leaderboard always has someone to beat. Each trades one simple, published strategy with $10,000, on the same live prices, fees, funding and liquidation rules as everyone else. If a bot blows up, it resets to $10,000 and its profile shows the reset. They're always tagged BOT and never pretend to be people.</p></div></details>
<details><summary>Can I see other traders' positions?</summary><div><p>Yes. Click any name on the leaderboard to open their profile: account value, best value, win rate, badges, open positions and their last 50 trades. Profit and loss on open positions updates live. Traders can hide their positions and trades from the account menu; their summary and badges stay visible.</p></div></details>
<details><summary>What are badges?</summary><div>
  <p>Badges mark account-value milestones. Each is named after a Roman coin:</p>
  <ul>
    <li><strong>Sestertius</strong> at $20,000</li>
    <li><strong>Denarius</strong> at $50,000</li>
    <li><strong>Aureus</strong> at $100,000</li>
    <li><strong>Solidus</strong> at $250,000</li>
    <li><strong>Imperium</strong> at $1,000,000</li>
  </ul>
  <p>Account value includes open positions, so a badge counts the moment your value crosses the line. The server checks at least once a minute and whenever you trade. Badges are permanent, even after a reset. Your account panel shows a progress bar towards the next one.</p>
</div></details>
<details><summary>What do badges unlock?</summary><div>
  <p>Every new badge puts you in the <strong>spotlight for 7 days</strong>: your row on the leaderboard is highlighted, and you're listed under recent milestones.</p>
  <p>Some unlocks are permanent:</p>
  <ul>
    <li>Reaching Denarius ($50,000) unlocks the <strong>Aureus gold</strong> accent colour in settings.</li>
    <li>Reaching Aureus ($100,000) turns your name gold on the leaderboard.</li>
  </ul>
  <p>Unlocks are cosmetic, so they never change how trades are filled.</p>
</div></details>
<details><summary>Can I start again?</summary><div><p>Yes. "Reset account" closes everything, clears your history and puts your account back to $10,000. Your leaderboard position starts over from there. Badges you've earned stay, and your profile shows how many times you've reset.</p></div></details>
<details><summary>How do I delete my account?</summary><div><p>Open the account menu (your name, top right) and choose Delete account. After you confirm it's you, your trading data is removed from the Aureous server and your login is deleted.</p></div></details>
<details><summary>Can I change how it looks?</summary><div><p>Yes. The gear icon in the app opens settings for a light or dark theme, accent colour, price colours (including a colour-blind option and red-for-up), a more compact layout, order confirmations, and whether to show the order book. Settings are saved in your browser.</p></div></details>
<details><summary>Does it work on my phone?</summary><div><p>Yes. The layout stacks on small screens, and your account follows you once you're signed in.</p></div></details>
<details><summary>Where does the simulation differ from the real exchange?</summary><div><ul>
  <li>Resting limit orders fill completely once the price reaches them; your place in the queue isn't modelled.</li>
  <li>Liquidation closes positions at the mark price, with no liquidation fee or partial liquidation.</li>
  <li>There's no isolated margin, no fee discounts and no builder-deployed markets.</li>
  <li>Orders you place yourself are filled at once; orders that wait for a price are checked once a minute.</li>
</ul></div></details>
<details><summary>Is this financial advice?</summary><div><p>No. Aureous is a practice tool. Results with paper money don't predict results with real money, where emotions, liquidity and risk all behave differently.</p></div></details>
"""

TERMS = """
<h1>Terms of use</h1>
<p class="updated">Last updated 1 November 2026</p>
<p>These terms cover your use of Aureous, the paper-trading website at aureous.trade. By using it you agree to them. If you don't agree, please don't use the site.</p>

<h2>Paper trading only</h2>
<p>Aureous is a simulation. Balances, positions, profits and losses are not real money and can't be deposited, withdrawn, exchanged or redeemed for anything. No orders are ever placed on Hyperliquid or any other exchange. There are no prizes unless we announce one separately, with its own rules.</p>

<h2>Not financial advice</h2>
<p>Nothing on Aureous is financial, investment, tax or legal advice, or a recommendation to buy or sell anything. Simulated results don't predict real results. Trading real perpetual futures carries a high risk of losing money quickly, especially with leverage.</p>

<h2>Market data and accuracy</h2>
<p>Prices and other market data come from Hyperliquid's public data and may be delayed, interrupted or wrong. The simulation simplifies parts of how a real exchange works, as described on <a href="how-it-works.html">How it works</a>. We may correct accounts or the leaderboard if a data error or bug produced results that couldn't have happened.</p>

<h2>Your account</h2>
<ul>
  <li>You're responsible for activity on your account. Keep your sign-in secure.</li>
  <li>Use one account. Don't create accounts to manipulate the leaderboard.</li>
  <li>Don't use bots or scripts against the service, overload it, probe it for weaknesses, or exploit bugs. If you find one, please <a href="https://x.com/aureoustrade">tell us on X</a>.</li>
  <li>Leaderboard names, clan names and clan tags must not be offensive, misleading or impersonate anyone. We may rename or close them.</li>
</ul>
<p>We may rename, reset, suspend or remove accounts that break these rules.</p>

<h2>Availability and changes</h2>
<p>Aureous is provided free, as is and as available. We may change, pause or end any part of it, including resetting accounts or the leaderboard, at any time. We may update these terms; the date above shows the latest version, and continuing to use the site means you accept the changes.</p>

<h2>Liability</h2>
<p>To the extent the law allows, Aureous and its maintainers aren't liable for any loss arising from your use of the site, including decisions you make about real trading. Nothing in these terms limits rights you have under consumer law that can't be excluded.</p>

<h2>Trademarks</h2>
<p>Aureous isn't affiliated with Hyperliquid. Hyperliquid and other names belong to their owners and are used here only to describe where market data comes from.</p>

<h2>Contact</h2>
<p>Questions about these terms: message <a href="https://x.com/aureoustrade">@aureoustrade</a> on X.</p>
"""

PRIVACY = """
<h1>Privacy</h1>
<p class="updated">Last updated 1 November 2026</p>
<p>Aureous collects as little as it can. This page explains what's stored, where, who can see it, and how to delete it.</p>

<h2>What we store</h2>
<h3>When you sign in</h3>
<p>Sign-in is handled by Google Firebase Authentication. Firebase keeps your email address, your name and profile photo if your sign-in provider shares them (Google does), and a user ID. If you sign up with email, Firebase stores your password securely; Aureous never sees it.</p>
<h3>Your trading account</h3>
<p>The Aureous server, which runs on Cloudflare, stores your paper account under your user ID: your balance, positions, orders, trade and funding history, account-value history, recent notifications, badges and milestones, the leaderboard name you choose, whether you've hidden your trades, and when you were last active. It doesn't store your email address.</p>
<h3>What the site owner can see</h3>
<p>The site owner has a private dashboard showing each account's leaderboard name, user ID, sign-up date, when it was last active, its trading activity and its account details, so the site can be run and moderated. Your email address is visible only in the sign-in service, Firebase.</p>
<h3>In your browser</h3>
<p>Your display settings, favourite markets and last-viewed market are saved in your browser's local storage. They never leave your device. Firebase also keeps you signed in using your browser's storage.</p>

<h2>What's public</h2>
<p>The leaderboard shows your leaderboard name, rank, account value, return, badges and how many positions you have open. Clicking your name opens your public profile. It shows those same details plus your best account value, closed profit and loss, win rate, number of trades and resets, and the date you started.</p>
<p>By default your profile also shows your <strong>open positions</strong> (market, side, size, leverage, entry price and profit or loss) and your <strong>last 50 trades</strong>. To hide them, choose <strong>Hide my trades</strong> in the account menu. Your summary and badges stay visible on the leaderboard.</p>
<p>Share cards are made in your browser. If you add your own image or video as a card background, it never leaves your device: it's kept in your browser's storage so it's there next time, and you can remove it from the share window.</p>
<p>If you join a clan, its tag appears next to your name, and the clan's public page lists you with your account value, return and number of open positions. Leave the clan to remove that.</p>
<p>Profiles never show your email address, your sign-in ID or your resting orders. Your leaderboard name defaults to your first name and last initial, and you can change it from the account menu at any time.</p>

<h2>What we don't do</h2>
<ul>
  <li>No advertising, and nothing that tracks you across other websites.</li>
  <li>We don't sell or share your information.</li>
  <li>We don't ask for a wallet, real funds or payment details.</li>
</ul>

<h2>Services involved</h2>
<ul>
  <li><strong>Google Firebase</strong>: sign-in.</li>
  <li><strong>Cloudflare</strong>: hosts the website and the trading server. Like any web host, it handles your IP address and basic request details to deliver the site. We also use Cloudflare Web Analytics to count visits and see which pages are popular. It doesn't use cookies, doesn't build a profile of you, and doesn't collect personal data.</li>
  <li><strong>Hyperliquid</strong>: your browser loads market data directly from Hyperliquid's public data service, so Hyperliquid receives your IP address, as with any website you visit. No account information is sent to it.</li>
</ul>

<h2>Keeping and deleting your data</h2>
<p>Your account is kept until you delete it. To delete everything, open the account menu (your name, top right) and choose <strong>Delete account</strong>. That removes your trading data from the Aureous server and deletes your Firebase login. Settings stored in your browser can be cleared through your browser's site data settings.</p>

<h2>Children</h2>
<p>Aureous isn't intended for children under 13, and we don't knowingly collect their information.</p>

<h2>Changes and contact</h2>
<p>If this policy changes, the date above will change too. Questions or requests: message <a href="https://x.com/aureoustrade">@aureoustrade</a> on X.</p>
"""

NOTFOUND = """
<div class="lost">
  <p class="code" aria-hidden="true">404</p>
  <h1>This page doesn't exist.</h1>
  <p class="lede">The link may be old or mistyped. The markets are still open, though.</p>
  <div class="cta"><a class="btn primary" href="./">Back to trading</a><a class="btn" href="how-it-works.html">How it works</a></div>
</div>
"""
# 404 is served at whatever path was requested, so relative links need a base: "/" on aureous.pages.dev,
# "/papertrading-perps/" on GitHub Pages.
BASE = """<script>document.write('<base href="' + (location.hostname.endsWith("github.io") ? "/papertrading-perps/" : "/") + '">');</script>
"""

files = {
  "about.html": page("about", "About | Aureous", "Aureous is a paper-trading exchange for Hyperliquid perpetuals: live prices, $10,000 of pretend money and a fair leaderboard.", ABOUT),
  "how-it-works.html": page("how", "How it works | Aureous", "How Aureous fills orders, charges fees and funding, handles liquidation and ranks the leaderboard.", HOW),
  "terms.html": page("terms", "Terms of use | Aureous", "The terms for using Aureous, a paper-trading simulation.", TERMS),
  "privacy.html": page("privacy", "Privacy | Aureous", "What Aureous stores, who can see it, and how to delete it.", PRIVACY),
  "404.html": page("404", "Page not found | Aureous", "This page doesn't exist.", NOTFOUND, BASE),
}
for name, html in files.items():
    open(os.path.join(OUT, name), "w").write(html)
print("wrote", ", ".join(files))
