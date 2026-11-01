"""Entry point:  python -m hlpaper [options] [command ...]

With no command, opens the interactive shell. With a command, runs it once and exits:
    python -m hlpaper buy BTC 0.01
    python -m hlpaper account
"""
import argparse
import os
import sys

from .api import MAINNET, TESTNET, HyperliquidAPIError, HyperliquidClient
from .cli import PaperShell
from .engine import PaperExchange


def main(argv=None):
    ap = argparse.ArgumentParser(prog="hlpaper", description="Paper-trade Hyperliquid perps with live market data.")
    ap.add_argument("--state", default=os.path.expanduser("~/.hlpaper/account.json"),
                    help="account file (default ~/.hlpaper/account.json); use different files for separate accounts")
    ap.add_argument("--balance", type=float, default=10_000, help="starting USDC for a new account (default 10000)")
    ap.add_argument("--testnet", action="store_true", help="use Hyperliquid testnet market data")
    ap.add_argument("--taker-fee", type=float, default=0.00045, help="taker fee rate (default 0.00045 = 0.045%%)")
    ap.add_argument("--maker-fee", type=float, default=0.00015, help="maker fee rate (default 0.00015 = 0.015%%)")
    ap.add_argument("command", nargs=argparse.REMAINDER, help="optional one-shot command")
    a = ap.parse_args(argv)
    try:  # never crash on symbols like ✓ in consoles with a legacy code page
        sys.stdout.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

    client = HyperliquidClient(TESTNET if a.testnet else MAINNET)
    ex = PaperExchange(client, a.state, starting_balance=a.balance,
                       taker_fee=a.taker_fee, maker_fee=a.maker_fee)
    shell = PaperShell(ex)
    try:
        ex.refresh(force=True)
    except HyperliquidAPIError as e:
        print(f"Could not reach Hyperliquid: {e}", file=sys.stderr)
        return 1
    if a.command:
        shell.onecmd(" ".join(a.command))
    else:
        shell.cmdloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
