#!/usr/bin/env node
// npm run shoot [-- <harness> ...] — screenshot dashboard surfaces without a
// database or login. Each harness under scripts/shoot/harnesses/ mounts one
// component with fixture data; this script bundles it (esbuild), renders it in
// the local Chromium (playwright-core), and writes .shoot/<name>.png.
//
// Born in the Explorer v2 session (2026-07-11) where it caught a clipped
// hop-2 ring and an occlusion bug tsc/tests never would have. Keep harnesses
// small: fixtures + one mounted component, `window.__mounted = true` at the
// end. Dev-only — needs a Chromium on disk (Claude sandboxes preinstall one
// under /opt/pw-browsers; locally set SHOOT_CHROME to your Chrome binary).

import { build } from "esbuild";
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const outDir = path.join(repo, ".shoot");
const harnessDir = path.join(here, "harnesses");

function findChrome() {
  if (process.env.SHOOT_CHROME) return process.env.SHOOT_CHROME;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
  for (const root of roots) {
    try {
      const hit = execSync(`find ${root} -maxdepth 3 -name chrome -type f 2>/dev/null | head -1`, { encoding: "utf8" }).trim();
      if (hit) return hit;
    } catch { /* keep looking */ }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/google-chrome"]) if (fs.existsSync(p)) return p;
  return null;
}

const available = fs.readdirSync(harnessDir).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, ""));
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const targets = wanted.length ? wanted : available;
const unknown = targets.filter((t) => !available.includes(t));
if (unknown.length) {
  console.error(`Unknown harness(es): ${unknown.join(", ")}. Available: ${available.join(", ")}`);
  process.exit(1);
}

const chrome = findChrome();
if (!chrome) {
  console.error("No Chromium found — set SHOOT_CHROME=/path/to/chrome.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; background: #F6F2E9; font-family: sans-serif; }
.dm-mono { font-family: monospace; } .dm-display { font-family: sans-serif; }
@keyframes dm-drop-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes dm-spin { to { transform: rotate(360deg); } } .dm-spin { animation: dm-spin 1.6s linear infinite; }
#root { width: 1100px; height: 660px; padding: 20px; }
</style></head><body><div id="root"></div><script src="__NAME__.js"></script></body></html>`;

const browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1160, height: 760 } });
let failures = 0;

for (const name of targets) {
  await build({
    entryPoints: [path.join(harnessDir, `${name}.tsx`)],
    bundle: true,
    jsx: "automatic",
    alias: { "@": repo },
    outfile: path.join(outDir, `${name}.js`),
    loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  fs.writeFileSync(path.join(outDir, `${name}.html`), HTML.replace("__NAME__", name));

  const errors = [];
  const onErr = (e) => errors.push(String(e));
  page.on("pageerror", onErr);
  await page.goto(`file://${path.join(outDir, `${name}.html`)}`);
  await page.waitForFunction("window.__mounted === true", { timeout: 10_000 });
  await page.waitForTimeout(1400); // let entrances/settle windows finish
  const shot = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: shot });
  page.off("pageerror", onErr);

  if (errors.length) {
    failures++;
    console.error(`✗ ${name} — page errors:\n  ${errors.join("\n  ")}`);
  } else {
    console.log(`✓ ${name} → ${path.relative(repo, shot)}`);
  }
}

await browser.close();
process.exit(failures ? 1 : 0);
