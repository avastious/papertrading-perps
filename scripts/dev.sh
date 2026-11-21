#!/bin/sh
# Start everything for local testing, no real Hyperliquid or Firebase needed:
#   stand-in Hyperliquid + signing keys on 8500, trading server (wrangler dev) on 8787,
#   a copy of the website pointed at the local server on 8400.
# Logs go to $TMP/aureous-dev/*.log. Stop with: pkill -f mock-hyperliquid; pkill -f "wrangler dev"; pkill -f "http.server 8400"
set -e
cd "$(dirname "$0")/.."
OUT="${TMPDIR:-/tmp}/aureous-dev"
mkdir -p "$OUT"
rm -rf "$OUT/site" && cp -r aureous/web "$OUT/site"
sed -i.bak 's#apiUrl: "[^"]*"#apiUrl: "http://127.0.0.1:8787"#' "$OUT/site/firebase-config.js" && rm -f "$OUT/site/firebase-config.js.bak"
pgrep -f "[m]ock-hyperliquid" >/dev/null || (nohup node tests/server/mock-hyperliquid.js > "$OUT/mock.log" 2>&1 &)
pgrep -f "[w]rangler dev" >/dev/null || (nohup npx wrangler dev --test-scheduled \
  --var HL_API_URL:http://127.0.0.1:8500 --var JWKS_URL:http://127.0.0.1:8500/jwks \
  --var ALLOWED_ORIGINS:http://127.0.0.1:8400 --var ADMIN_EMAILS:owner@example.com \
  > "$OUT/wrangler.log" 2>&1 &)
pgrep -f "[h]ttp.server 8400" >/dev/null || (nohup python3 -m http.server 8400 --directory "$OUT/site" > "$OUT/static.log" 2>&1 &)
for i in $(seq 60); do
  curl -sf http://127.0.0.1:8787/api/health >/dev/null && echo "up: site http://127.0.0.1:8400  server http://127.0.0.1:8787" && exit 0
  sleep 1
done
echo "trading server didn't start"; tail -20 "$OUT/wrangler.log"; exit 1
