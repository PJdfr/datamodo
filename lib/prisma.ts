import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

// Single PrismaClient across hot-reloads in dev (avoids exhausting connections).
// Prisma 7 uses driver adapters — we talk to Neon via @neondatabase/serverless.
// Replaces the Supabase service-role client for server-side DB access; per-user
// scoping is enforced in app code (app-layer authz), not RLS.
//
// LOCAL EDITION (DATAMODO_LOCAL): the CLI boots an embedded Postgres (pglite)
// behind a local socket, so we use the node-postgres adapter (@prisma/adapter-pg)
// pointed at DATABASE_URL instead of the Neon WebSocket adapter. Same
// PrismaClient, same app — only the transport differs.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// pglite is a SINGLE in-process WASM instance behind the socket; a normal
// connection pool opens several connections at once and pglite-socket drops
// them ("Connection terminated unexpectedly" / "Server has closed the
// connection"), so the dashboard's parallel reads fail intermittently. We cap
// the pool at ONE (queries serialize) and retry the rare remaining transient
// drop on idempotent READs — enough to make it reliable without risking a
// double-write (writes/transactions are never retried).
const TRANSIENT_DB_ERROR = /Connection terminated|Server has closed|Connection ended|ECONNRESET|socket hang up/i;
const RETRYABLE_READS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy",
]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (process.env.DATAMODO_LOCAL === "1") {
    const base = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
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
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
