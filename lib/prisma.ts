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

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (process.env.DATAMODO_LOCAL === "1") {
    // Local edition: node-postgres adapter → the embedded pglite socket.
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
