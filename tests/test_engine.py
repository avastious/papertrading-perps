"""Engine tests against a fake Hyperliquid client that returns real-shaped responses."""
import pytest

from aureous.engine import HOUR_MS, PaperError, PaperExchange, apply_fill, round_px, round_size


class FakeClient:
    def __init__(self):
        self.px = {"BTC": 60_000.0, "ETH": 3_000.0}
        self.funding_events = []
        self.depth = 1.0  # coins per book level

    def meta_and_ctxs(self):
        meta = {"universe": [{"name": "BTC", "szDecimals": 5, "maxLeverage": 40},
                             {"name": "ETH", "szDecimals": 4, "maxLeverage": 25},
                             {"name": "OLD", "szDecimals": 0, "maxLeverage": 3, "isDelisted": True}]}
        ctxs = [{"markPx": str(p), "midPx": str(p), "oraclePx": str(p), "funding": "0.0000125",
                 "openInterest": "1000", "dayNtlVlm": "1000000000", "prevDayPx": str(p)}
                for p in self.px.values()] + [{"markPx": "1", "midPx": None, "oraclePx": "1"}]
        return [meta, ctxs]

    def l2_book(self, coin):
        p = self.px[coin]
        lvl = lambda px: {"px": str(px), "sz": str(self.depth), "n": 1}
        return {"coin": coin, "levels": [[lvl(round(p * (1 - 0.0001 * i), 2)) for i in range(1, 21)],
                                         [lvl(round(p * (1 + 0.0001 * i), 2)) for i in range(1, 21)]]}

    def funding_history(self, coin, start, end=None):
        return [e for e in self.funding_events if e["coin"] == coin and start <= e["time"] <= (end or 1e18)]

    def candles(self, *a):
        return []


class Clock:
    def __init__(self, t=1_700_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


@pytest.fixture
def env(tmp_path):
    client, clock = FakeClient(), Clock()
    ex = PaperExchange(client, str(tmp_path / "acct.json"), starting_balance=10_000,
                       refresh_secs=0, clock=clock)
    return ex, client, clock


def test_helpers():
    assert round_size(0.123456789, 5) == 0.12345
    assert round_size(-0.0099, 2) == -0.0
    assert round_px(60123.456, 5) == 60123
    assert round_px(3.141592, 0) == 3.1416
    assert round_px(0.000123456, 0) == 0.000123
    assert apply_fill(1, 100, 1, 200) == (2, 150, 0)
    assert apply_fill(2, 100, -1, 150) == (1, 100, 50)
    assert apply_fill(1, 100, -3, 90) == (-2, 90, -10)
    assert apply_fill(-1, 100, 1, 80)[2] == 20


def test_markets_skip_delisted_and_case_insensitive(env):
    ex, *_ = env
    assert ex.market("btc").name == "BTC"
    with pytest.raises(PaperError):
        ex.market("OLD")


def test_market_long_pnl_and_close(env):
    ex, client, _ = env
    t = ex.market_order("BTC", 0.1)
    assert t["sz"] == 0.1 and t["px"] == pytest.approx(60006.0)   # first ask level
    assert ex.state["balance"] == pytest.approx(10_000 - 0.1 * 60006 * 0.00045)
    client.px["BTC"] = 61_000
    ex.update()
    assert ex.upnl("BTC") == pytest.approx(0.1 * (61_000 - 60006))
    c = ex.close("BTC")
    assert c["realized"] == pytest.approx(0.1 * (c["px"] - 60006))
    assert "BTC" not in ex.state["positions"]


def test_book_sweep_slippage_and_partial(env):
    ex, client, _ = env
    client.depth = 0.05
    t = ex.market_order("ETH", 0.12)                  # walks 3 levels
    assert t["sz"] == 0.12 and t["px"] > 3000.3
    client.depth = 0.001
    ex.set_leverage("BTC", 40)
    t = ex.market_order("BTC", 1)                    # book too thin: partial
    assert t["sz"] == pytest.approx(0.02) and t["requested"] == 1


def test_usd_margin_and_leverage_checks(env):
    ex, *_ = env
    ex.set_leverage("BTC", 2)
    with pytest.raises(PaperError, match="Insufficient margin"):
        ex.market_order("BTC", 0.5)                  # $30k notional at 2x needs $15k
    with pytest.raises(PaperError):
        ex.set_leverage("BTC", 41)
    ex.set_leverage("BTC", 40)
    ex.market_order("BTC", 0.5)
    with pytest.raises(PaperError, match="lower leverage"):
        ex.set_leverage("BTC", 1)
    ex.close("BTC")                                  # reducing always allowed


def test_flip_and_reduce_only(env):
    ex, *_ = env
    ex.market_order("ETH", 1)
    ex.market_order("ETH", -3)
    assert ex.state["positions"]["ETH"]["size"] == -2
    with pytest.raises(PaperError, match="Reduce-only"):
        ex.market_order("ETH", -1, reduce_only=True)
    t = ex.market_order("ETH", 5, reduce_only=True)   # clamped to 2
    assert t["sz"] == 2 and "ETH" not in ex.state["positions"]


def test_limit_rest_fill_and_post_only(env):
    ex, client, _ = env
    r = ex.limit_order("ETH", 1, 2900)
    assert r["order"] and not r["fill"]
    assert ex.order_margin() == pytest.approx(2900 / 10)
    with pytest.raises(PaperError, match="Post-only"):
        ex.limit_order("ETH", 1, 3100, tif="alo")
    client.px["ETH"] = 2_899
    events = ex.update()
    assert any("filled" in e for e in events)
    p = ex.state["positions"]["ETH"]
    assert p["entry"] == 2900 and ex.state["trades"][-1]["fee"] == pytest.approx(2900 * 0.00015)


def test_marketable_limit_fills_as_taker(env):
    ex, *_ = env
    r = ex.limit_order("BTC", 0.01, 61_000)
    assert r["fill"]["sz"] == 0.01 and r["order"] is None
    r = ex.limit_order("BTC", 0.01, 59_000, tif="ioc")
    assert r == {"fill": None, "order": None}


def test_stop_loss_and_take_profit(env):
    ex, client, _ = env
    ex.market_order("BTC", 0.1)
    with pytest.raises(PaperError, match="below"):
        ex.trigger_order("BTC", "sl", 61_000)
    ex.trigger_order("BTC", "sl", 59_000)
    ex.trigger_order("BTC", "tp", 65_000)
    client.px["BTC"] = 58_900
    events = ex.update()
    assert any("SL" in e for e in events)
    assert "BTC" not in ex.state["positions"] and ex.state["orders"] == []   # TP cleaned up


def test_short_take_profit(env):
    ex, client, _ = env
    ex.market_order("ETH", -2)
    ex.trigger_order("ETH", "tp", 2800, 1)
    client.px["ETH"] = 2790
    ex.update()
    assert ex.state["positions"]["ETH"]["size"] == -1


def test_funding_hourly(env):
    ex, client, clock = env
    ex.market_order("BTC", 0.1)
    opened = ex.now_ms()
    first_hour = (opened // HOUR_MS + 1) * HOUR_MS
    client.funding_events = [{"coin": "BTC", "fundingRate": "0.0001", "time": first_hour},
                             {"coin": "BTC", "fundingRate": "-0.00005", "time": first_hour + HOUR_MS}]
    bal = ex.state["balance"]
    clock.t += 2.5 * 3600
    ex.update()
    expected = -0.1 * 60_000 * 0.0001 + 0.1 * 60_000 * 0.00005
    assert ex.state["balance"] - bal == pytest.approx(expected)
    ex.update()                                       # no double counting
    assert ex.state["balance"] - bal == pytest.approx(expected)


def test_liquidation(env):
    ex, client, _ = env
    ex.set_leverage("BTC", 40)
    ex.market_order("BTC", 6)                          # ~$360k notional on $10k
    liq = ex.liq_price("BTC")
    assert 58_000 < liq < 60_000
    client.px["BTC"] = liq * 1.001
    assert not any("LIQUIDATED" in e for e in ex.update())
    client.px["BTC"] = liq * 0.999
    assert any("LIQUIDATED" in e for e in ex.update())
    assert ex.state["positions"] == {}


def test_persistence(env, tmp_path):
    ex, client, clock = env
    ex.market_order("ETH", 1)
    ex.limit_order("BTC", 0.01, 50_000)
    ex2 = PaperExchange(client, ex.state_path, refresh_secs=0, clock=clock)
    assert ex2.state["positions"]["ETH"]["size"] == 1
    assert len(ex2.state["orders"]) == 1
    assert ex2.equity() == pytest.approx(ex.equity())


def test_builder_markets_merged(monkeypatch):
    from aureous.api import HyperliquidAPIError, HyperliquidClient
    hl, down = HyperliquidClient(), {"xyz": False}

    def post(payload):
        if payload.get("dex") == "xyz":
            if down["xyz"]:
                raise HyperliquidAPIError("down")
            return [{"universe": [{"name": "xyz:XYZ100", "szDecimals": 4, "maxLeverage": 30},
                                  {"name": "xyz:TSLA", "szDecimals": 3, "maxLeverage": 10}]}, [{"markPx": "25000"}, {"markPx": "400"}]]
        return [{"universe": [{"name": "BTC", "szDecimals": 5, "maxLeverage": 40}]}, [{"markPx": "60000"}]]

    monkeypatch.setattr(hl, "_post", post)
    meta, ctxs = hl.meta_and_ctxs()
    assert [u["name"] for u in meta["universe"]] == ["BTC", "xyz:XYZ100"] and ctxs[1]["markPx"] == "25000"
    down["xyz"] = True
    meta, _ = hl.meta_and_ctxs()
    assert [u["name"] for u in meta["universe"]] == ["BTC", "xyz:XYZ100"]
