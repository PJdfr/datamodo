import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// LOCAL EDITION build of lib/prisma.ts — Postgres via node-postgres only.
// (The cloud edition's Neon adapter lives in the closed layer and is not part
// of this package; scripts/build-local-package.mjs swaps this file in.)
//
// Two local database shapes:
//  • EMBEDDED (default): `datamodo serve` boots pglite behind a local socket
//    and sets DATAMODO_EMBEDDED_DB=1. pglite is ONE in-process session — a
//    normal pool's parallel connections get dropped — so the pool is capped at
//    one and rare transient drops are retried on idempotent READs only.
//  • REAL Postgres (Docker Compose / your own server): a plain pooled adapter,
//    no cap, no retry shim.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const TRANSIENT_DB_ERROR = /Connection terminated|Server has closed|Connection ended|ECONNRESET|socket hang up/i;
const RETRYABLE_READS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy",
]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  const embedded = process.env.DATAMODO_EMBEDDED_DB === "1";
  if (!embedded) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  // idleTimeoutMillis 0: NEVER close the one connection — pg's default 10s
  // idle-close + reopen races the single-session socket and surfaces as
  // "Connection terminated unexpectedly" on the next (often first) write.
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1, idleTimeoutMillis: 0 }) });
  return base.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        if (!RETRYABLE_READS.has(operation)) return query(args);
        for (let attempt = 0; ; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            if (TRANSIENT_DB_ERROR.test(String((e as Error)?.message ?? "")) && attempt < 4) {
              await sleep(15 * (attempt + 1));
              continue;
            }
            throw e;
          }
        }
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

// ALWAYS a per-process singleton here: in production Next inlines this module
// into every route bundle, and without the global each route would open its
// own pool against the embedded pglite socket — which serves ONE connection,
// so each new pool kicks the previous route's mid-flight.
globalForPrisma.prisma = prisma;
