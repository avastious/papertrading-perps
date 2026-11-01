"""Aureous entry point.

    python -m aureous web          open the website (click to trade) in your browser
    python -m aureous              terminal version
    python -m aureous buy BTC 0.01 run one terminal command and exit
"""
import argparse
import os
import shutil
import sys

from .api import MAINNET, TESTNET, HyperliquidAPIError, HyperliquidClient
from .engine import PaperExchange

DEFAULT_STATE = os.path.expanduser("~/.aureous/account.json")
LEGACY_STATE = os.path.expanduser("~/.hlpaper/account.json")  # name used before the rename


def default_state_path() -> str:
    if not os.path.exists(DEFAULT_STATE) and os.path.exists(LEGACY_STATE):
        os.makedirs(os.path.dirname(DEFAULT_STATE), exist_ok=True)
        shutil.copy2(LEGACY_STATE, DEFAULT_STATE)
    return DEFAULT_STATE


def main(argv=None):
    ap = argparse.ArgumentParser(prog="aureous", description="Aureous: paper-trade Hyperliquid perps with live market data.")
    ap.add_argument("--state", default=None,
                    help="account file (default ~/.aureous/account.json); use different files for separate accounts")
    ap.add_argument("--balance", type=float, default=10_000, help="starting USDC for a new account (default 10000)")
    ap.add_argument("--testnet", action="store_true", help="use Hyperliquid testnet market data")
    ap.add_argument("--taker-fee", type=float, default=0.00045, help="taker fee rate (default 0.00045 = 0.045%%)")
    ap.add_argument("--maker-fee", type=float, default=0.00015, help="maker fee rate (default 0.00015 = 0.015%%)")
    ap.add_argument("--port", type=int, default=8321, help="port for 'web' (default 8321)")
    ap.add_argument("--no-browser", action="store_true", help="with 'web': don't open a browser tab")
    ap.add_argument("command", nargs=argparse.REMAINDER, help="'web', or a one-shot terminal command")
    a = ap.parse_args(argv)
    try:  # never crash on symbols like ✓ in consoles with a legacy code page
        sys.stdout.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

    client = HyperliquidClient(TESTNET if a.testnet else MAINNET)
    ex = PaperExchange(client, a.state or default_state_path(), starting_balance=a.balance,
                       taker_fee=a.taker_fee, maker_fee=a.maker_fee)
    try:
        ex.refresh(force=True)
    except HyperliquidAPIError as e:
        print(f"Could not reach Hyperliquid: {e}", file=sys.stderr)
        return 1

    if a.command[:1] == ["web"]:
        from .server import serve
        serve(ex, port=a.port, open_browser=not a.no_browser)
        return 0

    from .cli import PaperShell
    shell = PaperShell(ex)
    if a.command:
        shell.onecmd(" ".join(a.command))
    else:
        shell.cmdloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
