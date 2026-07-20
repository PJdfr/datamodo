-- Demo data seed for Neon. Unlike the old Supabase seed, this does NOT create
-- the auth user — Neon Auth owns users (neon_auth schema), so they can't be
-- INSERTed via SQL. Instead:
--
--   1. Sign up user@example.com in the app (email + password). On first
--      dashboard load, requireUserOrg() provisions their profile, personal org,
--      settings and inbox.
--   2. Run this file against the target Neon branch, e.g.:
--        psql "$DATABASE_URL" -f neon/seed.sql
--
-- It then fills that user's org with demo agents/datasets/rows + the knowledge
-- layer (entities/facts/provenance). Idempotent: it no-ops if the org already
-- has agents.

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
  v_k_doc1      uuid;
  v_k_doc2      uuid;
  v_f_d1type    uuid;
  v_f_d1m1      uuid;
  v_f_d2m1      uuid;
  v_item4       uuid;
  v_k_note1     uuid;
  v_k_conc1     uuid;
  v_f_n1m1      uuid;
begin
  -- 1. Resolve the demo user. Neon Auth users sync into our `profiles` table on
  --    first sign-in (see requireUserOrg). If absent, the user hasn't signed up.
  select id into v_uid from public.profiles where email = 'user@example.com';
  if v_uid is null then
    raise exception 'Demo user not found. Sign up user@example.com in the app first (Neon Auth), then re-run this seed.';
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

  -- Tables (one object: a table IS a category — kinds carry the columns) ---
  -- Invoices ride the builtin `invoice` kind when the registry is already
  -- seeded (dashboard opened once); Contacts/Trips are user kinds.
  select id into v_ds_invoices from public.kinds where org_id = v_org and kind = 'invoice';
  if v_ds_invoices is null then
    insert into public.kinds (org_id, owner_user_id, kind, label, plural, builtin, fields)
    values (v_org, v_uid, 'invoice', 'Invoice', 'Invoices', true, '[]'::jsonb)
    returning id into v_ds_invoices;
  end if;
  update public.kinds
     set agent_id = v_ledger,
         description = coalesce(description, 'Invoices captured by Ledger.'),
         columns = '[{"key":"client","label":"Client","type":"text"},
                     {"key":"invoice","label":"Invoice","type":"text"},
                     {"key":"amount","label":"Amount","type":"number"},
                     {"key":"due","label":"Due","type":"date"},
                     {"key":"status","label":"Status","type":"status"}]'::jsonb,
         updated_at = now()
   where id = v_ds_invoices;

  insert into public.kinds (org_id, owner_user_id, kind, label, plural, description, builtin, agent_id, fields, columns)
  values (v_org, v_uid, 'contact', 'Contact', 'Contacts', 'People filed by Rolodex.', false, v_rolodex,
    '[{"key":"email","label":"Email","type":"text"},
      {"key":"company","label":"Company","type":"text"},
      {"key":"role","label":"Role","type":"text"}]'::jsonb,
    '[{"key":"name","label":"Name","type":"text"},
      {"key":"email","label":"Email","type":"text"},
      {"key":"company","label":"Company","type":"text"},
      {"key":"role","label":"Role","type":"text"}]'::jsonb)
  on conflict (org_id, kind) do update set agent_id = excluded.agent_id, columns = excluded.columns
  returning id into v_ds_contacts;

  insert into public.kinds (org_id, owner_user_id, kind, label, plural, description, builtin, agent_id, fields, columns)
  values (v_org, v_uid, 'trip', 'Trip', 'Trips', 'Travel timeline from Nomad.', false, v_nomad,
    '[{"key":"destination","label":"Destination","type":"text"},
      {"key":"traveler","label":"Traveler","type":"text"},
      {"key":"dates","label":"Dates","type":"text"},
      {"key":"booking","label":"Booking","type":"text"},
      {"key":"cost","label":"Cost","type":"number"}]'::jsonb,
    '[{"key":"destination","label":"Destination","type":"text"},
      {"key":"traveler","label":"Traveler","type":"text"},
      {"key":"dates","label":"Dates","type":"text"},
      {"key":"booking","label":"Booking","type":"text"},
      {"key":"cost","label":"Cost","type":"number"}]'::jsonb)
  on conflict (org_id, kind) do update set agent_id = excluded.agent_id, columns = excluded.columns
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
  insert into public.dataset_relations (org_id, from_dataset_id, from_column, to_dataset_id, to_column, label, created_by)
  values (v_org, v_ds_invoices, 'client', v_ds_contacts, 'company', 'billed to', v_uid)
  on conflict do nothing;

  -- One accepted invoice is human-edited, so an incoming agent change to it
  -- surfaces as a real conflict in the review flow.
  update public.dataset_rows set human_edited = true
   where dataset_id = v_ds_invoices and data->>'invoice' = '#A-198';
  select id into v_inv_row from public.dataset_rows
   where dataset_id = v_ds_invoices and data->>'invoice' = '#A-198' limit 1;

  -- Source messages the agents parsed (back the facts below via fact_sources).
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

  -- Knowledge layer — canonical entities + facts.
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

  -- Provenance: each fact points back at the message(s) it came from.
  insert into public.fact_sources (org_id, fact_id, source_item_id, snippet) values
    (v_org, v_k_famt,    v_item1, 'a total of $18,500'),
    (v_org, v_k_famt,    v_item3, 'the invoice for 18,500 USD is approved'),
    (v_org, v_f_issued,  v_item1, 'Issued by Brightwave, payable by Aug 31'),
    (v_org, v_f_jworks,  v_item2, 'James Porter from Brightwave'),
    (v_org, v_f_mworks,  v_item2, 'Maria Gomez who runs ops at Northwind');

  -- Documents: attachments become `document` entities in the graph (the binary
  -- stays in blob storage; its meaning lives here). Smart folders in the Files
  -- view are projections over these `mentions` facts. Hashes are placeholders —
  -- the demo has no blob bucket, exactly like a metadata-captured attachment.
  insert into public.attachments (item_id, org_id, owner_user_id, filename, content_type, bytes, blob_hash) values
    (v_item1, v_org, v_uid, 'INV-4417.pdf', 'application/pdf', 48231, 'seed-doc-inv4417'),
    (v_item3, v_org, v_uid, 'Brightwave-MSA-2026.pdf', 'application/pdf', 812044, 'seed-doc-msa2026');

  -- body_md = the extraction-time markdown summary (the thick node's page body).
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, body_md) values
    (v_org, v_uid, 'document', 'INV-4417.pdf', '#doc:seed-doc-inv4417:inv-4417.pdf', '{"id":"doc:seed-doc-inv4417:inv-4417.pdf"}'::jsonb,
     'Invoice **INV-4417** from Brightwave Studio for **$18,500**, due **Aug 31, 2026**. Covers the Q3 brand-refresh engagement:' || chr(10) || chr(10) || '- Design sprints (3× two-week cycles)' || chr(10) || '- Asset handoff and launch support' || chr(10) || chr(10) || 'Payment terms net-30; remittance details on page 2.') returning id into v_k_doc1;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, body_md) values
    (v_org, v_uid, 'document', 'Brightwave-MSA-2026.pdf', '#doc:seed-doc-msa2026:brightwave-msa-2026.pdf', '{"id":"doc:seed-doc-msa2026:brightwave-msa-2026.pdf"}'::jsonb,
     'Master services agreement between **Northwind Ventures** and **Brightwave Studio**, effective 2026. Key points:' || chr(10) || chr(10) || '- Statement-of-work model; each SOW billed separately' || chr(10) || '- Net-30 payment terms, 1.5% monthly late fee' || chr(10) || '- 12-month term with auto-renewal, 60-day termination notice' || chr(10) || chr(10) || 'Signed by Elena Vasquez (Brightwave). *Only the first pages were indexed.*') returning id into v_k_doc2;

  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text) values
    (v_org, v_uid, v_k_doc1, 'file_type', v_k_doc1::text || '::file_type', 'one', 1.0, 'application/pdf') returning id into v_f_d1type;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_num, unit) values
    (v_org, v_uid, v_k_doc1, 'file_size', v_k_doc1::text || '::file_size', 'one', 1.0, 48231, 'bytes');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text) values
    (v_org, v_uid, v_k_doc1, 'indexed', v_k_doc1::text || '::indexed', 'one', 1.0, 'full');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_doc1, 'mentions', v_k_doc1::text || '::mentions::e:' || v_k_inv1::text, 'many', 0.95, v_k_inv1) returning id into v_f_d1m1;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_doc1, 'mentions', v_k_doc1::text || '::mentions::e:' || v_k_bright::text, 'many', 0.95, v_k_bright);

  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text) values
    (v_org, v_uid, v_k_doc2, 'file_type', v_k_doc2::text || '::file_type', 'one', 1.0, 'application/pdf');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_num, unit) values
    (v_org, v_uid, v_k_doc2, 'file_size', v_k_doc2::text || '::file_size', 'one', 1.0, 812044, 'bytes');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text) values
    (v_org, v_uid, v_k_doc2, 'indexed', v_k_doc2::text || '::indexed', 'one', 1.0, 'partial');
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_doc2, 'mentions', v_k_doc2::text || '::mentions::e:' || v_k_bright::text, 'many', 0.9, v_k_bright) returning id into v_f_d2m1;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_doc2, 'mentions', v_k_doc2::text || '::mentions::e:' || v_k_elena::text, 'many', 0.9, v_k_elena);

  insert into public.fact_sources (org_id, fact_id, source_item_id, snippet) values
    (v_org, v_f_d1type, v_item1, 'please find attached invoice INV-4417'),
    (v_org, v_f_d1m1,   v_item1, 'invoice INV-4417 for a total of $18,500'),
    (v_org, v_f_d2m1,   v_item3, 'remittance to follow per the master services agreement');

  -- Generated note: the user dumped a braindump over WhatsApp and the PIPELINE
  -- authored the note node (body_md = our distillation; edges = machine-made
  -- wikilinks to the entities the same text mentioned).
  insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, status, received_at)
  values (v_org, v_uid, 'whatsapp', '+1 (415) 555-0142', 'note: brightwave renewal thoughts',
          'Thinking after the dinner — renew Brightwave but consolidate billing. INV-4417 should fold into the MSA schedule. Elena open to a 12-month commit discount, ~8%. Decide before Aug 31 due date.',
          'analyzed', now())
  returning id into v_item4;

  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, body_md) values
    (v_org, v_uid, 'concept', 'vendor consolidation', 'vendor consolidation', '{}'::jsonb, null) returning id into v_k_conc1;
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, body_md) values
    (v_org, v_uid, 'note', 'Brightwave renewal thoughts', '#note:' || v_item4::text, jsonb_build_object('id', 'note:' || v_item4::text),
     'Renew **Brightwave**, but consolidate billing:' || chr(10) || chr(10) || '- Fold **INV-4417** into the MSA billing schedule' || chr(10) || '- Elena is open to a **12-month commit discount (~8%)**' || chr(10) || '- Decide before the **Aug 31** due date') returning id into v_k_note1;

  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_note1, 'mentions', v_k_note1::text || '::mentions::e:' || v_k_bright::text, 'many', 0.95, v_k_bright) returning id into v_f_n1m1;
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_note1, 'mentions', v_k_note1::text || '::mentions::e:' || v_k_inv1::text, 'many', 0.95, v_k_inv1);
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_note1, 'mentions', v_k_note1::text || '::mentions::e:' || v_k_elena::text, 'many', 0.9, v_k_elena);
  insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id) values
    (v_org, v_uid, v_k_note1, 'about', v_k_note1::text || '::about::e:' || v_k_conc1::text, 'many', 0.9, v_k_conc1);

  insert into public.fact_sources (org_id, fact_id, source_item_id, snippet) values
    (v_org, v_f_n1m1, v_item4, 'renew Brightwave but consolidate billing');
end
$$;

-- Demo account runs on the Pro plan so its seeded auto-mode agents stay valid.
update public.user_settings s
   set plan = 'pro', compute_mode = 'cloud'
  from public.profiles p
 where p.id = s.user_id and p.email = 'user@example.com';

-- (No trailing kind-binding pass anymore: a table IS a category — the seed
--  writes the kinds directly, one-object model, 2026-07-20.)
