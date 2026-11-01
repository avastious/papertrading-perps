"""Local web server for Aureous: serves the website and a small JSON API over the
paper-trading engine. Binds to 127.0.0.1 only, so it's reachable from this computer alone.
No dependencies beyond the standard library."""
from __future__ import annotations

import json
import os
import re
import threading
import time
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .api import HyperliquidAPIError
from .engine import EPS, PaperError, PaperExchange

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/lightweight-charts.js": ("lightweight-charts.js", "application/javascript"),  # TradingView, Apache-2.0
    "/engine.js": ("engine.js", "application/javascript"),  # browser engine; unused in server mode
    "/auth.js": ("auth.js", "application/javascript"),  # accounts for the public site; inert in server mode
    "/firebase-config.js": ("firebase-config.js", "application/javascript"),
}
INTERVAL_SECS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}


def fill_msg(t: dict) -> str:
    side = "Bought" if t["side"] == "buy" else "Sold"
    msg = f"{side} {t['sz']:g} {t['coin']} at {t['px']:,.6g}"
    if abs(t["realized"]) > 1e-9:
        msg += f" · PnL {'+' if t['realized'] >= 0 else '-'}${abs(t['realized']):,.2f}"
    if t.get("requested") and t["sz"] < t["requested"] - 1e-12:
        msg += f" (partial: book only had {t['sz']:g} of {t['requested']:g} within 5% of mark)"
    return msg


class App:
    def __init__(self, ex: PaperExchange):
        self.ex = ex
        self.lock = threading.RLock()
        self.events: list[dict] = []
        self.event_id = 0
        self.error: str | None = None

    def log(self, kind: str, msg: str):
        self.event_id += 1
        self.events.append({"id": self.event_id, "ts": int(time.time() * 1000), "kind": kind, "msg": msg})
        del self.events[:-200]

    def run_engine(self, every: float = 2.0):
        """Keeps limits, TP/SL, funding and liquidation working while the site is open."""
        while True:
            try:
                with self.lock:
                    for e in self.ex.update():
                        self.log("liquidation" if "LIQUIDATED" in e else "event", e)
                    self.error = None
            except Exception as e:  # network hiccup: keep last prices, show a banner
                self.error = str(e)
            time.sleep(every)

    # ----------------------------------------------------------- read models
    def markets(self):
        ex = self.ex
        with self.lock:
            ex.refresh()
            return [{
                "name": m.name, "mark": m.mark, "mid": m.mid, "oracle": m.oracle,
                "change": m.change_24h, "funding": m.funding, "volume": m.day_volume,
                "oi": m.open_interest * m.mark, "max_lev": m.max_leverage, "sz_dec": m.sz_decimals,
                "lev": ex.leverage(m.name),
            } for m in ex.markets.values()]

    def state(self, since: int = 0):
        ex = self.ex
        with self.lock:
            orders = ex.state["orders"]
            positions = []
            for coin, p in ex.state["positions"].items():
                m = ex.market(coin)
                lev = ex.leverage(coin)
                upnl = ex.upnl(coin)
                margin = abs(p["size"]) * p["entry"] / lev
                positions.append({
                    "coin": coin, "size": p["size"], "entry": p["entry"], "mark": m.mark,
                    "value": abs(p["size"]) * m.mark, "upnl": upnl, "roe": upnl / margin if margin else 0,
                    "liq": ex.liq_price(coin), "lev": lev, "funding": p["funding"], "margin": margin,
                    "tp": [o for o in orders if o["coin"] == coin and o["type"] == "tp"],
                    "sl": [o for o in orders if o["coin"] == coin and o["type"] == "sl"],
                })
            eq = ex.equity()
            return {
                "equity": eq, "balance": ex.state["balance"], "upnl": eq - ex.state["balance"],
                "margin_used": ex.margin_used(), "maintenance": ex.maintenance(),
                "order_margin": ex.order_margin(), "available": ex.available(),
                "start": ex.state["starting_balance"], "fees": {"taker": ex.taker_fee, "maker": ex.maker_fee},
                "positions": positions, "orders": orders,
                "trades": ex.state["trades"][-200:][::-1],
                "funding": ex.state["funding_log"][-200:][::-1],
                "stats": ex.stats(), "curve": ex.state["equity_curve"][-1000:],
                "events": [e for e in self.events if e["id"] > since], "last_event": self.event_id,
                "error": self.error,
            }

    def book(self, coin: str):
        with self.lock:
            name = self.ex.market(coin).name
        bids, asks = self.ex.book(name)
        return {"coin": name, "bids": bids[:14], "asks": asks[:14]}

    def candles(self, coin: str, interval: str, n: int, end: int | None = None):
        secs = INTERVAL_SECS.get(interval)
        if not secs:
            raise PaperError("Unsupported interval")
        with self.lock:
            name = self.ex.market(coin).name
        end = end or int(time.time() * 1000)
        raw = self.ex.client.candles(name, interval, end - n * secs * 1000, end)
        return [[k["t"], float(k["o"]), float(k["h"]), float(k["l"]), float(k["c"]), float(k["v"])]
                for k in raw][-n:]

    # --------------------------------------------------------------- actions
    def order(self, b: dict):
        ex = self.ex
        msgs = []
        with self.lock:
            m = ex.market(b["coin"])
            coin = m.name
            if b.get("leverage") and int(b["leverage"]) != ex.leverage(coin):
                ex.set_leverage(coin, int(b["leverage"]))
            direction = 1 if b["side"] == "buy" else -1
            is_limit = b.get("type") == "limit"
            price = float(b["price"]) if is_limit else m.mark
            if is_limit and price <= 0:
                raise PaperError("Enter a limit price.")
            size = float(b["size"])
            if size <= 0:
                raise PaperError("Enter a size.")
            coins = size / price if b.get("unit", "usd") == "usd" else size
            ro = bool(b.get("reduce_only"))
            if is_limit:
                res = ex.limit_order(coin, direction * coins, price, tif=b.get("tif", "Gtc"), reduce_only=ro)
                if res["fill"]:
                    msgs.append(fill_msg(res["fill"]))
                if res["order"]:
                    o = res["order"]
                    msgs.append(f"Limit {o['side']} {o['sz']:g} {coin} at {o['px']:,.6g} placed")
                elif not res["fill"]:
                    msgs.append("Order didn't fill and was cancelled (IOC)")
            else:
                msgs.append(fill_msg(ex.market_order(coin, direction * coins, reduce_only=ro)))
            warnings = []
            if coin in ex.state["positions"]:
                for kind in ("tp", "sl"):
                    if b.get(kind):
                        try:
                            old = [o for o in ex.state["orders"]
                                   if o["coin"] == coin and o["type"] == kind and o["sz"] is None]
                            ex.trigger_order(coin, kind, float(b[kind]))  # validates first
                            ex.state["orders"] = [o for o in ex.state["orders"] if o not in old]
                            ex.save()
                            msgs.append(f"{'Take-profit' if kind == 'tp' else 'Stop-loss'} set at {float(b[kind]):,.6g}")
                        except PaperError as e:
                            warnings.append(str(e))
        for msg in msgs:
            self.log("fill", msg)
        return {"messages": msgs, "warnings": warnings}

    def close(self, b: dict):
        with self.lock:
            coins = list(self.ex.state["positions"]) if b.get("coin") == "all" else [b["coin"]]
            if not coins:
                raise PaperError("No open positions.")
            msgs = [fill_msg(self.ex.close(c, float(b.get("fraction", 1)))) for c in coins]
        for m in msgs:
            self.log("fill", m)
        return {"messages": msgs}

    def cancel(self, b: dict):
        with self.lock:
            n = self.ex.cancel(str(b.get("target", "all")))
        return {"messages": [f"Cancelled {n} order{'s' if n != 1 else ''}"]}

    def tpsl(self, b: dict):
        """Replace a position's whole-position TP and SL with the given prices (blank = none)."""
        ex = self.ex
        with self.lock:
            coin = ex.market(b["coin"]).name
            saved = list(ex.state["orders"])
            ex.state["orders"] = [o for o in saved if not (o["coin"] == coin and o["type"] in ("tp", "sl"))]
            msgs = []
            try:
                for kind, label in (("tp", "Take-profit"), ("sl", "Stop-loss")):
                    if b.get(kind) not in (None, ""):
                        o = ex.trigger_order(coin, kind, float(b[kind]))
                        msgs.append(f"{label} set at {o['trigger_px']:,.6g}")
            except PaperError:
                ex.state["orders"] = saved
                ex.save()
                raise
            ex.save()
        return {"messages": msgs or [f"TP/SL removed from {coin}"]}

    def leverage(self, b: dict):
        with self.lock:
            lev = self.ex.set_leverage(b["coin"], int(b["leverage"]))
        return {"messages": [f"{b['coin']} leverage set to {lev}x"], "leverage": lev}

    def reset(self, b: dict):
        bal = float(b.get("balance") or 0) or None
        if bal is not None and bal <= 0:
            raise PaperError("Starting balance must be positive.")
        with self.lock:
            self.ex.reset(bal)
            self.events.clear()
        return {"messages": [f"Fresh account with ${self.ex.state['balance']:,.2f}"]}


def make_handler(app: App):
    posts = {"/api/order": app.order, "/api/close": app.close, "/api/cancel": app.cancel,
             "/api/tpsl": app.tpsl, "/api/leverage": app.leverage, "/api/reset": app.reset}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code: int, body: bytes, ctype: str):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, obj):
            self._send(code, json.dumps(obj).encode(), "application/json")

        def _guard(self, fn):
            try:
                out = fn()
                self._json(200, {"ok": True, **out} if isinstance(out, dict) else {"ok": True, "data": out})
            except PaperError as e:
                self._json(400, {"ok": False, "error": str(e)})
            except HyperliquidAPIError as e:
                self._json(502, {"ok": False, "error": f"Couldn't reach Hyperliquid: {e}"})
            except (KeyError, ValueError, TypeError) as e:
                self._json(400, {"ok": False, "error": f"Bad request: {e}"})
            except Exception as e:
                traceback.print_exc()
                self._json(500, {"ok": False, "error": str(e)})

        def do_GET(self):
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path.startswith("/fonts/") and re.fullmatch(r"/fonts/[\w.-]+\.woff2", url.path):
                fp = os.path.join(WEB_DIR, "fonts", os.path.basename(url.path))
                if os.path.exists(fp):
                    with open(fp, "rb") as f:
                        return self._send(200, f.read(), "font/woff2")
            page = re.fullmatch(r"/([\w-]+\.(?:html|css|js))", url.path)
            if page and url.path not in STATIC and os.path.exists(os.path.join(WEB_DIR, page.group(1))):
                kind = {"html": "text/html; charset=utf-8", "css": "text/css", "js": "application/javascript"}[page.group(1).rsplit(".", 1)[1]]
                with open(os.path.join(WEB_DIR, page.group(1)), "rb") as f:
                    return self._send(200, f.read(), kind)
            if url.path in STATIC:
                name, ctype = STATIC[url.path]
                with open(os.path.join(WEB_DIR, name), "rb") as f:
                    data = f.read()
                if name == "index.html":  # same page as the website, but trading goes through this server
                    data = data.replace(b'name="aureous-mode" content="browser"', b'name="aureous-mode" content="server"')
                return self._send(200, data, ctype)
            routes = {
                "/api/markets": lambda: app.markets(),
                "/api/state": lambda: app.state(int(q.get("since", 0))),
                "/api/book": lambda: app.book(q["coin"]),
                "/api/candles": lambda: app.candles(q["coin"], q.get("interval", "1h"), min(int(q.get("n", 120)), 1000),
                                                    int(q["end"]) if q.get("end") else None),
            }
            if url.path in routes:
                return self._guard(routes[url.path])
            self._json(404, {"ok": False, "error": "Not found"})

        def do_POST(self):
            fn = posts.get(urlparse(self.path).path)
            if not fn:
                return self._json(404, {"ok": False, "error": "Not found"})
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                return self._json(400, {"ok": False, "error": "Body must be JSON"})
            self._guard(lambda: fn(body))

    return Handler


def serve(ex: PaperExchange, port: int = 8321, open_browser: bool = True, engine_every: float = 2.0):
    ex.refresh_secs = 2.0
    app = App(ex)
    threading.Thread(target=app.run_engine, args=(engine_every,), daemon=True).start()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app))
    url = f"http://127.0.0.1:{port}"
    print(f"Aureous is running at {url}  (keep this window open; Ctrl+C to stop)")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped. Your account is saved.")
    finally:
        httpd.server_close()
