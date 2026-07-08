-- Grant the service_role the DML it needs on public tables.
--
-- Why: the server-side backend (ingest capture, and soon the extraction
-- pipeline) talks to Postgres through the service_role key via
-- utils/supabase/admin.ts::createAdminClient(). service_role bypasses RLS but
-- still needs ordinary table GRANTs. Every earlier migration granted DML only
-- to `authenticated` and relied on Supabase's platform default privileges to
-- cover service_role — but on databases where those defaults grant service_role
-- only TRUNCATE/REFERENCES/TRIGGER (not SELECT/INSERT/UPDATE/DELETE), the whole
-- ingest path fails with `42501 permission denied` (recipient resolution against
-- forwarding_addresses, then the items/blobs/attachments writes). The seed never
-- caught it because seeding runs as the postgres superuser.
--
-- Fix: grant service_role explicit DML on all existing public tables, and set
-- default privileges so tables added by future migrations are covered too. This
-- matches Supabase's intended posture (service_role = trusted, server-only,
-- full access to the app schema).

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
