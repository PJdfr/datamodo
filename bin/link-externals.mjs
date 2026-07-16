#!/usr/bin/env node
// Recreate the `.next/node_modules` links of a SHIPPED build.
//
// Turbopack externalizes native/server-only packages (pg, @prisma/client,
// @napi-rs/canvas, …) behind hashed aliases — `.next/node_modules/pg-<hash>`
// symlinked to the app's real `node_modules/pg`. Those hashed names are baked
// into the server chunks, but npm cannot ship symlinks in a tarball, so the
// pack step (scripts/build-local-package.mjs) replaces them with a manifest
// (`.next/local-externals.json`) and THIS script recreates the links against
// the installed package's own node_modules.
//
// Runs at postinstall (a global install's directory may be root-owned, so
// install time is when we're guaranteed write access) and again, fail-soft,
// from `datamodo serve` (covers copied/moved installs). No manifest → no-op,
// so the repo checkout and `datamodo build` rebuilds are untouched.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** required-server-files.{json,js} are read by `next start` but embed the
 *  build machine's app dir, so the tarball ships them as .tmpl files with the
 *  path tokenized — write the real ones for THIS install location. Idempotent
 *  and cheap; re-run on every serve so a moved install self-heals. */
async function materializeServerFiles(appRoot) {
  // JSON-escape the path (Windows backslashes) — the token sits inside string
  // literals in both files.
  const escaped = JSON.stringify(appRoot).slice(1, -1);
  for (const f of ["required-server-files.json", "required-server-files.js"]) {
    const tmpl = path.join(appRoot, ".next", `${f}.tmpl`);
    const out = path.join(appRoot, ".next", f);
    let text;
    try {
      text = await fs.readFile(tmpl, "utf8");
    } catch {
      continue; // not a shipped build (repo checkout / local rebuild)
    }
    const next = text.replaceAll("__DATAMODO_APP_ROOT__", escaped);
    const current = await fs.readFile(out, "utf8").catch(() => null);
    if (current !== next) await fs.writeFile(out, next);
  }
}

/** Ensure every externalized alias points at the installed package.
 *  Returns { linked, missing } — missing = target packages not installed. */
export async function linkBuildExternals(appRoot = APP_ROOT) {
  await materializeServerFiles(appRoot);
  const manifestPath = path.join(appRoot, ".next", "local-externals.json");
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    return { linked: 0, missing: [] }; // no shipped build → nothing to do
  }
  let linked = 0;
  const missing = [];
  for (const [alias, pkgName] of Object.entries(manifest)) {
    const linkPath = path.join(appRoot, ".next", "node_modules", alias);
    const targetAbs = path.join(appRoot, "node_modules", pkgName);
    try {
      await fs.access(targetAbs);
    } catch {
      missing.push(pkgName);
      continue;
    }
    // Already correct? (postinstall ran; serve re-checks cheaply)
    try {
      const st = await fs.stat(linkPath); // follows links — throws when dangling
      if (st.isDirectory()) continue;
    } catch { /* absent or dangling → (re)create */ }
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    await fs.rm(linkPath, { recursive: true, force: true }).catch(() => {});
    const rel = path.relative(path.dirname(linkPath), targetAbs);
    try {
      await fs.symlink(rel, linkPath, "dir");
    } catch {
      // Windows without symlink privileges: junctions work unprivileged but
      // need an absolute target.
      await fs.symlink(targetAbs, linkPath, "junction");
    }
    linked++;
  }
  return { linked, missing };
}

// Executed directly (npm postinstall). Never fail the install over this —
// `datamodo serve` retries and reports properly.
if (process.argv[1] && path.basename(process.argv[1]) === "link-externals.mjs") {
  linkBuildExternals()
    .then(({ linked, missing }) => {
      if (linked) console.log(`datamodo: linked ${linked} build external${linked === 1 ? "" : "s"}`);
      for (const m of missing) console.warn(`datamodo: build external "${m}" is not installed — run npm install`);
    })
    .catch((e) => console.warn(`datamodo: could not link build externals — ${e?.message ?? e}`));
}
