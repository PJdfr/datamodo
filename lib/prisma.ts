import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Single PrismaClient across hot-reloads in dev (avoids exhausting connections).
// Prisma 7 uses driver adapters — we talk to Neon via @neondatabase/serverless.
// Replaces the Supabase service-role client for server-side DB access; per-user
// scoping is enforced in app code (app-layer authz), not RLS.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
