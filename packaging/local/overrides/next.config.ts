import type { NextConfig } from "next";

// LOCAL EDITION build of next.config.ts (swapped in by
// scripts/build-local-package.mjs).
const nextConfig: NextConfig = {
  // Same native server externals as the cloud build (scanned-PDF OCR etc.).
  serverExternalPackages: ["@napi-rs/canvas", "unpdf", "pdfjs-dist", "mailparser"],
  // Pin the project root to THIS tree. Without it, building the pruned tree
  // nested inside the monorepo (CI/dev) makes Turbopack infer the outer repo
  // as root and pick up the CLOUD proxy.ts as middleware.
  turbopack: { root: process.cwd() },
  // The first-run build happens on the USER'S machine, where a global install
  // puts this package inside a node_modules path — and TypeScript refuses to
  // analyze .mjs files under node_modules (no declarations → implicit-any
  // errors that don't exist in the repo). The tree is fully typechecked at
  // pack time (CI + build-local-package --build); re-checking here adds
  // nothing and would fail spuriously, so skip it.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
