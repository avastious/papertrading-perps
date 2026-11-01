#!/usr/bin/env python3
"""Point Aureous at a new web address, e.g. after buying a domain.

    python3 scripts/set_domain.py aureous.trade

Updates link previews and share links on every page, allows the new address to call the
trading server (wrangler.jsonc), regenerates the preview image and the content pages.
Then commit, push (the server redeploys itself) and run scripts/publish_pages.sh.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
path = lambda *p: os.path.join(ROOT, *p)


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"(?:[a-z0-9-]+\.)+[a-z]{2,}", sys.argv[1].lower()):
        sys.exit("Usage: python3 scripts/set_domain.py example.com")
    host = sys.argv[1].lower()
    new = f"https://{host}/"

    build = open(path("scripts", "build_pages.py")).read()
    old = re.search(r'SITE_URL = "([^"]+)"', build).group(1)
    if old == new:
        print("Already using", new)
    open(path("scripts", "build_pages.py"), "w").write(build.replace(f'SITE_URL = "{old}"', f'SITE_URL = "{new}"'))

    index = path("aureous", "web", "index.html")
    html = open(index).read().replace(old, new)
    open(index, "w").write(html)

    # let the new address (and its www. version) call the trading server
    wr = open(path("wrangler.jsonc")).read()
    m = re.search(r'"ALLOWED_ORIGINS": "([^"]*)"', wr)
    origins = [o for o in m.group(1).split(",") if o]
    for o in (f"https://{host}", f"https://www.{host}" if host.count(".") == 1 else None):
        if o and o not in origins:
            origins.insert(0, o)
    wr = wr.replace(m.group(0), f'"ALLOWED_ORIGINS": {json.dumps(",".join(origins))}')
    open(path("wrangler.jsonc"), "w").write(wr)

    subprocess.run([sys.executable, path("scripts", "build_pages.py")], check=True)
    try:
        subprocess.run(["node", path("scripts", "make_og.mjs"), host], check=True)
    except Exception as e:
        print("Couldn't regenerate og.png (needs Node + Playwright):", e)

    readme = path("README.md")
    r = open(readme).read()
    r = re.sub(r"\*\*Live site: https://[^*]+\*\*", f"**Live site: {new.rstrip('/')}**", r, count=1)
    open(readme, "w").write(r)
    print(f"Done: {old} -> {new}\nAllowed origins: {', '.join(origins)}")
    print("Next: commit, push, then run scripts/publish_pages.sh")


if __name__ == "__main__":
    main()
