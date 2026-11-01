# hl-papertrade

Paper-trade **Hyperliquid perpetuals** from your terminal using **live Hyperliquid market data**: real prices, real order books, real funding. All fills are simulated against your own fake USDC balance. No wallet, no API key, no real orders. It only reads Hyperliquid's public `info` endpoint.

```
hl-paper> buy BTC $3000 20x
✓ BUY 0.05 BTC @ 60,006  ($3,000.30, fee $1.3501, slippage 0.010%)
  BTC: long 0.05 @ 60,006  liq -  available $9,848.35
hl-paper> sl BTC 58000
✓ SL #2: sell entire position BTC when mark ≤ 58,000
hl-paper> watch
```

## Install & run

Needs Python 3.10+.

```bash
git clone <this repo> && cd hl-papertrade
pip install -e .          # or: pip install -r requirements.txt
hlpaper                   # or: python -m hlpaper
```

Options:

| flag | default | |
|---|---|---|
| `--balance 25000` | 10000 | starting USDC for a **new** account |
| `--state path.json` | `~/.hlpaper/account.json` | account file; use different files for separate accounts/strategies |
| `--testnet` | off | use Hyperliquid testnet data |
| `--taker-fee` / `--maker-fee` | 0.00045 / 0.00015 | Hyperliquid base-tier fees |

One-shot mode, handy for scripts or cron: `hlpaper buy ETH $500`, `hlpaper account`.

## Commands

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

- Only whatever is happening **while the app is running** (a command or `watch`) can trigger limit/TP/SL fills and liquidations. Prices that spike and recover while it's closed won't be caught. Leave `watch` running if you have resting orders.
- Resting limits fill fully once the price touches them; queue position isn't modelled.
- Liquidation closes at mark with no liquidation penalty and no partial liquidation.
- No isolated margin, no HIP-3 builder-deployed markets, no fee tiers or staking discounts.

## Tests

```bash
pip install pytest && pytest -q
```

The tests run the engine against a mock Hyperliquid client (no network needed).

## Files

- `hlpaper/api.py`: Hyperliquid info-endpoint client (`metaAndAssetCtxs`, `l2Book`, `fundingHistory`, `candleSnapshot`)
- `hlpaper/engine.py`: the paper exchange (margin, fills, orders, funding, liquidation, persistence)
- `hlpaper/cli.py`: interactive shell
- `tests/test_engine.py`: tests
