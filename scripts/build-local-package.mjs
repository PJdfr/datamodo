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
  "app/api/mcp",       // the vault on the user's Claude subscription — ships local
  "app/api/mcp-token",
  "app/api/oauth",     // MCP OAuth (identical both editions; local rarely needs it
  "app/oauth",         //   — tokenless on 127.0.0.1 — but remote-vault setups do)
  "app/.well-known",
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

/** Seam files whose LOCAL implementation replaces the cloud-aware original. */
const OVERRIDES_DIR = path.join(ROOT, "packaging", "local", "overrides");

/** Cloud deps that must NOT appear in the local package.json. */
const DROP_DEPS = new Set([
  "@aws-sdk/client-s3",
  "@neondatabase/auth",
  "@neondatabase/serverless",
  "@prisma/adapter-neon",
  "stripe",
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
  "components/landing",
  // dir-shaped (not URL-shaped): the dashboard legitimately contains dead
  // client fetches like "/api/billing/checkout" behind the local flag — the
  // sweep hunts for cloud CODE (routes/imports), which lives under app/api/*.
  "app/api/webhooks",
  "app/api/billing",
  "app/api/auth/",
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

/** The version actually installed in the root tree (read straight — some
 *  packages' exports maps block require()ing their package.json). */
async function installedVersion(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, "node_modules", name, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

async function writePackageJson() {
  const root = require(path.join(ROOT, "package.json"));
  const deps = {};
  for (const [k, v] of Object.entries(root.dependencies)) {
    if (!DROP_DEPS.has(k)) deps[k] = v;
  }
  // Direct import in the MCP route; transitive via mcp-handler otherwise.
  deps["@modelcontextprotocol/sdk"] = null; // pinned from the installed tree below
  for (const k of PROMOTE_DEV_DEPS) {
    deps[k] = root.devDependencies[k] ?? root.dependencies[k];
    if (!deps[k] && !(await installedVersion(k))) throw new Error(`local package needs ${k} but the root package.json doesn't have it`);
  }
  // Pin EVERY dependency to the exact version installed here: the tarball
  // ships a PREBUILT `.next`, and `next start` must run under the exact
  // next/react (and friends) the build was made with — a ^range that resolves
  // newer on the user's machine would mismatch the shipped build.
  for (const k of Object.keys(deps)) {
    const exact = await installedVersion(k);
    if (exact) deps[k] = exact;
    if (!deps[k]) throw new Error(`cannot resolve a version for local dependency ${k}`);
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
      // link-externals restores the shipped build's `.next/node_modules`
      // symlinks (npm can't pack symlinks) — at install time, because a
      // global install dir may be root-owned when `serve` later runs as a user.
      postinstall: "prisma generate && node bin/link-externals.mjs",
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
        "^components/(landing|google-button)",
        "^app/api/(auth|billing|webhooks)",
        "@neondatabase", "@prisma/adapter-neon", "^stripe$", "@aws-sdk",
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
await applyOverrides();
await writePackageJson();
await writePrunedBoundaryConfig();
// `.next` is NOT ignored — the prebuilt app ships (prepareBuildForShipping
// strips what `next start` doesn't need). cache/ is belt-and-braces: it's
// deleted before packing, but must never ride along if that ever changes.
await fs.writeFile(
  path.join(OUT, ".npmignore"),
  [".next/cache/", "node_modules/", ".dependency-cruiser.cjs", "*.tsbuildinfo", "next-env.d.ts"].join("\n") + "\n",
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

// ---- PROOF 3 (--build): the tree builds standalone --------------------------
// The build is not only a proof anymore — it SHIPS. The tarball carries the
// production `.next`, so a user's first `datamodo serve` boots in seconds
// instead of compiling the app on their machine.
if (args.has("--build")) {
  console.log("installing + building the pruned tree (this takes a few minutes)…");
  await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: OUT });
  // Scrub NEXT_PUBLIC_* from the build env: those values get INLINED into
  // client bundles and prerendered pages — a dev/CI machine's values must
  // never ship inside the artifact. (Server-side env is read at runtime.)
  const buildEnv = { ...process.env, DATAMODO_LOCAL: "1", NEXT_TELEMETRY_DISABLED: "1" };
  for (const k of Object.keys(buildEnv)) if (k.startsWith("NEXT_PUBLIC_")) delete buildEnv[k];
  await run("npx", ["next", "build"], { cwd: OUT, env: buildEnv });
  console.log("✓ pruned tree builds with DATAMODO_LOCAL=1");
  await prepareBuildForShipping();
}

/** Make the fresh `.next` shippable: drop build junk `next start` never reads,
 *  turn the un-packable symlinks into a manifest (see bin/link-externals.mjs),
 *  and PROVE nothing from this machine leaked into the artifact. */
async function prepareBuildForShipping() {
  const NEXT = path.join(OUT, ".next");
  await fs.access(path.join(NEXT, "prerender-manifest.json")); // complete build?

  // Junk `next start` doesn't use: build cache, traces, editor types, and the
  // per-route .nft.json tracing files (standalone/deploy tracing metadata).
  for (const d of ["cache", "trace", "trace-build", "diagnostics", "types"]) {
    await fs.rm(path.join(NEXT, d), { recursive: true, force: true });
  }

  // required-server-files.{json,js} ARE read by `next start` — but they embed
  // this machine's absolute app dir. Ship them as TEMPLATES (path → token);
  // bin/link-externals.mjs writes the real files with the install dir at
  // postinstall. The originals are removed so a stale copy can't half-work.
  for (const f of ["required-server-files.json", "required-server-files.js"]) {
    const p = path.join(NEXT, f);
    const text = await fs.readFile(p, "utf8");
    if (!text.includes(OUT)) throw new Error(`${f} no longer embeds the app dir — revisit the template step`);
    await fs.writeFile(p + ".tmpl", text.replaceAll(OUT, "__DATAMODO_APP_ROOT__"));
    await fs.rm(p);
  }
  async function rmNft(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await rmNft(p);
      else if (e.name.endsWith(".nft.json")) await fs.rm(p);
    }
  }
  await rmNft(NEXT);

  // Turbopack externalizes server packages behind hashed aliases —
  // `.next/node_modules/pg-<hash>` → symlink to the real package. npm pack
  // cannot ship symlinks, so record alias → package name and drop the links;
  // postinstall (bin/link-externals.mjs) recreates them on the user's machine.
  const linksDir = path.join(NEXT, "node_modules");
  const manifest = {};
  async function collectLinks(dir, rel = "") {
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) {
        const target = await fs.readlink(abs);
        const pkgName = target.split("node_modules/")[1];
        if (!pkgName) throw new Error(`unexpected external symlink target: ${r} → ${target}`);
        manifest[r] = pkgName;
        await fs.rm(abs, { force: true });
      } else if (e.isDirectory()) {
        await collectLinks(abs, r);
      }
    }
  }
  await collectLinks(linksDir);
  await fs.writeFile(path.join(NEXT, "local-externals.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`✓ build prepared for shipping (${Object.keys(manifest).length} externals → manifest)`);

  // PROOF: nothing machine-specific inside the shipped build — no absolute
  // paths from this checkout and none of this machine's NEXT_PUBLIC_* values.
  const needles = [ROOT, ...Object.entries(process.env)
    .filter(([k, v]) => k.startsWith("NEXT_PUBLIC_") && v && v.length >= 8)
    .map(([, v]) => v)];
  const leaks = [];
  async function sweep(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await sweep(p);
      else if (/\.(js|json|html|rsc|txt|css|meta|tmpl)$/.test(e.name)) {
        const text = await fs.readFile(p, "utf8").catch(() => "");
        for (const n of needles) if (text.includes(n)) leaks.push(`${path.relative(OUT, p)} contains "${n.slice(0, 40)}…"`);
      }
    }
  }
  await sweep(NEXT);
  if (leaks.length) {
    console.error("\n✗ machine-specific values leaked into the shipped build:");
    for (const l of leaks.slice(0, 10)) console.error("   " + l);
    process.exit(1);
  }
  console.log("✓ leak sweep: no local paths / NEXT_PUBLIC values in the shipped build");
}

// ---- pack --------------------------------------------------------------------
if (!args.has("--no-pack")) {
  if (!args.has("--build")) {
    console.log("note: packing WITHOUT --build — the tarball ships no prebuilt app, so the user's first `serve` compiles it (slow). Release tarballs should be packed with --build.");
  }
  await run("npm", ["pack", "--pack-destination", path.join(ROOT, "dist")], { cwd: OUT });
  console.log("✓ packed → dist/datamodo-<version>.tgz");
}

console.log("\nlocal package ready: dist/local-package/");
