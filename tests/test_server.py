"""API-level tests for the web server (no browser)."""
import json, os, sys, threading, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from http.server import ThreadingHTTPServer
from test_engine import FakeClient
from aureous.engine import PaperExchange
from aureous.server import App, make_handler

def setup(tmp):
    ex = PaperExchange(FakeClient(), str(tmp / "a.json"), refresh_secs=0)
    app = App(ex)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(app))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    def call(path, body=None):
        req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
    return ex, call

def test_flow(tmp_path):
    ex, call = setup(tmp_path)
    s, r = call("/api/order", {"coin": "btc", "side": "buy", "type": "market", "size": 3000, "unit": "usd", "leverage": 20, "tp": 65000, "sl": 58000})
    assert s == 200 and ex.state["positions"]["BTC"]["size"] == 0.05 and ex.leverage("BTC") == 20
    s, r = call("/api/order", {"coin": "BTC", "side": "buy", "type": "market", "size": 0.01, "unit": "coin", "tp": 66000})
    tps = [o for o in ex.state["orders"] if o["type"] == "tp"]
    assert len(tps) == 1 and tps[0]["trigger_px"] == 66000            # replaced, not stacked
    s, r = call("/api/tpsl", {"coin": "BTC", "tp": "", "sl": "59000"})
    assert [o["type"] for o in ex.state["orders"]] == ["sl"]
    s, r = call("/api/tpsl", {"coin": "BTC", "tp": "50000"})          # invalid: keep old orders
    assert s == 400 and [o["trigger_px"] for o in ex.state["orders"]] == [59000]
    s, r = call("/api/order", {"coin": "ETH", "side": "sell", "type": "limit", "size": 1, "unit": "coin", "price": 3100, "tif": "Alo"})
    assert s == 200 and ex.state["orders"][-1]["tif"] == "Alo"
    s, r = call("/api/state"); assert r["positions"][0]["coin"] == "BTC" and len(r["orders"]) == 2
    s, r = call("/api/close", {"coin": "BTC", "fraction": 0.5}); assert s == 200
    s, r = call("/api/cancel", {"target": "all"}); assert ex.state["orders"] == []
    s, r = call("/api/order", {"coin": "BTC", "side": "buy", "size": 10_000_000}); assert s == 400 and "Insufficient" in r["error"]
    s, r = call("/api/order", {"coin": "NOPE", "side": "buy", "size": 1}); assert s == 400
    s, r = call("/api/leverage", {"coin": "ETH", "leverage": 1001}); assert s == 400
    s, r = call("/api/book?coin=eth"); assert r["coin"] == "ETH" and len(r["bids"]) == 14
    s, r = call("/api/reset", {"balance": 5000}); assert ex.state["balance"] == 5000
