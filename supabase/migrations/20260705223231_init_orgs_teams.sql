-- Datamodo — organizations, teams, memberships, and forwarding addresses.
--
-- Model: every user belongs to at least one organization (their auto-created
-- "personal" org). Users can also create shared "team" orgs. Forwarding
-- addresses belong to an org; a NULL owner_user_id means the address is shared
-- across the org, otherwise it is personal to that user.
--
-- Security follows the Supabase RLS guidance: RLS on every public table,
-- `TO authenticated` + an ownership/membership predicate, membership checks via
-- SECURITY DEFINER helpers in a private (unexposed) schema to avoid RLS
-- recursion, and USING + WITH CHECK on every UPDATE policy.

-- ---------------------------------------------------------------------------
-- Schema for internal, non-exposed helper functions.
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enum: organization member roles.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type public.org_role as enum ('owner', 'admin', 'member');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  is_personal boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);

create table if not exists public.forwarding_addresses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade, -- NULL = shared/team address
  address       text not null unique,
  label         text,
  created_at    timestamptz not null default now()
);

create index if not exists forwarding_addresses_org_id_idx
  on public.forwarding_addresses (org_id);

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER, private schema) — used inside policies
-- so they can read organization_members without triggering its own RLS
-- (which would recurse). Each has an internal auth.uid() scope.
-- ---------------------------------------------------------------------------
create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_admin(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.forwarding_addresses  enable row level security;

-- profiles: a user only ever sees/edits their own profile row.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- organizations: members can read; any authed user can create (as themselves);
-- admins can update/delete.
create policy "organizations_select_member" on public.organizations
  for select to authenticated
  using (private.is_org_member(id));

create policy "organizations_insert_self" on public.organizations
  for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy "organizations_update_admin" on public.organizations
  for update to authenticated
  using (private.is_org_admin(id))
  with check (private.is_org_admin(id));

create policy "organizations_delete_admin" on public.organizations
  for delete to authenticated
  using (private.is_org_admin(id));

-- organization_members: members can see the roster; admins manage it.
create policy "members_select_member" on public.organization_members
  for select to authenticated
  using (private.is_org_member(org_id));

create policy "members_insert_admin" on public.organization_members
  for insert to authenticated
  with check (private.is_org_admin(org_id));

create policy "members_update_admin" on public.organization_members
  for update to authenticated
  using (private.is_org_admin(org_id))
  with check (private.is_org_admin(org_id));

create policy "members_delete_admin" on public.organization_members
  for delete to authenticated
  using (private.is_org_admin(org_id));

-- forwarding_addresses: members see shared addresses + their own personal ones;
-- owners manage their personal addresses, admins manage any in the org.
create policy "addresses_select_scoped" on public.forwarding_addresses
  for select to authenticated
  using (
    private.is_org_member(org_id)
    and (owner_user_id is null or owner_user_id = (select auth.uid()))
  );

create policy "addresses_insert_scoped" on public.forwarding_addresses
  for insert to authenticated
  with check (
    private.is_org_admin(org_id)
    or (owner_user_id = (select auth.uid()) and private.is_org_member(org_id))
  );

create policy "addresses_update_scoped" on public.forwarding_addresses
  for update to authenticated
  using (
    private.is_org_admin(org_id)
    or (owner_user_id = (select auth.uid()) and private.is_org_member(org_id))
  )
  with check (
    private.is_org_admin(org_id)
    or (owner_user_id = (select auth.uid()) and private.is_org_member(org_id))
  );

create policy "addresses_delete_scoped" on public.forwarding_addresses
  for delete to authenticated
  using (
    private.is_org_admin(org_id)
    or (owner_user_id = (select auth.uid()) and private.is_org_member(org_id))
  );

-- ---------------------------------------------------------------------------
-- Table privileges for the API roles (RLS still gates every row).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.profiles              to authenticated;
grant select, insert, update, delete on public.organizations         to authenticated;
grant select, insert, update, delete on public.organization_members  to authenticated;
grant select, insert, update, delete on public.forwarding_addresses  to authenticated;

-- ---------------------------------------------------------------------------
-- Create a team organization + owner membership atomically. Bypasses the
-- members-insert-admin bootstrap problem. SECURITY DEFINER with an explicit
-- auth.uid() check so anon callers get nothing.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_org  public.organizations;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_name), ''), 'team'),
                                 '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(md5(random()::text), 1, 6);

  insert into public.organizations (name, slug, is_personal, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'New organization'), v_slug, false, v_uid)
  returning * into v_org;

  insert into public.organization_members (org_id, user_id, role)
  values (v_org.id, v_uid, 'owner');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

-- ---------------------------------------------------------------------------
-- On signup: create the profile, a personal org, owner membership, and a
-- personal forwarding address. Runs as SECURITY DEFINER so it bypasses RLS.
--
-- NOTE: the forwarding-address domain below is a placeholder. Change
-- 'in.datamodo.email' to the real inbound domain once DNS/MX is configured.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_name   text := coalesce(new.raw_user_meta_data ->> 'full_name',
                            split_part(new.email, '@', 1));
  v_addr   text := substr(md5(random()::text || new.id::text), 1, 12)
                   || '@' || 'in.datamodo.email';
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_name);

  insert into public.organizations (name, slug, is_personal, created_by)
  values (v_name, 'personal-' || substr(new.id::text, 1, 8), true, new.id)
  returning id into v_org_id;

  insert into public.organization_members (org_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  insert into public.forwarding_addresses (org_id, owner_user_id, address, label)
  values (v_org_id, new.id, v_addr, 'Personal inbox');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
