"""Paper-trading engine that mirrors Hyperliquid perp mechanics.

Modelled on Hyperliquid:
  * cross margin across all positions, per-coin leverage (capped at the coin's max)
  * market orders sweep the live L2 book (real slippage, 5% max from mark)
  * limit orders (GTC / post-only ALO / IOC), reduce-only, TP/SL trigger orders on mark price
  * taker / maker fees (defaults = Hyperliquid base tier: 0.045% / 0.015%)
  * hourly funding from the real funding history, paid on oracle-price notional
  * maintenance margin = 1 / (2 * max leverage); account is liquidated at mark
    when equity drops below total maintenance margin
"""
from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass

HOUR_MS = 3_600_000
EPS = 1e-12
DEFAULT_LEVERAGE = 10
MAX_SLIPPAGE = 0.05
MAX_LEVERAGE = 1000  # paper money: any market up to 1000x (above Hyperliquid's cap, maintenance = half the initial margin)


class PaperError(Exception):
    """User-facing problem with an order (bad size, insufficient margin, ...)."""


@dataclass
class Market:
    name: str
    sz_decimals: int
    max_leverage: int
    mark: float
    mid: float | None
    oracle: float
    funding: float          # current (predicted) hourly funding rate
    open_interest: float    # in coins
    day_volume: float       # 24h notional volume, USD
    prev_day_px: float

    @property
    def mmr(self) -> float:
        return 1.0 / (2 * self.max_leverage)

    @property
    def change_24h(self) -> float:
        return self.mark / self.prev_day_px - 1 if self.prev_day_px else 0.0

    @property
    def ref_px(self) -> float:
        return self.mid or self.mark


def sign(x: float) -> int:
    return 1 if x > 0 else -1 if x < 0 else 0


def round_size(sz: float, decimals: int) -> float:
    """Round toward zero to the coin's size step."""
    f = 10 ** decimals
    return sign(sz) * math.floor(abs(sz) * f + 1e-9) / f


def round_px(px: float, sz_decimals: int) -> float:
    """Hyperliquid tick rule: 5 significant figures, at most (6 - szDecimals)
    decimals; whole numbers are always valid."""
    if px <= 0:
        return px
    max_dec = max(0, 6 - sz_decimals)
    sig_dec = 4 - int(math.floor(math.log10(px)))
    return round(px, max(0, min(max_dec, sig_dec)))


def apply_fill(size: float, entry: float, sz: float, px: float):
    """Apply a signed fill to a position. Returns (new_size, new_entry, realized_pnl)."""
    if size == 0 or sign(size) == sign(sz):
        new = size + sz
        return new, (abs(size) * entry + abs(sz) * px) / abs(new), 0.0
    closing = min(abs(sz), abs(size))
    realized = closing * (px - entry) * sign(size)
    new = size + sz
    if abs(new) < EPS:
        return 0.0, 0.0, realized
    if sign(new) == sign(size):
        return new, entry, realized          # partial close
    return new, px, realized                 # flipped through zero


class PaperExchange:
    def __init__(self, client, state_path: str, starting_balance: float = 10_000.0,
                 taker_fee: float = 0.00045, maker_fee: float = 0.00015,
                 refresh_secs: float = 2.0, clock=time.time, over_cap: bool = True):
        self.client = client
        self.over_cap = over_cap   # allow leverage past Hyperliquid's per-market cap, up to MAX_LEVERAGE
        self.state_path = state_path
        self.taker_fee = taker_fee
        self.maker_fee = maker_fee
        self.refresh_secs = refresh_secs
        self.clock = clock
        self.markets: dict[str, Market] = {}
        self._lookup: dict[str, str] = {}
        self._last_refresh = 0.0
        self.state = self._load() or self._new_state(starting_balance)

    # ------------------------------------------------------------------ state
    def now_ms(self) -> int:
        return int(self.clock() * 1000)

    def _new_state(self, balance: float) -> dict:
        now = self.now_ms()
        return {
            "version": 1, "created_ms": now, "starting_balance": balance,
            "balance": balance, "positions": {}, "orders": [], "leverage": {},
            "trades": [], "funding_log": [], "equity_curve": [],
            "next_order_id": 1, "last_funding_ms": now,
        }

    def _load(self):
        if os.path.exists(self.state_path):
            with open(self.state_path) as f:
                return json.load(f)
        return None

    def save(self):
        d = os.path.dirname(os.path.abspath(self.state_path))
        os.makedirs(d, exist_ok=True)
        tmp = self.state_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.state, f, indent=1)
        os.replace(tmp, self.state_path)

    def reset(self, balance: float | None = None):
        self.state = self._new_state(balance or self.state["starting_balance"])
        self.save()

    # ----------------------------------------------------------- market data
    def refresh(self, force: bool = False):
        if not force and self.markets and self.clock() - self._last_refresh < self.refresh_secs:
            return
        meta, ctxs = self.client.meta_and_ctxs()
        markets = {}
        for info, ctx in zip(meta["universe"], ctxs):
            if info.get("isDelisted"):
                continue
            mark = float(ctx.get("markPx") or 0)
            if mark <= 0:
                continue
            mid = ctx.get("midPx")
            markets[info["name"]] = Market(
                name=info["name"], sz_decimals=int(info["szDecimals"]),
                max_leverage=int(info["maxLeverage"]), mark=mark,
                mid=float(mid) if mid else None,
                oracle=float(ctx.get("oraclePx") or mark),
                funding=float(ctx.get("funding") or 0),
                open_interest=float(ctx.get("openInterest") or 0),
                day_volume=float(ctx.get("dayNtlVlm") or 0),
                prev_day_px=float(ctx.get("prevDayPx") or 0),
            )
        self.markets = markets
        self._lookup = {k.lower(): k for k in markets}
        self._last_refresh = self.clock()

    def market(self, coin: str) -> Market:
        self.refresh()
        name = self._lookup.get(coin.lower())
        if not name:
            raise PaperError(f"Unknown market '{coin}'. Try 'markets {coin}'.")
        return self.markets[name]

    def book(self, coin: str):
        raw = self.client.l2_book(self.market(coin).name)
        bids = [(float(l["px"]), float(l["sz"])) for l in raw["levels"][0]]
        asks = [(float(l["px"]), float(l["sz"])) for l in raw["levels"][1]]
        return bids, asks

    # -------------------------------------------------------------- account
    def leverage(self, coin: str) -> int:
        m = self.market(coin)
        return min(int(self.state["leverage"].get(m.name, DEFAULT_LEVERAGE)), MAX_LEVERAGE)

    def mmr(self, coin: str) -> float:
        """Maintenance margin rate: the market's own, or half the initial margin above Hyperliquid's cap."""
        return min(self.market(coin).mmr, 1.0 / (2 * self.leverage(coin)))

    def upnl(self, coin: str) -> float:
        p = self.state["positions"].get(coin)
        return p["size"] * (self.market(coin).mark - p["entry"]) if p else 0.0

    def position_margin(self, coin: str) -> float:
        p = self.state["positions"].get(coin)
        return abs(p["size"]) * self.market(coin).mark / self.leverage(coin) if p else 0.0

    def equity(self) -> float:
        return self.state["balance"] + sum(self.upnl(c) for c in self.state["positions"])

    def margin_used(self) -> float:
        return sum(self.position_margin(c) for c in self.state["positions"])

    def maintenance(self) -> float:
        return sum(abs(p["size"]) * self.market(c).mark * self.mmr(c)
                   for c, p in self.state["positions"].items())

    def order_margin(self) -> float:
        return sum(o["sz"] * o["px"] / self.leverage(o["coin"]) for o in self.state["orders"]
                   if o["type"] == "limit" and not o["reduce_only"])

    def available(self) -> float:
        return self.equity() - self.margin_used() - self.order_margin()

    def liq_price(self, coin: str) -> float | None:
        """Mark price at which the account hits maintenance, holding the other
        positions constant (cross margin)."""
        p = self.state["positions"].get(coin)
        if not p:
            return None
        m = self.market(coin)
        s, e = p["size"], p["entry"]
        mmr = self.mmr(coin)
        other_maint = self.maintenance() - abs(s) * m.mark * mmr
        e0 = self.equity() - self.upnl(coin) - other_maint
        denom = s * (1 - sign(s) * mmr)
        px = (s * e - e0) / denom
        return px if px > 0 else None

    # ------------------------------------------------------------ execution
    def _sweep(self, coin: str, sz: float, limit_px: float):
        """Walk the opposite side of the book up to limit_px. Returns (filled, avg_px)."""
        bids, asks = self.book(coin)
        levels = asks if sz > 0 else bids
        remaining, filled, cost = abs(sz), 0.0, 0.0
        for px, lvl_sz in levels:
            if (sz > 0 and px > limit_px) or (sz < 0 and px < limit_px):
                break
            take = min(lvl_sz, remaining)
            filled += take
            cost += take * px
            remaining -= take
            if remaining <= EPS:
                break
        return filled, (cost / filled if filled else 0.0)

    def _clamp_reduce(self, coin: str, sz: float) -> float:
        p = self.state["positions"].get(coin)
        if not p or sign(p["size"]) == sign(sz):
            raise PaperError(f"Reduce-only order would not reduce your {coin} position.")
        return sign(sz) * min(abs(sz), abs(p["size"]))

    def _margin_check(self, coin: str, sz: float, px: float, fee_rate: float):
        """Raise if the account can't afford the post-trade margin. Reducing trades always pass."""
        m = self.market(coin)
        p = self.state["positions"].get(coin)
        size0, entry0 = (p["size"], p["entry"]) if p else (0.0, 0.0)
        new, entry, realized = apply_fill(size0, entry0, sz, px)
        if abs(new) <= abs(size0) + EPS and (abs(new) < EPS or sign(new) == sign(size0)):
            return
        fee = abs(sz) * px * fee_rate
        equity = self.equity() - self.upnl(coin) + realized - fee + new * (m.mark - entry)
        im = self.margin_used() - self.position_margin(coin) + abs(new) * m.mark / self.leverage(coin)
        free = equity - im - self.order_margin()
        if free < 0:
            raise PaperError(
                f"Insufficient margin: this needs ${im - (self.margin_used() - self.position_margin(coin)):,.2f} "
                f"at {self.leverage(coin)}x, you have ${self.available():,.2f} available.")

    def _execute(self, coin: str, sz: float, px: float, fee_rate: float, kind: str) -> dict:
        m = self.market(coin)
        positions = self.state["positions"]
        p = positions.get(coin)
        size0, entry0 = (p["size"], p["entry"]) if p else (0.0, 0.0)
        new, entry, realized = apply_fill(size0, entry0, sz, px)
        new = round(new, m.sz_decimals)
        fee = abs(sz) * px * fee_rate
        self.state["balance"] += realized - fee
        now = self.now_ms()
        if abs(new) < EPS:
            positions.pop(coin, None)
            self._drop_orphan_triggers(coin)
        elif p is None or sign(new) != sign(size0):
            positions[coin] = {"size": new, "entry": entry, "opened_ms": now,
                               "realized": 0.0, "funding": 0.0, "fees": fee}
        else:
            p.update(size=new, entry=entry)
            p["realized"] += realized
            p["fees"] = p.get("fees", 0.0) + fee
        trade = {"ts": now, "coin": coin, "side": "buy" if sz > 0 else "sell",
                 "sz": abs(sz), "px": px, "fee": fee, "realized": realized, "kind": kind, "lev": self.leverage(coin)}
        self.state["trades"].append(trade)
        return trade

    def _drop_orphan_triggers(self, coin: str):
        self.state["orders"] = [o for o in self.state["orders"]
                                if not (o["coin"] == coin and o["reduce_only"])]

    def _next_id(self) -> int:
        oid = self.state["next_order_id"]
        self.state["next_order_id"] += 1
        return oid

    # --------------------------------------------------------------- orders
    def market_order(self, coin: str, sz: float, reduce_only: bool = False,
                     slippage: float = MAX_SLIPPAGE, kind: str = "market") -> dict:
        m = self.market(coin)
        coin = m.name
        sz = round_size(sz, m.sz_decimals)
        if sz == 0:
            raise PaperError(f"Size too small: {coin} trades in steps of {10 ** -m.sz_decimals:g}.")
        if reduce_only:
            sz = self._clamp_reduce(coin, sz)
        limit_px = m.mark * (1 + slippage) if sz > 0 else m.mark * (1 - slippage)
        filled, avg = self._sweep(coin, sz, limit_px)
        filled = round_size(filled, m.sz_decimals)
        if filled <= 0:
            raise PaperError(f"No liquidity within {slippage:.0%} of mark.")
        signed = sign(sz) * filled
        self._margin_check(coin, signed, avg, self.taker_fee)
        trade = self._execute(coin, signed, avg, self.taker_fee, kind)
        trade["requested"] = abs(sz)
        trade["slippage"] = (avg / m.mark - 1) * sign(sz)
        self.save()
        return trade

    def limit_order(self, coin: str, sz: float, px: float, tif: str = "Gtc",
                    reduce_only: bool = False) -> dict:
        m = self.market(coin)
        coin = m.name
        tif = tif.capitalize()
        if tif not in ("Gtc", "Alo", "Ioc"):
            raise PaperError("Time in force must be gtc, alo (post-only) or ioc.")
        px = round_px(px, m.sz_decimals)
        sz = round_size(sz, m.sz_decimals)
        if sz == 0 or px <= 0:
            raise PaperError("Size and price must be positive.")
        if reduce_only:
            sz = self._clamp_reduce(coin, sz)
        result = {"fill": None, "order": None}
        bids, asks = self.book(coin)
        crosses = (sz > 0 and asks and px >= asks[0][0]) or (sz < 0 and bids and px <= bids[0][0])
        if crosses:
            if tif == "Alo":
                raise PaperError("Post-only order would cross the book - rejected.")
            filled, avg = self._sweep(coin, sz, px)
            filled = round_size(filled, m.sz_decimals)
            if filled > 0:
                self._margin_check(coin, sign(sz) * filled, avg, self.taker_fee)
                result["fill"] = self._execute(coin, sign(sz) * filled, avg, self.taker_fee, "limit")
                sz = sign(sz) * round(abs(sz) - filled, m.sz_decimals)
        if tif == "Ioc" or abs(sz) < EPS:
            self.save()
            return result
        if not reduce_only:
            need = abs(sz) * px / self.leverage(coin)
            if need > self.available():
                raise PaperError(f"Insufficient margin to rest order: needs ${need:,.2f}, "
                                 f"${self.available():,.2f} available.")
        order = {"id": self._next_id(), "coin": coin, "type": "limit",
                 "side": "buy" if sz > 0 else "sell", "sz": abs(sz), "px": px,
                 "tif": tif, "reduce_only": reduce_only, "ts": self.now_ms()}
        self.state["orders"].append(order)
        result["order"] = order
        self.save()
        return result

    def trigger_order(self, coin: str, kind: str, trigger_px: float, sz: float | None = None) -> dict:
        """Reduce-only take-profit ('tp') or stop-loss ('sl') market order, triggered on mark."""
        m = self.market(coin)
        coin = m.name
        p = self.state["positions"].get(coin)
        if not p:
            raise PaperError(f"No open {coin} position to attach a {kind.upper()} to.")
        long = p["size"] > 0
        trigger_px = round_px(trigger_px, m.sz_decimals)
        if kind == "sl" and ((long and trigger_px >= m.mark) or (not long and trigger_px <= m.mark)):
            raise PaperError(f"Stop-loss for a {'long' if long else 'short'} must be "
                             f"{'below' if long else 'above'} mark ({m.mark:g}).")
        if kind == "tp" and ((long and trigger_px <= m.mark) or (not long and trigger_px >= m.mark)):
            raise PaperError(f"Take-profit for a {'long' if long else 'short'} must be "
                             f"{'above' if long else 'below'} mark ({m.mark:g}).")
        if sz is not None:
            sz = min(round_size(abs(sz), m.sz_decimals), abs(p["size"]))
        order = {"id": self._next_id(), "coin": coin, "type": kind,
                 "side": "sell" if long else "buy", "sz": sz, "trigger_px": trigger_px,
                 "reduce_only": True, "ts": self.now_ms()}
        self.state["orders"].append(order)
        self.save()
        return order

    def cancel(self, target: str = "all") -> int:
        before = len(self.state["orders"])
        if target == "all":
            self.state["orders"] = []
        elif target.isdigit():
            self.state["orders"] = [o for o in self.state["orders"] if o["id"] != int(target)]
        else:
            name = self.market(target).name
            self.state["orders"] = [o for o in self.state["orders"] if o["coin"] != name]
        n = before - len(self.state["orders"])
        self.save()
        return n

    def close(self, coin: str, fraction: float = 1.0) -> dict:
        name = self.market(coin).name
        p = self.state["positions"].get(name)
        if not p:
            raise PaperError(f"No open {name} position.")
        return self.market_order(name, -p["size"] * fraction, reduce_only=True, kind="close")

    def set_leverage(self, coin: str, lev: int) -> int:
        m = self.market(coin)
        cap = MAX_LEVERAGE if self.over_cap else m.max_leverage
        if lev < 1 or lev > cap:
            raise PaperError(f"{m.name} leverage must be 1-{cap}x.")
        old = self.state["leverage"].get(m.name)
        self.state["leverage"][m.name] = lev
        if self.available() < 0:
            if old is None:
                self.state["leverage"].pop(m.name)
            else:
                self.state["leverage"][m.name] = old
            raise PaperError("Not enough margin to lower leverage that far with your open position.")
        self.save()
        return lev

    # ------------------------------------------------------------ the loop
    def update(self) -> list[str]:
        """Pull fresh prices, then settle funding, triggers, resting limits and liquidation."""
        self.refresh()
        events = []
        events += self._apply_funding()
        events += self._process_triggers()
        events += self._process_limits()
        events += self._check_liquidation()
        self._record_equity()
        self.save()
        return events

    def _apply_funding(self) -> list[str]:
        now, last = self.now_ms(), self.state["last_funding_ms"]
        if now // HOUR_MS == last // HOUR_MS:
            return []
        events = []
        try:
            for coin, p in self.state["positions"].items():
                m = self.market(coin)
                start = max(last, p["opened_ms"])
                total = 0.0
                for h in self.client.funding_history(coin, start + 1, now):
                    t = int(h["time"])
                    if t <= start or t > now:
                        continue
                    rate = float(h["fundingRate"])
                    pay = -p["size"] * m.oracle * rate   # positive rate: longs pay shorts
                    total += pay
                    self.state["funding_log"].append(
                        {"ts": t, "coin": coin, "rate": rate, "size": p["size"], "payment": pay})
                if total:
                    self.state["balance"] += total
                    p["funding"] += total
                    events.append(f"Funding {coin}: {'received' if total > 0 else 'paid'} ${abs(total):,.4f}")
        except Exception as e:  # don't advance the clock if history couldn't be fetched
            return [f"Funding update skipped ({e})"]
        self.state["last_funding_ms"] = now
        return events

    def _process_triggers(self) -> list[str]:
        events = []
        for o in [o for o in self.state["orders"] if o["type"] in ("sl", "tp")]:
            if o not in self.state["orders"]:
                continue  # removed when an earlier trigger closed the position
            m = self.market(o["coin"])
            sell = o["side"] == "sell"
            hit = (m.mark <= o["trigger_px"] if sell else m.mark >= o["trigger_px"]) if o["type"] == "sl" \
                else (m.mark >= o["trigger_px"] if sell else m.mark <= o["trigger_px"])
            if not hit:
                continue
            self.state["orders"].remove(o)
            p = self.state["positions"].get(o["coin"])
            if not p:
                continue
            sz = o["sz"] or abs(p["size"])
            try:
                t = self.market_order(o["coin"], -sign(p["size"]) * sz, reduce_only=True, kind=o["type"])
                events.append(f"{o['type'].upper()} #{o['id']} triggered: {t['side']} {t['sz']:g} "
                              f"{t['coin']} @ {t['px']:g}  pnl ${t['realized']:,.2f}")
            except PaperError as e:
                events.append(f"{o['type'].upper()} #{o['id']} failed: {e}")
        return events

    def _process_limits(self) -> list[str]:
        events = []
        for o in [o for o in self.state["orders"] if o["type"] == "limit"]:
            if o not in self.state["orders"]:
                continue
            m = self.market(o["coin"])
            buy = o["side"] == "buy"
            if not ((buy and m.ref_px <= o["px"]) or (not buy and m.ref_px >= o["px"])):
                continue
            self.state["orders"].remove(o)
            sz = o["sz"] if buy else -o["sz"]
            try:
                if o["reduce_only"]:
                    sz = self._clamp_reduce(o["coin"], sz)
                self._margin_check(o["coin"], sz, o["px"], self.maker_fee)
                t = self._execute(o["coin"], sz, o["px"], self.maker_fee, "limit")
                events.append(f"Limit #{o['id']} filled: {t['side']} {t['sz']:g} {t['coin']} @ {t['px']:g}")
            except PaperError as e:
                events.append(f"Limit #{o['id']} cancelled: {e}")
        return events

    def _check_liquidation(self) -> list[str]:
        if not self.state["positions"] or self.equity() >= self.maintenance():
            return []
        eq, mm = self.equity(), self.maintenance()
        for coin, p in list(self.state["positions"].items()):
            self._execute(coin, -p["size"], self.market(coin).mark, self.taker_fee, "liquidation")
        self.state["orders"] = []
        return [f"LIQUIDATED: equity ${eq:,.2f} fell below maintenance margin ${mm:,.2f}. "
                f"All positions closed at mark."]

    def _record_equity(self):
        curve = self.state["equity_curve"]
        now = self.now_ms()
        if not curve or now - curve[-1][0] >= 60_000:
            curve.append([now, round(self.equity(), 4)])
            del curve[:-5000]

    # --------------------------------------------------------------- stats
    def stats(self) -> dict:
        trades = self.state["trades"]
        closes = [t for t in trades if abs(t["realized"]) > EPS]
        wins = [t for t in closes if t["realized"] > 0]
        return {
            "equity": self.equity(),
            "start": self.state["starting_balance"],
            "return": self.equity() / self.state["starting_balance"] - 1,
            "realized": sum(t["realized"] for t in trades),
            "fees": sum(t["fee"] for t in trades),
            "funding": sum(f["payment"] for f in self.state["funding_log"]),
            "trades": len(trades),
            "closing_trades": len(closes),
            "win_rate": len(wins) / len(closes) if closes else None,
            "best": max((t["realized"] for t in closes), default=0.0),
            "worst": min((t["realized"] for t in closes), default=0.0),
            "volume": sum(t["sz"] * t["px"] for t in trades),
        }
