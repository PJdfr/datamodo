import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client for server-side ingestion. It bypasses RLS, so
// it must NEVER be imported into a client component or exposed to the browser —
// SUPABASE_SECRET_KEY is server-only.
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY for admin client");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
