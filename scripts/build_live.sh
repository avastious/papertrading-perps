#!/bin/sh
# Rebuild aureous/web/vendor/hl-live.js: the Hyperliquid SDK and viem bundled for the browser (live trading).
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); cp scripts/live-entry.js "$tmp/entry.js"; cd "$tmp"
npm init -y >/dev/null && npm i --silent @nktkas/hyperliquid viem esbuild
npx esbuild entry.js --bundle --minify --format=iife --target=es2020 --legal-comments=none --outfile=out.js
cd - >/dev/null
{ printf '/*! Aureous live trading bundle: @nktkas/hyperliquid %s (MIT, github.com/nktkas/hyperliquid) and viem %s (MIT, github.com/wevm/viem),\n    built with esbuild from scripts/build_live.sh. */\n' \
    "$(node -p "require('$tmp/node_modules/@nktkas/hyperliquid/package.json').version")" "$(node -p "require('$tmp/node_modules/viem/package.json').version")"
  cat "$tmp/out.js"; } > aureous/web/vendor/hl-live.js
echo "wrote aureous/web/vendor/hl-live.js"
