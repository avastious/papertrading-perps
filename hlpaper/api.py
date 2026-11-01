"""Thin client for Hyperliquid's public (no-auth) info endpoint.

Only read-only market data is used. No keys, no signing, no real orders.
Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
"""
from __future__ import annotations

import time

import requests

MAINNET = "https://api.hyperliquid.xyz"
TESTNET = "https://api.hyperliquid-testnet.xyz"


class HyperliquidAPIError(Exception):
    pass


class HyperliquidClient:
    def __init__(self, base_url: str = MAINNET, timeout: float = 10.0, session=None):
        self.url = base_url.rstrip("/") + "/info"
        self.timeout = timeout
        self.session = session or requests.Session()

    def _post(self, payload: dict):
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                r = self.session.post(self.url, json=payload, timeout=self.timeout)
                if r.status_code == 429:  # rate limited, back off
                    last_err = HyperliquidAPIError("rate limited (429)")
                    time.sleep(1.0 + attempt)
                    continue
                r.raise_for_status()
                return r.json()
            except (requests.RequestException, ValueError) as e:
                last_err = e
                time.sleep(0.5 * (attempt + 1))
        raise HyperliquidAPIError(f"{payload.get('type')} request failed: {last_err}")

    # --- endpoints -------------------------------------------------------
    def meta_and_ctxs(self):
        """[meta, assetCtxs] for every perp: max leverage, size decimals, mark,
        mid, oracle, hourly funding, open interest, 24h volume."""
        return self._post({"type": "metaAndAssetCtxs"})

    def l2_book(self, coin: str):
        """{'coin', 'time', 'levels': [bids, asks]} with up to 20 levels a side."""
        return self._post({"type": "l2Book", "coin": coin})

    def funding_history(self, coin: str, start_ms: int, end_ms: int | None = None):
        """[{'coin', 'fundingRate', 'premium', 'time'}] - one entry per hour."""
        payload = {"type": "fundingHistory", "coin": coin, "startTime": int(start_ms)}
        if end_ms is not None:
            payload["endTime"] = int(end_ms)
        return self._post(payload)

    def candles(self, coin: str, interval: str, start_ms: int, end_ms: int):
        """[{'t','T','o','h','l','c','v','n','i','s'}] OHLCV candles."""
        return self._post({
            "type": "candleSnapshot",
            "req": {"coin": coin, "interval": interval,
                    "startTime": int(start_ms), "endTime": int(end_ms)},
        })
