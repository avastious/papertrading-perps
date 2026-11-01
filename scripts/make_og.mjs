// Renders scripts/og-card.html to aureous/web/og.png (the image shown in link previews).
// Usage: node scripts/make_og.mjs [domain]     e.g. node scripts/make_og.mjs aureous.trade
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

// use a local Playwright if installed, otherwise a global one (npm i -g playwright)
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
const { chromium } = pw;

const here = path.dirname(fileURLToPath(import.meta.url));
const host = process.argv[2] || "aureous.pages.dev";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(pathToFileURL(path.join(here, "og-card.html")).href + "?host=" + encodeURIComponent(host));
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
const out = path.join(here, "..", "aureous", "web", "og.png");
await p.screenshot({ path: out });
await b.close();
console.log("wrote", out, "for", host);
