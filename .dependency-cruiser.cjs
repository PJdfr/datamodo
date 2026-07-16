/**
 * Dependency boundary — the OSS-eligible CORE must never import the CLOSED
 * cloud layer (ROADMAP "Code-separation — HARD REQUIREMENT"; packaging brief
 * §6). `npm run lint:boundary` fails the build on a violation; CI runs it, and
 * scripts/build-local-package.mjs re-runs it on the PRUNED tree (where even
 * the seam files below must be clean, since they're replaced by local stubs).
 *
 * CORE  (ships in the local artifact): app/dashboard, the local/core API
 *        routes, lib/datamodo, lib/llm, lib/local, lib/ingest, blob-fs, bin.
 * CLOSED (never ships local): Neon Auth (lib/auth/server|client), Neon
 *        serverless / @prisma/adapter-neon, Stripe billing, hosted channel
 *        webhooks, landing/marketing, the email worker. (The MCP host is CORE
 *        — "your Claude subscription over your local vault" ships local; its
 *        token secret derives from the per-install ingest secret there.)
 * SEAMS (interfaces the core imports; their cloud halves live behind runtime
 *        dispatch and are REPLACED in the pruned tree): lib/prisma.ts,
 *        lib/storage/blob.ts, lib/auth/session.ts, app/auth/actions.ts,
 *        proxy.ts.
 */
const CLOSED_TARGETS = [
  // our own cloud-only modules
  "^lib/auth/(server|client)",
  "^components/(landing|google-button)",
  "^app/(page\\.tsx|login|register)",
  "^app/api/(auth|billing|webhooks)",
  "^workers",
  // cloud-only packages
  "@neondatabase",
  "@prisma/adapter-neon",
  "^stripe$",
  "@aws-sdk",
];

const SEAM_FILES = "^(lib/prisma\\.ts|lib/storage/blob\\.ts|lib/auth/session\\.ts|app/auth/actions\\.ts|proxy\\.ts)$";

module.exports = {
  forbidden: [
    {
      name: "core-must-not-import-cloud",
      comment:
        "The local artifact is built from CORE only — an import from core into " +
        "the closed cloud layer would make the published local package carry " +
        "(or fail to build without) cloud code. Route it through a seam " +
        "(lib/prisma.ts, lib/storage/blob.ts, lib/auth/session.ts) instead.",
      severity: "error",
      from: {
        path: "^(app/dashboard|app/api/(?!auth|billing|webhooks)|lib/datamodo|lib/llm|lib/local|lib/ingest|lib/storage/blob-fs|bin|components/(?!landing|google-button))",
        pathNot: SEAM_FILES,
      },
      to: { path: CLOSED_TARGETS },
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
