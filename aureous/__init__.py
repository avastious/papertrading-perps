"""Aureous - paper-trade Hyperliquid perpetuals against live market data."""
from .api import HyperliquidClient
from .engine import PaperError, PaperExchange

__all__ = ["HyperliquidClient", "PaperExchange", "PaperError"]
__version__ = "0.1.0"
