"""Check every signature live mode sent, with Hyperliquid's official Python SDK (pip install hyperliquid-python-sdk).
usage: python3 tests/server/live_signatures.py /tmp/live-log.json <wallet address>
Wallet actions (approveAgent, approveBuilderFee) must recover to the wallet; trades to the approved trading key."""
import json, sys
from hyperliquid.utils import signing as S

log, user = json.load(open(sys.argv[1])), sys.argv[2].lower()
AGENT_TYPES = [{"name": "hyperliquidChain", "type": "string"}, {"name": "agentAddress", "type": "address"},
               {"name": "agentName", "type": "string"}, {"name": "nonce", "type": "uint64"}]
BUILDER_TYPES = [{"name": "hyperliquidChain", "type": "string"}, {"name": "maxFeeRate", "type": "string"},
                 {"name": "builder", "type": "address"}, {"name": "nonce", "type": "uint64"}]
agents, bad, n = set(), 0, 0
for e in log:
    a, sig = e["action"], e["signature"]
    if a["type"] == "approveAgent":
        who = S.recover_user_from_user_signed_action(a, sig, AGENT_TYPES, "HyperliquidTransaction:ApproveAgent", False)
        agents.add(a["agentAddress"].lower()); want = {user}
    elif a["type"] == "approveBuilderFee":
        who = S.recover_user_from_user_signed_action(a, sig, BUILDER_TYPES, "HyperliquidTransaction:ApproveBuilderFee", False)
        want = {user}
    else:
        who = S.recover_agent_or_user_from_l1_action(a, sig, None, e["nonce"], None, False)
        want = agents
    n += 1
    good = who.lower() in want
    bad += not good
    print(("PASS " if good else "FAIL ") + a["type"].ljust(18), who.lower())
print(f"\n{n - bad} of {n} signatures recover to the right signer on Testnet")
sys.exit(1 if bad else 0)
