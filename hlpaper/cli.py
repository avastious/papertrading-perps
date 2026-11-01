"""Interactive terminal for the Hyperliquid paper-trading engine."""
from __future__ import annotations

import cmd
import os
import re
import shlex
import sys
import time
from datetime import datetime

from .api import HyperliquidAPIError
from .engine import PaperError, PaperExchange, sign

USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def c(text, code):
    return f"\x1b[{code}m{text}\x1b[0m" if USE_COLOR else str(text)


def green(t): return c(t, "32")
def red(t): return c(t, "31")
def dim(t): return c(t, "2")
def bold(t): return c(t, "1")


def pnl(x: float, fmt="{:+,.2f}") -> str:
    s = fmt.format(x)
    return green(s) if x > 0 else red(s) if x < 0 else s


def fpx(x: float | None) -> str:
    if x is None:
        return "-"
    if x == 0:
        return "0"
    digits = len(str(int(abs(x)))) if abs(x) >= 1 else 0
    dec = max(0, 5 - digits) if abs(x) >= 1 else 6
    return f"{x:,.{dec}f}".rstrip("0").rstrip(".") if dec else f"{x:,.0f}"


def usd(x: float) -> str:
    return f"${x:,.2f}" if x >= 0 else f"-${-x:,.2f}"


def big(x: float) -> str:
    for unit, n in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if abs(x) >= n:
            return f"{x / n:,.2f}{unit}"
    return f"{x:,.0f}"


def ts(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000).strftime("%m-%d %H:%M:%S")


def table(headers, rows):
    if not rows:
        return dim("  (none)")
    cols = list(zip(*([headers] + [[str(v) for v in r] for r in rows])))
    widths = [max(len(ANSI.sub("", v)) for v in col) for col in cols]
    def line(vals, hdr=False):
        out = []
        for i, v in enumerate(vals):
            pad = widths[i] - len(ANSI.sub("", str(v)))
            out.append(str(v) + " " * pad if i == 0 else " " * pad + str(v))
        s = "  ".join(out)
        return bold(s) if hdr else s
    return "\n".join([line(headers, True)] + [line([str(v) for v in r]) for r in rows])


def parse_size(token: str, mark: float) -> float:
    """'0.5' -> 0.5 coins; '$500' / '500usd' -> $500 of notional."""
    t = token.lower().replace(",", "")
    try:
        if t.startswith("$"):
            return float(t[1:]) / mark
        if t.endswith("usd"):
            return float(t[:-3]) / mark
        return float(t)
    except ValueError:
        raise PaperError(f"Bad size '{token}'. Use coins (0.5) or dollars ($500).")


class PaperShell(cmd.Cmd):
    intro = (bold("Hyperliquid perps paper trader") +
             dim("  - live market data, simulated fills. Type 'help' or '?' for commands."))
    prompt = "hl-paper> "
    NO_UPDATE = {"help", "quit", "exit", "EOF", "reset", ""}

    def __init__(self, ex: PaperExchange):
        super().__init__()
        self.ex = ex

    # -------------------------------------------------------------- plumbing
    def onecmd(self, line):
        name = line.strip().split(" ")[0] if line.strip() else ""
        try:
            if name not in self.NO_UPDATE and not name.startswith("?"):
                for e in self.ex.update():
                    print(c("» " + e, "33"))
            return super().onecmd(line)
        except PaperError as e:
            print(red(f"✗ {e}"))
        except HyperliquidAPIError as e:
            print(red(f"✗ Hyperliquid API: {e}"))
        except (ValueError, IndexError) as e:
            print(red(f"✗ {e or 'Bad arguments'} - see 'help {name}'"))
        return False

    def emptyline(self):
        pass  # never repeat the last command (it might be an order)

    def default(self, line):
        print(red(f"Unknown command: {line.split()[0]}. Type 'help'."))

    # -------------------------------------------------------- market data
    def do_markets(self, arg):
        """markets [filter] [sort=vol|oi|funding|change|name] [n=25]
        List perp markets. e.g.  markets   |   markets sort=funding n=10   |   markets PEPE"""
        args = shlex.split(arg)
        sort, n, flt = "vol", 25, None
        for a in args:
            if a.startswith("sort="):
                sort = a[5:]
            elif a.startswith("n="):
                n = int(a[2:])
            else:
                flt = a.lower()
        ms = list(self.ex.markets.values())
        if flt:
            ms = [m for m in ms if flt in m.name.lower()]
        key = {"vol": lambda m: -m.day_volume, "oi": lambda m: -m.open_interest * m.mark,
               "funding": lambda m: -abs(m.funding), "change": lambda m: -abs(m.change_24h),
               "name": lambda m: m.name}.get(sort)
        if not key:
            raise PaperError("sort must be vol, oi, funding, change or name")
        ms.sort(key=key)
        rows = [[m.name, fpx(m.mark), pnl(m.change_24h * 100, "{:+.2f}%"),
                 pnl(m.funding * 100, "{:+.4f}%"), "$" + big(m.day_volume),
                 "$" + big(m.open_interest * m.mark), f"{m.max_leverage}x"] for m in ms[:n]]
        print(table(["coin", "mark", "24h", "funding/h", "24h vol", "open int", "max lev"], rows))
        print(dim(f"  {len(ms)} markets" + (f", showing {min(n, len(ms))}" if len(ms) > n else "")))

    def do_price(self, arg):
        """price COIN   - mark, mid, oracle, funding, OI and volume for one market"""
        m = self.ex.market(arg.strip())
        print(bold(m.name) + f"   mark {fpx(m.mark)}   mid {fpx(m.mid)}   oracle {fpx(m.oracle)}")
        print(f"  24h {pnl(m.change_24h * 100, '{:+.2f}%')}   vol ${big(m.day_volume)}   "
              f"OI ${big(m.open_interest * m.mark)}   max {m.max_leverage}x")
        print(f"  funding {pnl(m.funding * 100, '{:+.4f}%')}/h  "
              f"({pnl(m.funding * 24 * 365 * 100, '{:+.1f}%')} APR)   "
              f"size step {10 ** -m.sz_decimals:g}   your leverage {self.ex.leverage(m.name)}x")

    def do_book(self, arg):
        """book COIN [depth=10]   - live order book"""
        args = shlex.split(arg)
        depth = int(args[1]) if len(args) > 1 else 10
        bids, asks = self.ex.book(args[0])
        for px, sz in reversed(asks[:depth]):
            print(f"  {red(f'{fpx(px):>14}')}  {sz:>14,.4f}")
        if bids and asks:
            spread = asks[0][0] - bids[0][0]
            print(dim(f"  {'spread ' + fpx(spread):>14}  {spread / asks[0][0] * 1e4:>11.2f} bps"))
        for px, sz in bids[:depth]:
            print(f"  {green(f'{fpx(px):>14}')}  {sz:>14,.4f}")

    def do_chart(self, arg):
        """chart COIN [interval=1h] [n=60]   - ASCII price chart (1m 5m 15m 1h 4h 1d)"""
        args = shlex.split(arg)
        m = self.ex.market(args[0])
        interval = args[1] if len(args) > 1 else "1h"
        n = int(args[2]) if len(args) > 2 else 60
        secs = {"1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600,
                "2h": 7200, "4h": 14400, "8h": 28800, "12h": 43200, "1d": 86400}.get(interval)
        if not secs:
            raise PaperError("interval must be one of 1m 3m 5m 15m 30m 1h 2h 4h 8h 12h 1d")
        end = self.ex.now_ms()
        candles = self.ex.client.candles(m.name, interval, end - n * secs * 1000, end)
        closes = [float(k["c"]) for k in candles][-n:]
        if len(closes) < 2:
            raise PaperError("Not enough candle data.")
        hi, lo, h = max(closes), min(closes), 12
        span = (hi - lo) or 1
        rows = [[" "] * len(closes) for _ in range(h)]
        for x, v in enumerate(closes):
            y = int((v - lo) / span * (h - 1))
            rows[h - 1 - y][x] = "•"
        chg = closes[-1] / closes[0] - 1
        print(bold(f"{m.name} {interval} x{len(closes)}") + f"   {pnl(chg * 100, '{:+.2f}%')}")
        for i, r in enumerate(rows):
            label = fpx(hi) if i == 0 else fpx(lo) if i == h - 1 else ""
            line = "".join(r)
            print(f"{label:>12} │{green(line) if chg >= 0 else red(line)}")

    # ------------------------------------------------------------- trading
    def _order_args(self, arg):
        args = shlex.split(arg)
        if len(args) < 2:
            raise PaperError("Need a coin and a size, e.g. 'buy BTC 0.01' or 'buy ETH $500'.")
        m = self.ex.market(args[0])
        ro = False
        for a in args[2:]:
            al = a.lower()
            if re.fullmatch(r"\d+x", al):
                self.ex.set_leverage(m.name, int(al[:-1]))
            elif al in ("ro", "reduce", "reduce-only"):
                ro = True
            else:
                raise PaperError(f"Unknown option '{a}'")
        return m, parse_size(args[1], m.mark), ro

    def _print_fill(self, t):
        side = green("BUY") if t["side"] == "buy" else red("SELL")
        msg = f"✓ {side} {t['sz']:g} {t['coin']} @ {fpx(t['px'])}  (${t['sz'] * t['px']:,.2f}, fee ${t['fee']:,.4f}"
        if "slippage" in t:
            msg += f", slippage {t['slippage'] * 100:.3f}%"
        msg += ")"
        if abs(t["realized"]) > 1e-9:
            msg += "  realized " + pnl(t["realized"])
        print(msg)
        if t.get("requested") and t["sz"] < t["requested"] - 1e-12:
            print(c(f"  partial fill: book only had {t['sz']:g} of {t['requested']:g} within 5% of mark", "33"))

    def _market(self, arg, direction):
        m, sz, ro = self._order_args(arg)
        self._print_fill(self.ex.market_order(m.name, direction * sz, reduce_only=ro))
        self._pos_line(m.name)

    def do_buy(self, arg):
        """buy COIN SIZE [20x] [ro]   - market buy / go long
        SIZE is in coins (0.01) or dollars of notional ($500). '20x' sets leverage first, 'ro' = reduce-only.
        e.g.  buy BTC 0.01   |   buy ETH $1000 25x   |   buy SOL 10 ro"""
        self._market(arg, 1)

    def do_sell(self, arg):
        """sell COIN SIZE [20x] [ro]   - market sell / go short (same options as buy)"""
        self._market(arg, -1)

    do_long = do_buy
    do_short = do_sell

    def do_limit(self, arg):
        """limit buy|sell COIN SIZE PRICE [gtc|alo|ioc] [ro] [20x]
        Resting limit order. alo = post-only, ioc = immediate-or-cancel.
        e.g.  limit buy BTC 0.01 58000   |   limit sell ETH $2000 4200 alo"""
        args = shlex.split(arg)
        if len(args) < 4 or args[0].lower() not in ("buy", "sell", "long", "short"):
            raise PaperError("Usage: limit buy|sell COIN SIZE PRICE [gtc|alo|ioc] [ro]")
        direction = 1 if args[0].lower() in ("buy", "long") else -1
        m = self.ex.market(args[1])
        px = float(args[3].replace(",", ""))
        tif, ro = "Gtc", False
        for a in args[4:]:
            al = a.lower()
            if al in ("gtc", "alo", "ioc", "post"):
                tif = "Alo" if al == "post" else al
            elif al in ("ro", "reduce", "reduce-only"):
                ro = True
            elif re.fullmatch(r"\d+x", al):
                self.ex.set_leverage(m.name, int(al[:-1]))
            else:
                raise PaperError(f"Unknown option '{a}'")
        sz = parse_size(args[2], px)
        res = self.ex.limit_order(m.name, direction * sz, px, tif=tif, reduce_only=ro)
        if res["fill"]:
            self._print_fill(res["fill"])
        if res["order"]:
            o = res["order"]
            print(f"✓ Order #{o['id']} resting: {o['side']} {o['sz']:g} {o['coin']} @ {fpx(o['px'])} "
                  f"[{o['tif']}{' RO' if o['reduce_only'] else ''}]")
        elif not res["fill"]:
            print(dim("IOC order did not fill - cancelled."))

    def _trigger(self, arg, kind):
        args = shlex.split(arg)
        if len(args) < 2:
            raise PaperError(f"Usage: {kind} COIN PRICE [SIZE]")
        m = self.ex.market(args[0])
        sz = parse_size(args[2], m.mark) if len(args) > 2 else None
        o = self.ex.trigger_order(m.name, kind, float(args[1].replace(",", "")), sz)
        size = "entire position" if o["sz"] is None else f"{o['sz']:g}"
        op = "≤" if (kind == "sl") == (o["side"] == "sell") else "≥"
        print(f"✓ {kind.upper()} #{o['id']}: {o['side']} {size} {o['coin']} when mark {op} {fpx(o['trigger_px'])}")

    def do_sl(self, arg):
        """sl COIN PRICE [SIZE]   - stop-loss (reduce-only market order when mark hits PRICE)"""
        self._trigger(arg, "sl")

    def do_tp(self, arg):
        """tp COIN PRICE [SIZE]   - take-profit (reduce-only market order when mark hits PRICE)"""
        self._trigger(arg, "tp")

    def do_close(self, arg):
        """close COIN [PCT%]  |  close all   - market-close a position (fully or partly)
        e.g.  close BTC   |   close ETH 50%"""
        args = shlex.split(arg)
        if not args:
            raise PaperError("Usage: close COIN [PCT%] or close all")
        if args[0].lower() == "all":
            coins = list(self.ex.state["positions"])
            if not coins:
                print(dim("No open positions."))
            for coin in coins:
                self._print_fill(self.ex.close(coin))
            return
        frac = float(args[1].rstrip("%")) / 100 if len(args) > 1 else 1.0
        if not 0 < frac <= 1:
            raise PaperError("Percentage must be between 0 and 100.")
        self._print_fill(self.ex.close(args[0], frac))

    def do_cancel(self, arg):
        """cancel ID | COIN | all   - cancel open orders"""
        n = self.ex.cancel(arg.strip() or "all")
        print(f"✓ Cancelled {n} order{'s' if n != 1 else ''}.")

    def do_lev(self, arg):
        """lev COIN N   - set leverage for a coin (cross margin), e.g. lev BTC 20"""
        args = shlex.split(arg)
        if len(args) == 1:
            print(f"{self.ex.market(args[0]).name}: {self.ex.leverage(args[0])}x")
            return
        lev = self.ex.set_leverage(args[0], int(args[1].lower().rstrip("x")))
        print(f"✓ {self.ex.market(args[0]).name} leverage set to {lev}x")

    do_leverage = do_lev

    # ------------------------------------------------------------- account
    def _pos_rows(self):
        rows = []
        for coin, p in self.ex.state["positions"].items():
            m = self.ex.market(coin)
            lev = self.ex.leverage(coin)
            u = self.ex.upnl(coin)
            margin = abs(p["size"]) * p["entry"] / lev
            rows.append([coin, green(f"LONG {lev}x") if p["size"] > 0 else red(f"SHORT {lev}x"),
                         f"{abs(p['size']):g}", usd(abs(p["size"]) * m.mark), fpx(p["entry"]),
                         fpx(m.mark), pnl(u), pnl(u / margin * 100 if margin else 0, "{:+.1f}%"),
                         fpx(self.ex.liq_price(coin)), pnl(p["funding"], "{:+,.4f}")])
        return rows

    def _pos_line(self, coin):
        p = self.ex.state["positions"].get(coin)
        if not p:
            print(dim(f"  {coin} position closed."))
            return
        print(dim(f"  {coin}: {'long' if p['size'] > 0 else 'short'} {abs(p['size']):g} @ {fpx(p['entry'])}"
                  f"  liq {fpx(self.ex.liq_price(coin))}  available {usd(self.ex.available())}"))

    def do_positions(self, arg):
        """positions   - open positions with uPnL, ROE, liquidation price"""
        print(table(["coin", "side", "size", "value", "entry", "mark", "uPnL", "ROE", "liq px", "funding"],
                    self._pos_rows()))

    do_pos = do_positions

    def do_orders(self, arg):
        """orders   - open limit / TP / SL orders"""
        rows = []
        for o in self.ex.state["orders"]:
            px = fpx(o["px"]) if o["type"] == "limit" else "trigger " + fpx(o["trigger_px"])
            rows.append([f"#{o['id']}", o["coin"], o["type"].upper(),
                         green(o["side"]) if o["side"] == "buy" else red(o["side"]),
                         "all" if o["sz"] is None else f"{o['sz']:g}", px,
                         o.get("tif", "") + (" RO" if o["reduce_only"] else ""), ts(o["ts"])])
        print(table(["id", "coin", "type", "side", "size", "price", "flags", "placed"], rows))

    def do_account(self, arg):
        """account   - balance, equity, margin and positions"""
        ex = self.ex
        eq, start = ex.equity(), ex.state["starting_balance"]
        mu, mm = ex.margin_used(), ex.maintenance()
        print(bold("Account") + f"   equity {bold(usd(eq))}  ({pnl((eq / start - 1) * 100, '{:+.2f}%')} "
              f"from {usd(start)})")
        print(f"  balance {usd(ex.state['balance'])}   uPnL {pnl(eq - ex.state['balance'])}   "
              f"margin used {usd(mu)}   available {usd(ex.available())}")
        lev = sum(abs(p['size']) * ex.market(c_).mark for c_, p in ex.state['positions'].items()) / eq if eq > 0 else 0
        health = f"{mm / eq * 100:.1f}%" if eq > 0 else "-"
        print(f"  maintenance {usd(mm)}   margin ratio {health}   account leverage {lev:.2f}x")
        if ex.state["positions"]:
            print()
            self.do_positions("")
        if ex.state["orders"]:
            print()
            self.do_orders("")

    do_bal = do_account
    do_a = do_account

    def do_history(self, arg):
        """history [n=20]   - recent fills"""
        n = int(arg) if arg.strip() else 20
        rows = [[ts(t["ts"]), t["coin"], green(t["side"]) if t["side"] == "buy" else red(t["side"]),
                 f"{t['sz']:g}", fpx(t["px"]), usd(t["sz"] * t["px"]), f"{t['fee']:,.4f}",
                 pnl(t["realized"]) if abs(t["realized"]) > 1e-9 else "", t["kind"]]
                for t in self.ex.state["trades"][-n:]]
        print(table(["time", "coin", "side", "size", "price", "value", "fee", "pnl", "type"], rows))

    def do_funding(self, arg):
        """funding [n=20]   - recent funding payments"""
        n = int(arg) if arg.strip() else 20
        rows = [[ts(f["ts"]), f["coin"], f"{f['size']:g}", f"{f['rate'] * 100:+.4f}%", pnl(f["payment"], "{:+,.4f}")]
                for f in self.ex.state["funding_log"][-n:]]
        print(table(["time", "coin", "position", "rate", "payment"], rows))

    def do_stats(self, arg):
        """stats   - performance summary"""
        s = self.ex.stats()
        wr = f"{s['win_rate'] * 100:.1f}%" if s["win_rate"] is not None else "-"
        print(bold("Performance") + f"   equity {usd(s['equity'])}  return {pnl(s['return'] * 100, '{:+.2f}%')}")
        fees = red(f"-{s['fees']:,.2f}")
        print(f"  realized {pnl(s['realized'])}   fees {fees}   funding {pnl(s['funding'])}")
        print(f"  fills {s['trades']}   closing fills {s['closing_trades']}   win rate {wr}   "
              f"best {pnl(s['best'])}   worst {pnl(s['worst'])}   volume {usd(s['volume'])}")
        curve = [v for _, v in self.ex.state["equity_curve"]]
        if len(curve) > 1:
            peak, dd = curve[0], 0.0
            for v in curve:
                peak = max(peak, v)
                dd = min(dd, v / peak - 1)
            print(f"  max drawdown {pnl(dd * 100, '{:+.2f}%')} (sampled each minute the app runs)")

    def do_watch(self, arg):
        """watch [secs=3]   - live dashboard; keeps limits, TP/SL, funding and liquidation running. Ctrl-C to stop."""
        secs = float(arg) if arg.strip() else 3.0
        log = []
        try:
            while True:
                log = (log + [f"{datetime.now():%H:%M:%S} {e}" for e in self.ex.update()])[-8:]
                print("\x1b[2J\x1b[H" if USE_COLOR else "\n" * 2, end="")
                print(dim(f"{datetime.now():%Y-%m-%d %H:%M:%S}  refreshing every {secs:g}s - Ctrl-C to return"))
                self.do_account("")
                if log:
                    print("\n" + bold("Events"))
                    for e in log:
                        print(c("  » " + e, "33"))
                time.sleep(secs)
        except KeyboardInterrupt:
            print()

    def do_reset(self, arg):
        """reset [balance]   - wipe the paper account and start over (default: same starting balance)"""
        bal = float(arg.replace("$", "").replace(",", "")) if arg.strip() else None
        if input(c("Erase all positions, orders and history? [y/N] ", "33")).strip().lower() != "y":
            print("Cancelled.")
            return
        self.ex.reset(bal)
        print(f"✓ Fresh account with {usd(self.ex.state['balance'])}")

    def do_quit(self, arg):
        """quit   - exit (your account is saved)"""
        print("Saved. Bye.")
        return True

    do_exit = do_quit

    def do_EOF(self, arg):
        print()
        return self.do_quit(arg)
