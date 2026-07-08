-- Local demo seed. Runs after migrations on `supabase db reset`
-- (see [db.seed] in config.toml). Idempotent + safe to re-run.
--
-- Goal: the demo account user@example.com (password: "password") always exists
-- with fake data across the app tables — a personal org, several agents, their
-- datasets, and dataset rows. This is the canonical signed-in state for local
-- development. Keep it in sync when the agents/datasets schema changes.

do $$
declare
  v_uid         uuid;
  v_org         uuid;
  v_ledger      uuid;
  v_rolodex     uuid;
  v_nomad       uuid;
  v_ds_invoices uuid;
  v_ds_contacts uuid;
  v_ds_trips    uuid;
  v_inv_row     uuid;
  v_item1       uuid;
  v_item2       uuid;
  v_batch1      uuid;
  v_batch2      uuid;
begin
  -- 1. Ensure the demo auth user exists. The handle_new_user() trigger creates
  --    the matching profile, personal org, owner membership, and forwarding
  --    address. We never clobber an existing account (safe on shared/remote DBs).
  select id into v_uid from auth.users where email = 'user@example.com';
  if v_uid is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'user@example.com', extensions.crypt('password', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Demo User"}',
      now(), now(), '', '', '', ''
    );

    -- GoTrue needs an identity row to allow email/password sign-in.
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'user@example.com'),
      'email', v_uid::text, now(), now(), now()
    );
  end if;

  -- 2. Resolve (or backfill) the demo user's personal org.
  select id into v_org
    from public.organizations
   where created_by = v_uid and is_personal
   order by created_at
   limit 1;

  if v_org is null then
    insert into public.organizations (name, slug, is_personal, created_by)
    values ('Demo User', 'personal-' || substr(v_uid::text, 1, 8), true, v_uid)
    returning id into v_org;
    insert into public.organization_members (org_id, user_id, role)
    values (v_org, v_uid, 'owner')
    on conflict do nothing;
  end if;

  -- 3. Seed demo data only when the org has none yet (idempotent).
  if exists (select 1 from public.agents where org_id = v_org) then
    return;
  end if;

  -- Agents ---------------------------------------------------------------
  insert into public.agents (org_id, owner_user_id, name, purpose_text, purpose, channels, mode, status)
  values (v_org, v_uid, 'Ledger', 'Invoices, receipts & payment confirmations from your billing inbox.',
          'curate', array['gmail','outlook'], 'auto', 'active')
  returning id into v_ledger;

  insert into public.agents (org_id, owner_user_id, name, purpose_text, purpose, channels, mode, status)
  values (v_org, v_uid, 'Rolodex', 'People & companies you meet — tag it and it files the contact.',
          'curate', array['whatsapp'], 'ping', 'active')
  returning id into v_rolodex;

  insert into public.agents (org_id, owner_user_id, name, purpose_text, purpose, channels, mode, status)
  values (v_org, v_uid, 'Nomad', 'Trips, bookings & travel confirmations, kept in one timeline.',
          'curate', array['gmail'], 'auto', 'paused')
  returning id into v_nomad;

  -- Datasets -------------------------------------------------------------
  insert into public.datasets (org_id, agent_id, name, description, columns, created_by)
  values (v_org, v_ledger, 'Invoices', 'Invoices captured by Ledger.',
    '[{"key":"client","label":"Client","type":"text"},
      {"key":"invoice","label":"Invoice","type":"text"},
      {"key":"amount","label":"Amount","type":"number"},
      {"key":"due","label":"Due","type":"date"},
      {"key":"status","label":"Status","type":"status"}]'::jsonb,
    v_uid)
  returning id into v_ds_invoices;

  insert into public.datasets (org_id, agent_id, name, description, columns, created_by)
  values (v_org, v_rolodex, 'Contacts', 'People filed by Rolodex.',
    '[{"key":"name","label":"Name","type":"text"},
      {"key":"email","label":"Email","type":"text"},
      {"key":"company","label":"Company","type":"text"},
      {"key":"role","label":"Role","type":"text"}]'::jsonb,
    v_uid)
  returning id into v_ds_contacts;

  insert into public.datasets (org_id, agent_id, name, description, columns, created_by)
  values (v_org, v_nomad, 'Trips', 'Travel timeline from Nomad.',
    '[{"key":"destination","label":"Destination","type":"text"},
      {"key":"dates","label":"Dates","type":"text"},
      {"key":"booking","label":"Booking","type":"text"},
      {"key":"cost","label":"Cost","type":"number"}]'::jsonb,
    v_uid)
  returning id into v_ds_trips;

  -- Dataset rows ---------------------------------------------------------
  insert into public.dataset_rows (dataset_id, org_id, data, created_by) values
    (v_ds_invoices, v_org, '{"client":"Northwind","invoice":"#A-198","amount":3400,"due":"2026-07-20","status":"Paid"}'::jsonb, v_uid),
    (v_ds_invoices, v_org, '{"client":"Globex","invoice":"#A-201","amount":9120,"due":"2026-07-28","status":"Sent"}'::jsonb, v_uid),
    (v_ds_invoices, v_org, '{"client":"Acme Inc","invoice":"#A-204","amount":12000,"due":"2026-08-01","status":"Approved"}'::jsonb, v_uid),
    (v_ds_invoices, v_org, '{"client":"Initech","invoice":"#A-205","amount":2120,"due":"2026-08-04","status":"Sent"}'::jsonb, v_uid);

  insert into public.dataset_rows (dataset_id, org_id, data, created_by) values
    (v_ds_contacts, v_org, '{"name":"Jordan Lee","email":"jordan@acme.com","company":"Acme Inc","role":"Ops"}'::jsonb, v_uid),
    (v_ds_contacts, v_org, '{"name":"Priya Nair","email":"priya@globex.com","company":"Globex","role":"Finance"}'::jsonb, v_uid),
    (v_ds_contacts, v_org, '{"name":"Marcus Webb","email":"marcus@initech.com","company":"Initech","role":"Founder"}'::jsonb, v_uid);

  insert into public.dataset_rows (dataset_id, org_id, data, created_by) values
    (v_ds_trips, v_org, '{"destination":"Lisbon","dates":"Aug 3–9","booking":"TAP #4471","cost":640}'::jsonb, v_uid),
    (v_ds_trips, v_org, '{"destination":"Berlin","dates":"Sep 12–15","booking":"LH #2210","cost":410}'::jsonb, v_uid);

  -- Relationships -------------------------------------------------------
  -- An invoice's client is a company that lives in Contacts.
  insert into public.dataset_relations (org_id, from_dataset_id, from_column, to_dataset_id, to_column, label, created_by)
  values (v_org, v_ds_invoices, 'client', v_ds_contacts, 'company', 'billed to', v_uid)
  on conflict do nothing;

  -- Pending review ("open pull request") --------------------------------
  -- One accepted invoice is human-edited, so an incoming agent change to it
  -- surfaces as a real conflict in the review flow.
  update public.dataset_rows set human_edited = true
   where dataset_id = v_ds_invoices and data->>'invoice' = '#A-198';
  select id into v_inv_row from public.dataset_rows
   where dataset_id = v_ds_invoices and data->>'invoice' = '#A-198' limit 1;

  -- Source messages the agents parsed (the "comm chunk" grouping axis).
  insert into public.items (org_id, owner_user_id, channel, sender, subject, received_at)
  values (v_org, v_uid, 'email', 'billing@acme.com', 'Invoice #A-207 — Acme Inc', now())
  returning id into v_item1;
  insert into public.items (org_id, owner_user_id, channel, sender, subject, received_at)
  values (v_org, v_uid, 'whatsapp', 'Acme dinner', 'Met 2 people at the Acme dinner', now())
  returning id into v_item2;

  -- A linked WhatsApp identity for the demo user, so the "Connect a channel"
  -- surface shows WhatsApp already connected. Messaging channels route by SENDER:
  -- this (channel, handle) row is what resolveTarget() matches inbound forwards
  -- against (created for real users by the link-code flow, lib/channels/link.ts).
  insert into public.ingest_sources (org_id, owner_user_id, channel, mode, handle, display_name, provider, status)
  values (v_org, v_uid, 'whatsapp', 'active', '+15551234567', 'Demo phone', 'whatsapp', 'active')
  on conflict (channel, handle) do nothing;

  -- Chunk 1 — Ledger parsed a billing email → one new invoice + one change to
  -- the (human-edited, so conflicting) #A-198 row.
  v_batch1 := gen_random_uuid();
  insert into public.dataset_rows (dataset_id, org_id, data, status, origin, proposed_by, proposed_kind, target_row_id, batch_id, source_item_id) values
    (v_ds_invoices, v_org, '{"client":"Acme Inc","invoice":"#A-207","amount":5400,"due":"2026-08-12","status":"Sent"}'::jsonb, 'proposed', 'agent', 'Ledger', 'add', null, v_batch1, v_item1),
    (v_ds_invoices, v_org, '{"client":"Northwind","invoice":"#A-198","amount":3600,"due":"2026-07-20","status":"Paid"}'::jsonb, 'proposed', 'agent', 'Ledger', 'update', v_inv_row, v_batch1, v_item1);

  -- Chunk 2 — Rolodex parsed a WhatsApp note → two new contacts.
  v_batch2 := gen_random_uuid();
  insert into public.dataset_rows (dataset_id, org_id, data, status, origin, proposed_by, proposed_kind, batch_id, source_item_id) values
    (v_ds_contacts, v_org, '{"name":"Dana Cruz","email":"dana@acme.com","company":"Acme Inc","role":"CTO"}'::jsonb, 'proposed', 'agent', 'Rolodex', 'add', v_batch2, v_item2),
    (v_ds_contacts, v_org, '{"name":"Sam Ito","email":"sam@acme.com","company":"Acme Inc","role":"Design"}'::jsonb, 'proposed', 'agent', 'Rolodex', 'add', v_batch2, v_item2);
end
$$;

-- Demo account runs on the Pro plan so its seeded auto-mode agents stay valid.
-- (A default 'free' settings row is created by the on_auth_user_created_settings
-- trigger when the user above is inserted.)
update public.user_settings s
   set plan = 'pro', compute_mode = 'cloud'
  from auth.users u
 where u.id = s.user_id and u.email = 'user@example.com';
