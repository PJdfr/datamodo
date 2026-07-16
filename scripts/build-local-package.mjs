#!/usr/bin/env node
// Build the publishable LOCAL-ONLY package (packaging brief §6, option C —
// build-time prune). Copies the OSS-eligible CORE into a clean tree, swaps the
// seam files for their local implementations, generates a local package.json
// (real name "datamodo", cloud deps dropped), then PROVES the separation:
//
//   1. a generated zero-exception dependency-cruiser config must pass — in the
//      pruned tree NOTHING may import the closed layer (no seam allowance);
//   2. a grep sweep for closed markers (@neondatabase, stripe, @aws-sdk,
//      adapter-neon, webhooks/billing/landing paths) must come back empty;
//   3. (--build) the tree must `next build` standalone with DATAMODO_LOCAL=1.
//
// The result is `dist/local-package/` and (--pack) `dist/datamodo-<v>.tgz`.
// Cloud code (auth, Neon, billing, hosted webhooks, landing, the email worker)
// is PHYSICALLY ABSENT from both — unzipping the tarball reveals the dashboard
// and the local adapters only.
//
//   node scripts/build-local-package.mjs [--build] [--no-pack] [--keep]

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "local-package");
const args = new Set(process.argv.slice(2));

/* ------------------------------------------------------------------ */
/* What ships (CORE) — everything else is closed and stays behind      */
/* ------------------------------------------------------------------ */

const INCLUDE = [
  // the app: dashboard + core/local API routes (auth/billing/webhooks stay behind)
  "app/layout.tsx",
  "app/globals.css",
  "app/favicon.ico",
  "app/dashboard",
  "app/api/chat",
  "app/api/datasets",
  "app/api/documents",
  "app/api/ingest",
  "app/api/jobs",
  "app/api/kinds",
  "app/api/knowledge",
  "app/api/local",
  // NO app/api/mcp / mcp-token: MCP is CLOUD-ONLY (user call 2026-07-16) —
  // the vault-as-tools host stays behind with auth/billing/webhooks.
  "app/api/onboarding",
  "app/api/relations",
  "app/api/search",
  "app/api/sync",
  "app/api/usage",
  // pure cores + local adapters + provider-agnostic LLM layer
  "lib/datamodo",
  "lib/llm",
  "lib/local",
  "lib/ingest",
  "lib/storage/blob-fs.ts",
  // shared UI atoms the dashboard uses (landing/google-button stay behind)
  "components/logo.tsx",
  "components/field-icons.tsx",
  // the CLI + schema + config
  "bin",
  "prisma/schema.prisma",
  "prisma.config.ts",
  "neon/schema.sql",
  "neon/migrations",
  "public",
  "next.config.ts",
  "tsconfig.json",
];

/** Files inside INCLUDEd dirs that are nonetheless CLOSED — deleted from the
 *  tree after the copy. (The MCP contract cores live in lib/datamodo, which
 *  ships wholesale; MCP itself is cloud-only.) */
const EXCLUDE_FILES = [
  "lib/datamodo/mcp-extraction.ts",
  "lib/datamodo/mcp-token.ts",
];

/** Seam files whose LOCAL implementation replaces the cloud-aware original. */
const OVERRIDES_DIR = path.join(ROOT, "packaging", "local", "overrides");

/** Cloud deps that must NOT appear in the local package.json. */
const DROP_DEPS = new Set([
  "@aws-sdk/client-s3",
  "@neondatabase/auth",
  "@neondatabase/serverless",
  "@prisma/adapter-neon",
  "stripe",
  // MCP host is cloud-only; zod rides out with it (its only importers).
  "mcp-handler",
  "zod",
]);

/** Build-time deps the local package needs as REGULAR deps (a global install
 *  only gets `dependencies`, and `datamodo serve` builds on first run). */
const PROMOTE_DEV_DEPS = ["prisma", "typescript", "@types/node", "@types/react", "@types/react-dom", "@types/mailparser", "dotenv"];

/** Closed-layer markers that must not survive anywhere in the pruned tree. */
const CLOSED_MARKERS = [
  "@neondatabase",
  "@prisma/adapter-neon",
  "@aws-sdk",
  'from "stripe"',
  "lib/auth/server",
  "lib/auth/client",
  "lib/datamodo/mcp-",
  "mcp-handler",
  "@modelcontextprotocol",
  "components/landing",
  // dir-shaped (not URL-shaped): the dashboard legitimately contains dead
  // client fetches like "/api/billing/checkout" behind the local flag — the
  // sweep hunts for cloud CODE (routes/imports), which lives under app/api/*.
  "app/api/webhooks",
  "app/api/billing",
  "app/api/auth/",
  "app/api/mcp",
];

/* ------------------------------------------------------------------ */

const run = (cmd, argv, opts = {}) =>
  new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: "inherit", ...opts });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${argv.join(" ")} → exit ${code}`))));
    p.on("error", rej);
  });

async function copyInto(rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(OUT, rel);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.cp(src, dst, { recursive: true });
}

async function applyOverrides(dir = OVERRIDES_DIR, rel = "") {
  for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) await applyOverrides(dir, r);
    else {
      await fs.mkdir(path.dirname(path.join(OUT, r)), { recursive: true });
      await fs.copyFile(path.join(dir, r), path.join(OUT, r));
      console.log(`  seam    ${r}`);
    }
  }
}

async function writePackageJson() {
  const root = require(path.join(ROOT, "package.json"));
  const deps = {};
  for (const [k, v] of Object.entries(root.dependencies)) {
    if (!DROP_DEPS.has(k)) deps[k] = v;
  }
  for (const k of PROMOTE_DEV_DEPS) {
    deps[k] = root.devDependencies[k] ?? root.dependencies[k];
    if (!deps[k]) throw new Error(`local package needs ${k} but the root package.json doesn't have it`);
  }
  const pkg = {
    name: "datamodo",
    version: root.version,
    description:
      "datamodo, local edition — your private data vault, self-hosted and single-user. Forward the mess, get back structured data. Runs entirely on your machine (embedded Postgres, local Ollama models).",
    license: "SEE LICENSE IN LICENSE",
    homepage: "https://datamodo.dev",
    bin: { datamodo: "bin/datamodo.mjs" },
    scripts: {
      postinstall: "prisma generate",
      build: "node bin/datamodo.mjs build",
      start: "node bin/datamodo.mjs serve",
    },
    engines: { node: ">=20" },
    dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.writeFile(path.join(OUT, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}

/** Zero-exception boundary config for the pruned tree: nothing in the package
 *  may import a closed module or package — there are no seams left here. */
async function writePrunedBoundaryConfig() {
  const cfg = `// GENERATED by scripts/build-local-package.mjs — do not edit.
// In the published local package NOTHING may reach the closed cloud layer.
module.exports = {
  forbidden: [
    {
      name: "local-package-has-no-cloud",
      severity: "error",
      from: {},
      to: { path: [
        "^lib/auth/(server|client)",
        "^lib/datamodo/mcp-",
        "^components/(landing|google-button)",
        "^app/api/(auth|billing|webhooks|mcp)",
        "@neondatabase", "@prisma/adapter-neon", "^stripe$", "@aws-sdk",
        "^mcp-handler$", "@modelcontextprotocol", "^zod$",
      ] },
    },
    {
      name: "nothing-missing",
      comment: "an unresolvable import means the prune left a dangling reference",
      severity: "error",
      from: { pathNot: "^(node_modules)" },
      to: { couldNotResolve: true, dependencyTypesNot: ["type-only"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
`;
  await fs.writeFile(path.join(OUT, ".dependency-cruiser.cjs"), cfg);
}

async function grepSweep() {
  const bad = [];
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "public") continue;
        await walk(p);
      } else if (/\.(ts|tsx|mjs|js|json|sql|css)$/.test(e.name)) {
        const text = await fs.readFile(p, "utf8");
        for (const marker of CLOSED_MARKERS) {
          if (text.includes(marker)) bad.push(`${path.relative(OUT, p)}: contains "${marker}"`);
        }
      }
    }
  }
  await walk(OUT);
  return bad;
}

/* ------------------------------------------------------------------ */

console.log("building the local-only package tree…");
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

for (const rel of INCLUDE) {
  await copyInto(rel);
  console.log(`  copy    ${rel}`);
}
for (const rel of EXCLUDE_FILES) {
  await fs.rm(path.join(OUT, rel), { force: true });
  console.log(`  drop    ${rel}`);
}
await applyOverrides();
await writePackageJson();
await writePrunedBoundaryConfig();
await fs.writeFile(
  path.join(OUT, ".npmignore"),
  [".next/", "node_modules/", ".dependency-cruiser.cjs", "*.tsbuildinfo", "next-env.d.ts"].join("\n") + "\n",
);
await fs.copyFile(path.join(ROOT, "packaging", "local", "README.md"), path.join(OUT, "README.md"));

// ---- PROOF 1: grep sweep — closed markers must be absent -------------------
const bad = await grepSweep();
if (bad.length) {
  console.error("\n✗ closed-layer markers found in the pruned tree:");
  for (const b of bad) console.error("   " + b);
  process.exit(1);
}
console.log("✓ grep sweep: no closed-layer markers in the tree");

// ---- PROOF 2: boundary lint with ZERO exceptions ---------------------------
const depcruise = path.join(ROOT, "node_modules", ".bin", "depcruise");
await run(depcruise, ["app", "lib", "bin", "components", "--config", ".dependency-cruiser.cjs"], { cwd: OUT });
console.log("✓ boundary lint (zero exceptions) passed on the pruned tree");

// ---- PROOF 3 (--build): the tree builds standalone -------------------------
if (args.has("--build")) {
  console.log("installing + building the pruned tree (this takes a few minutes)…");
  await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: OUT });
  await run("npx", ["next", "build"], { cwd: OUT, env: { ...process.env, DATAMODO_LOCAL: "1", NEXT_TELEMETRY_DISABLED: "1" } });
  console.log("✓ pruned tree builds with DATAMODO_LOCAL=1");
}

// ---- pack -------------------------------------------------------------------
if (!args.has("--no-pack")) {
  // Pack from a pristine copy? npm pack respects .npmignore — .next/node_modules
  // excluded even after --build.
  await run("npm", ["pack", "--pack-destination", path.join(ROOT, "dist")], { cwd: OUT });
  console.log("✓ packed → dist/datamodo-<version>.tgz");
}

console.log("\nlocal package ready: dist/local-package/");
