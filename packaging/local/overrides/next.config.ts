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
};

export default nextConfig;
