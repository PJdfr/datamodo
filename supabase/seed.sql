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
  v_item3       uuid;
  v_batch1      uuid;
  v_batch2      uuid;
  -- knowledge-layer demo entities
  v_k_acme      uuid;
  v_k_bright    uuid;
  v_k_north     uuid;
  v_k_james     uuid;
  v_k_elena     uuid;
  v_k_maria     uuid;
  v_k_inv1      uuid;
  v_k_inv2      uuid;
  v_k_famt      uuid;
  v_f_issued    uuid;
  v_f_jworks    uuid;
  v_f_mworks    uuid;
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
      {"key":"traveler","label":"Traveler","type":"text"},
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

  -- Traveler names match Contacts.name, so the auto-linker suggests
  -- Trips.traveler → Contacts.name (a link the demo hasn't drawn yet).
  insert into public.dataset_rows (dataset_id, org_id, data, created_by) values
    (v_ds_trips, v_org, '{"destination":"Lisbon","traveler":"Jordan Lee","dates":"Aug 3–9","booking":"TAP #4471","cost":640}'::jsonb, v_uid),
    (v_ds_trips, v_org, '{"destination":"Berlin","traveler":"Priya Nair","dates":"Sep 12–15","booking":"LH #2210","cost":410}'::jsonb, v_uid);

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

  -- Source messages the agents parsed (the "comm chunk" grouping axis). These
  -- back the facts below via fact_sources, so the Knowledge tab's "where did
  -- this come from?" drill-down shows the real message behind each claim.
  insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, received_at)
  values (v_org, v_uid, 'email', 'billing@brightwave.io', 'Invoice INV-4417 — Brightwave',
          'Hi, please find attached invoice INV-4417 for a total of $18,500. Issued by Brightwave, payable by Aug 31.', now())
  returning id into v_item1;
  insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, received_at)
  values (v_org, v_uid, 'whatsapp', '+1 (415) 555-0142', 'Dinner with the Northwind team',
          'Great dinner — James Porter from Brightwave and Maria Gomez who runs ops at Northwind. Will intro you both.', now())
  returning id into v_item2;
  insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, received_at)
  values (v_org, v_uid, 'email', 'accounts@brightwave.io', 'Re: payment — INV-4417',
          'Confirming the invoice for 18,500 USD is approved on our side; remittance to follow.', now())
  returning id into v_item3;

  -- Knowledge layer — the canonical entities + facts the Knowledge tab shows and
  -- that tables are projected from. (Review now happens at the fact level, so we
  -- no longer seed table-row "proposals".)
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'company', 'Acme Group', 'acme group', '{"domain":"acme.com"}'::jsonb) returning id into v_k_acme;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'company', 'Brightwave', 'brightwave', '{"domain":"brightwave.io"}'::jsonb) returning id into v_k_bright;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'company', 'Northwind Traders', 'northwind traders', '{}'::jsonb) returning id into v_k_north;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'person', 'James Porter', 'james porter', '{"email":"james.porter@brightwave.io"}'::jsonb) returning id into v_k_james;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'person', 'Elena Ruiz', 'elena ruiz', '{"email":"elena.ruiz@brightwave.io"}'::jsonb) returning id into v_k_elena;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'person', 'Maria Gomez', 'maria gomez', '{"email":"maria@northwind.example","phone":"+1-415-555-0142"}'::jsonb) returning id into v_k_maria;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'invoice', 'INV-4417', 'inv-4417', '{"invoice_no":"INV-4417"}'::jsonb) returning id into v_k_inv1;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys) values
    (v_org, v_uid, 'invoice', 'INV-2087', 'inv-2087', '{"invoice_no":"INV-2087"}'::jsonb) returning id into v_k_inv2;

  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_num, unit) values
    (v_org, v_uid, v_k_inv1, 'amount', v_k_inv1::text || '::amount', 'one', 0.95, 18500, 'USD') returning id into v_k_famt;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_date) values (v_org, v_uid, v_k_inv1, 'due_date', v_k_inv1::text || '::due_date', 'one', 0.95, '2026-08-31');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values (v_org, v_uid, v_k_inv1, 'issued_by', v_k_inv1::text || '::issued_by', 'one', 0.95, v_k_bright) returning id into v_f_issued;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values (v_org, v_uid, v_k_inv1, 'account_manager', v_k_inv1::text || '::account_manager', 'one', 0.9, v_k_elena);
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_num, unit) values (v_org, v_uid, v_k_inv2, 'amount', v_k_inv2::text || '::amount', 'one', 0.95, 4250, 'USD');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_date) values (v_org, v_uid, v_k_inv2, 'due_date', v_k_inv2::text || '::due_date', 'one', 0.95, '2026-08-15');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values (v_org, v_uid, v_k_inv2, 'issued_by', v_k_inv2::text || '::issued_by', 'one', 0.95, v_k_north);
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text) values (v_org, v_uid, v_k_james, 'role', v_k_james::text || '::role', 'one', 0.9, 'Enterprise Account Executive');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values (v_org, v_uid, v_k_james, 'works_for', v_k_james::text || '::works_for', 'one', 0.92, v_k_bright) returning id into v_f_jworks;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text) values (v_org, v_uid, v_k_elena, 'role', v_k_elena::text || '::role', 'one', 0.9, 'Account Manager');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values (v_org, v_uid, v_k_elena, 'works_for', v_k_elena::text || '::works_for', 'one', 0.9, v_k_bright);
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values (v_org, v_uid, v_k_maria, 'works_for', v_k_maria::text || '::works_for', 'one', 0.85, v_k_north) returning id into v_f_mworks;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text) values (v_org, v_uid, v_k_acme, 'industry', v_k_acme::text || '::industry', 'one', 0.8, 'Software');

  -- Provenance: each fact points back at the real message(s) it came from, so
  -- the Knowledge tab's "where did this come from?" drill-down has evidence to
  -- show. The invoice total is corroborated by two separate emails.
  insert into public.fact_sources (org_id, fact_id, source_item_id, snippet) values
    (v_org, v_k_famt,    v_item1, 'a total of $18,500'),
    (v_org, v_k_famt,    v_item3, 'the invoice for 18,500 USD is approved'),
    (v_org, v_f_issued,  v_item1, 'Issued by Brightwave, payable by Aug 31'),
    (v_org, v_f_jworks,  v_item2, 'James Porter from Brightwave'),
    (v_org, v_f_mworks,  v_item2, 'Maria Gomez who runs ops at Northwind');
end
$$;

-- Demo account runs on the Pro plan so its seeded auto-mode agents stay valid.
-- (A default 'free' settings row is created by the on_auth_user_created_settings
-- trigger when the user above is inserted.)
update public.user_settings s
   set plan = 'pro', compute_mode = 'cloud'
  from auth.users u
 where u.id = s.user_id and u.email = 'user@example.com';
