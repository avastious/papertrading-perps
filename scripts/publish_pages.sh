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

# Custom domain: GitHub Pages reads it from a CNAME file on the published branch. Use
# aureous/web/CNAME if it exists; otherwise keep whatever the live site already has, so a
# domain set in the repo's Pages settings isn't wiped by this force-push.
if [ ! -f "$tmp/CNAME" ] && git -C "$root" fetch -q origin gh-pages 2>/dev/null \
   && git -C "$root" cat-file -e FETCH_HEAD:CNAME 2>/dev/null; then
  git -C "$root" show FETCH_HEAD:CNAME > "$tmp/CNAME"
fi
[ -f "$tmp/CNAME" ] && echo "Custom domain: $(cat "$tmp/CNAME")"

cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "$msg"
git push -q -f "$remote" gh-pages
echo "Published $rev to gh-pages."
