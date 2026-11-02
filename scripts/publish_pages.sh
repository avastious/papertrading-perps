#!/bin/sh
# Publish the website (aureous/web) to the gh-pages branch, which GitHub Pages serves at
#   https://<owner>.github.io/<repo>/
# Usage: scripts/publish_pages.sh ["commit message"]
set -e
root=$(git rev-parse --show-toplevel)
remote=$(git -C "$root" remote get-url origin)
rev=$(git -C "$root" rev-parse --short HEAD)
msg=${1:-"Publish site from $rev"}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r "$root/aureous/web/." "$tmp/"
touch "$tmp/.nojekyll"   # serve files as-is, no Jekyll processing
# Cloudflare Pages Functions (the sign-in pass-through at /__/auth) live in functions/ on the published branch
[ -d "$root/pages-functions" ] && cp -r "$root/pages-functions" "$tmp/functions"

# Stamp our scripts and styles with this version (theme.js?v=abc1234) so browsers fetch the new
# copies after every publish instead of mixing a fresh page with cached old code.
python3 - "$tmp" "$rev" <<'PY'
import pathlib, re, sys
root, rev = pathlib.Path(sys.argv[1]), sys.argv[2]
pat = re.compile(r'((?:src|href)="|from ")(\./)?([\w-]+\.(?:js|css))(")')
for f in root.glob("*.html"):
    t = f.read_text()
    n = pat.sub(lambda m: f"{m[1]}{m[2] or ''}{m[3]}?v={rev}{m[4]}" if (root / m[3]).exists() else m[0], t)
    if n != t: f.write_text(n)
PY

# Custom domain: GitHub Pages reads it from a CNAME file on the published branch. Only a domain
# saved in aureous/web/CNAME is published, so a domain never lingers after it's been removed.
# (If you set a domain in the repo's Pages settings, add the same name to aureous/web/CNAME.)
[ -f "$tmp/CNAME" ] && echo "Custom domain: $(cat "$tmp/CNAME")"

cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "$msg"
git push -q -f "$remote" gh-pages
echo "Published $rev to gh-pages."
