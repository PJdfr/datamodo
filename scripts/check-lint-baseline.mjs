#!/usr/bin/env node
// Enforces the project's "lint == baseline" verification bar (docs/STATE.md):
// the codebase carries a known set of pre-existing eslint problems; new code
// must not add to it. Shrink the baseline here whenever problems are fixed.
import { execFileSync } from "node:child_process";

const BASELINE = { errors: 7, warnings: 16 };

let raw;
try {
  raw = execFileSync("npx", ["eslint", ".", "--format", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  // eslint exits 1 when there are errors — the JSON report is still on stdout.
  if (!err.stdout) throw err;
  raw = err.stdout.toString();
}

const results = JSON.parse(raw);
const errors = results.reduce((n, f) => n + f.errorCount, 0);
const warnings = results.reduce((n, f) => n + f.warningCount, 0);

console.log(`lint: ${errors} errors / ${warnings} warnings (baseline ${BASELINE.errors}/${BASELINE.warnings})`);

if (errors > BASELINE.errors || warnings > BASELINE.warnings) {
  console.error("Lint regressed past the baseline — fix the new problems (or, if you fixed old ones elsewhere, lower the baseline in scripts/check-lint-baseline.mjs).");
  process.exit(1);
}
if (errors < BASELINE.errors || warnings < BASELINE.warnings) {
  console.log("Lint improved — consider lowering the baseline in scripts/check-lint-baseline.mjs.");
}
