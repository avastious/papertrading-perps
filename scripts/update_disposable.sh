#!/bin/sh
# Refresh the throwaway-email domain list from https://github.com/disposable-email-domains/disposable-email-domains (CC0).
set -e
cd "$(dirname "$0")/.."
curl -sSfL https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf -o /tmp/disposable.conf
python3 - <<'PY'
import json
doms = [l.strip().lower() for l in open("/tmp/disposable.conf") if l.strip() and not l.startswith("#")]
open("worker/vendor/disposable-domains.js", "w").write(
    "// Disposable (throwaway) email domains, from https://github.com/disposable-email-domains/disposable-email-domains\n"
    "// (CC0 1.0, public domain). Refresh with scripts/update_disposable.sh.\nexport default " + json.dumps("\n".join(doms)) + ";\n")
print(len(doms), "domains")
PY
