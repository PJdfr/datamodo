-- HEAVY demo seed — simulates ~5 weeks of real usage for demo@datamodo.dev:
-- 4 agents, 5 tables, ~10 clients, 16 people, 28 invoices, 12 receipts,
-- 8 projects, 12 documents (pdf/image/text/audio) with summaries + page-cited
-- chunks, notes & concepts with wikilinks, provenance-backed facts spread over
-- 35 days, pending proposals and knowledge reviews. Volume, not lorem ipsum.
--
-- Same contract as seed.sql (Neon Auth owns users — they can't be INSERTed):
--   1. Sign up demo@datamodo.dev in the app, load /dashboard once.
--   2. psql "$DATABASE_URL" -f neon/seed-heavy.sql   (per Neon branch)
-- Idempotent: no-ops if the user's org already has agents.
--
-- Honest limitation: document ORIGINALS have placeholder blob hashes — there
-- is no binary in R2, so "original ↓" won't download. Summaries, chunks,
-- facts, folders and search all behave like the real thing.

do $$
declare
  v_uid uuid; v_org uuid;
  v_ledger uuid; v_rolodex uuid; v_paper uuid; v_field uuid;
  v_ds_inv uuid; v_ds_cli uuid; v_ds_con uuid; v_ds_proj uuid; v_ds_rec uuid;

  c_names text[] := array['Brightwave Studio','Northwind Traders','Acme Group','Globex','Initech','Umbrella Health','Vertex Labs','Copperfield & Co','Luma Media','Halcyon Logistics'];
  c_industry text[] := array['Design','Wholesale','Software','Manufacturing','Consulting','Healthcare','Biotech','Legal','Media','Logistics'];
  c_domains text[] := array['brightwave.io','northwind.example','acme.com','globex.com','initech.io','umbrella.health','vertexlabs.ai','copperfield.co','luma.media','halcyon.log'];
  c_ids uuid[] := '{}';

  p_names text[] := array['James Porter','Elena Ruiz','Maria Gomez','Jordan Lee','Priya Nair','Marcus Webb','Sofia Lindqvist','Daniel Okafor','Yuki Tanaka','Ana Ferreira','Tom Becker','Leila Haddad','Victor Osei','Ingrid Dahl','Pablo Reyes','Chloe Martin'];
  p_comp  int[]  := array[1,1,2,3,4,5,6,7,8,9,10,2,3,6,9,1];
  p_roles text[] := array['Enterprise AE','Account Manager','Head of Ops','Ops Lead','Finance Director','Founder','CTO','Legal Counsel','Producer','Logistics Manager','Procurement','Marketing Lead','Engineering Manager','Research Lead','Editor','Studio Coordinator'];
  p_ids uuid[] := '{}';

  proj_names text[] := array['Q3 Rebrand','Website Relaunch','Packaging Refresh','Pitch Deck 2027','Onboarding Portal','Trade Show Booth','Photo Library','Pricing Page'];
  proj_comp  int[]  := array[1,3,4,5,6,2,9,3];
  proj_ids uuid[] := '{}';

  conc_names text[] := array['vendor consolidation','q3 rebrand','pricing strategy','tax season 2026','client onboarding','studio operations'];
  conc_ids uuid[] := '{}';

  inv_ids uuid[] := '{}'; inv_nos text[] := '{}';
  doc_names text[] := array['INV-4413.pdf','Brightwave-MSA-2026.pdf','Globex-Proposal-Q3.pdf','Initech-SOW-Portal.pdf','Copperfield-NDA.pdf','receipt-figma-jun.jpg','receipt-flight-ber.jpg','whiteboard-rebrand.jpg','moodboard-luma.png','meeting-notes-jun-18.txt','voice-memo-pricing.m4a','Umbrella-Retainer-2026.pdf'];
  doc_types text[] := array['application/pdf','application/pdf','application/pdf','application/pdf','application/pdf','image/jpeg','image/jpeg','image/jpeg','image/png','text/plain','audio/mp4','application/pdf'];
  doc_sizes int[]  := array[48231,812044,301500,264012,90210,412330,388020,1204500,2210043,4120,2894001,510230];
  doc_comp  int[]  := array[1,1,4,5,8,7,2,1,9,3,1,6];
  doc_ids uuid[] := '{}';

  v_id uuid; v_item uuid; v_fact uuid; v_fact2 uuid; v_dup uuid; v_row uuid;
  v_batch uuid := gen_random_uuid();
  v_ts timestamptz; v_amount numeric; v_due date; v_status text; v_no text;
  v_email text; v_body text; j int;
begin
  -- 1. Resolve the demo user (must have signed up + loaded /dashboard once).
  select id into v_uid from public.profiles where email = 'demo@datamodo.dev';
  if v_uid is null then
    raise exception 'demo@datamodo.dev not found — sign up in the app and open /dashboard once, then re-run.';
  end if;
  select id into v_org from public.organizations
   where created_by = v_uid and is_personal order by created_at limit 1;
  if v_org is null then
    insert into public.organizations (name, slug, is_personal, created_by)
    values ('Demo Heavy', 'personal-' || substr(v_uid::text, 1, 8), true, v_uid)
    returning id into v_org;
    insert into public.organization_members (org_id, user_id, role)
    values (v_org, v_uid, 'owner') on conflict do nothing;
  end if;
  if exists (select 1 from public.agents where org_id = v_org) then return; end if;

  -- 2. Kind registry (colors drive the schema canvas + explorer tones).
  insert into public.kinds (org_id, owner_user_id, kind, label, plural, color, builtin) values
    (v_org, v_uid, 'company',  'Company',  'Clients',   '#E4593B', true),
    (v_org, v_uid, 'person',   'Person',   'Contacts',  '#3E6B9C', true),
    (v_org, v_uid, 'invoice',  'Invoice',  'Invoices',  '#B08A2E', true),
    (v_org, v_uid, 'receipt',  'Receipt',  'Receipts',  '#7A5C9E', false),
    (v_org, v_uid, 'project',  'Project',  'Projects',  '#3E6B44', true),
    (v_org, v_uid, 'document', 'Document', 'Documents', '#57534A', true),
    (v_org, v_uid, 'note',     'Note',     'Notes',     '#8A6D1F', true),
    (v_org, v_uid, 'concept',  'Concept',  'Concepts',  '#E4593B', true)
  on conflict (org_id, kind) do nothing;

  -- 3. Agents (5 weeks of "who filed all this").
  insert into public.agents (org_id, owner_user_id, name, purpose_text, purpose, channels, mode, status, created_at)
  values (v_org, v_uid, 'Ledger', 'Invoices, receipts & payment confirmations from the billing inbox.', 'curate', array['gmail','outlook'], 'auto', 'active', now() - interval '35 days')
  returning id into v_ledger;
  insert into public.agents (org_id, owner_user_id, name, purpose_text, purpose, channels, mode, status, created_at)
  values (v_org, v_uid, 'Rolodex', 'People & companies — every intro gets filed.', 'curate', array['whatsapp','gmail'], 'auto', 'active', now() - interval '35 days')
  returning id into v_rolodex;
  insert into public.agents (org_id, owner_user_id, name, purpose_text, purpose, channels, mode, status, created_at)
  values (v_org, v_uid, 'Papertrail', 'Contracts, proposals and paperwork, indexed and linked.', 'curate', array['gmail'], 'auto', 'active', now() - interval '32 days')
  returning id into v_paper;
  insert into public.agents (org_id, owner_user_id, name, purpose_text, purpose, channels, mode, status, created_at)
  values (v_org, v_uid, 'Fieldnotes', 'Braindumps and voice memos become structured notes.', 'auto', array['whatsapp'], 'ping', 'active', now() - interval '28 days')
  returning id into v_field;

  -- 4. Tables — one object: the kinds from step 2 ARE the tables. Resolve
  --    their ids and write the table facet (agent, columns, description, and
  --    the demo's display plurals in case builtins pre-existed step 2).
  select id into v_ds_inv  from public.kinds where org_id = v_org and kind = 'invoice';
  select id into v_ds_cli  from public.kinds where org_id = v_org and kind = 'company';
  select id into v_ds_con  from public.kinds where org_id = v_org and kind = 'person';
  select id into v_ds_proj from public.kinds where org_id = v_org and kind = 'project';
  select id into v_ds_rec  from public.kinds where org_id = v_org and kind = 'receipt';

  update public.kinds set agent_id = v_ledger, plural = 'Invoices',
    description = coalesce(description, 'Everything Ledger captured from billing mail.'),
    columns = '[{"key":"client","label":"Client","type":"text"},{"key":"invoice","label":"Invoice","type":"text"},{"key":"amount","label":"Amount","type":"number"},{"key":"due","label":"Due","type":"date"},{"key":"status","label":"Status","type":"status"}]'::jsonb
  where id = v_ds_inv;
  update public.kinds set agent_id = v_rolodex, plural = 'Clients',
    description = coalesce(description, 'Companies you work with.'),
    columns = '[{"key":"name","label":"Name","type":"text"},{"key":"industry","label":"Industry","type":"text"},{"key":"domain","label":"Domain","type":"text"}]'::jsonb
  where id = v_ds_cli;
  update public.kinds set agent_id = v_rolodex, plural = 'Contacts',
    description = coalesce(description, 'People, filed from intros and threads.'),
    columns = '[{"key":"name","label":"Name","type":"text"},{"key":"email","label":"Email","type":"text"},{"key":"company","label":"Company","type":"text"},{"key":"role","label":"Role","type":"text"}]'::jsonb
  where id = v_ds_con;
  update public.kinds set agent_id = v_paper, plural = 'Projects',
    description = coalesce(description, 'Engagements per client.'),
    columns = '[{"key":"name","label":"Name","type":"text"},{"key":"client","label":"Client","type":"text"},{"key":"status","label":"Status","type":"status"},{"key":"deadline","label":"Deadline","type":"date"}]'::jsonb
  where id = v_ds_proj;
  update public.kinds set agent_id = v_ledger, plural = 'Receipts',
    description = coalesce(description, 'Small purchases, snapped or forwarded.'),
    columns = '[{"key":"vendor","label":"Vendor","type":"text"},{"key":"amount","label":"Amount","type":"number"},{"key":"date","label":"Date","type":"date"}]'::jsonb
  where id = v_ds_rec;

  -- 5. Companies (clients arrive over the weeks, not all at once).
  for i in 1..array_length(c_names, 1) loop
    v_ts := now() - make_interval(days => 36 - i * 3, hours => (i * 5) % 24);
    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, support, created_at, updated_at)
    values (v_org, v_uid, 'company', c_names[i], lower(c_names[i]), jsonb_build_object('domain', c_domains[i]), 3, v_ts, v_ts)
    returning id into v_id;
    c_ids := c_ids || v_id;
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text, valid_from, created_at)
    values (v_org, v_uid, v_id, 'industry', v_id::text || '::industry', 'one', 0.85, c_industry[i], v_ts, v_ts);
    insert into public.dataset_rows (dataset_id, org_id, data, created_by, origin, subject_entity_id, created_at)
    values (v_ds_cli, v_org, jsonb_build_object('name', c_names[i], 'industry', c_industry[i], 'domain', c_domains[i]), v_uid, 'agent', v_id, v_ts);
  end loop;

  -- 6. People (works_for edges; every other one has a provenance message).
  for i in 1..array_length(p_names, 1) loop
    v_ts := now() - make_interval(days => 34 - i * 2, hours => (i * 7) % 24);
    v_email := replace(lower(p_names[i]), ' ', '.') || '@' || c_domains[p_comp[i]];
    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, support, created_at, updated_at)
    values (v_org, v_uid, 'person', p_names[i], lower(p_names[i]), jsonb_build_object('email', v_email), 2, v_ts, v_ts)
    returning id into v_id;
    p_ids := p_ids || v_id;
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text, valid_from, created_at)
    values (v_org, v_uid, v_id, 'role', v_id::text || '::role', 'one', 0.9, p_roles[i], v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'works_for', v_id::text || '::works_for', 'one', 0.92, c_ids[p_comp[i]], v_ts, v_ts)
    returning id into v_fact;
    if i % 2 = 0 then
      insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, status, received_at)
      values (v_org, v_uid, (case when i % 4 = 0 then 'whatsapp' else 'email' end)::public.ingest_channel,
              (case when i % 4 = 0 then '+1 (415) 555-01' || lpad(i::text, 2, '0') else v_email end),
              'Intro — ' || p_names[i],
              'Meet ' || p_names[i] || ', ' || p_roles[i] || ' at ' || c_names[p_comp[i]] || '. Best person for the next phase.',
              'analyzed', v_ts)
      returning id into v_item;
      insert into public.fact_sources (org_id, fact_id, source_item_id, snippet, extracted_at)
      values (v_org, v_fact, v_item, p_names[i] || ', ' || p_roles[i] || ' at ' || c_names[p_comp[i]], v_ts);
    end if;
    insert into public.dataset_rows (dataset_id, org_id, data, created_by, origin, subject_entity_id, created_at)
    values (v_ds_con, v_org, jsonb_build_object('name', p_names[i], 'email', v_email, 'company', c_names[p_comp[i]], 'role', p_roles[i]), v_uid, 'agent', v_id, v_ts);
  end loop;

  -- 7. Invoices — 28 of them, ~one per weekday across the 5 weeks.
  for i in 1..28 loop
    j := 1 + ((i * 7) % 10);
    v_no := 'INV-' || (4400 + i * 13)::text;
    v_amount := 380 + ((i * 937) % 17400);
    v_due := current_date - 18 + i * 2;
    v_status := case i % 4 when 0 then 'Paid' when 1 then 'Sent' when 2 then 'Approved' else 'Overdue' end;
    v_ts := now() - make_interval(days => 35 - i, hours => (i * 3) % 24);

    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, support, created_at, updated_at)
    values (v_org, v_uid, 'invoice', v_no, lower(v_no), jsonb_build_object('invoice_no', v_no), 1, v_ts, v_ts)
    returning id into v_id;
    inv_ids := inv_ids || v_id; inv_nos := inv_nos || v_no;

    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_num, unit, valid_from, created_at)
    values (v_org, v_uid, v_id, 'amount', v_id::text || '::amount', 'one', 0.95, v_amount, 'USD', v_ts, v_ts)
    returning id into v_fact;
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_date, valid_from, created_at)
    values (v_org, v_uid, v_id, 'due_date', v_id::text || '::due_date', 'one', 0.95, v_due, v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text, valid_from, created_at)
    values (v_org, v_uid, v_id, 'status', v_id::text || '::status', 'one', 0.9, v_status, v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'issued_by', v_id::text || '::issued_by', 'one', 0.95, c_ids[j], v_ts, v_ts)
    returning id into v_fact2;

    insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, status, received_at)
    values (v_org, v_uid, 'email', 'billing@' || c_domains[j], 'Invoice ' || v_no || ' — ' || c_names[j],
            'Please find attached invoice ' || v_no || ' for a total of $' || v_amount || ', due ' || to_char(v_due, 'Mon DD') || '. Issued by ' || c_names[j] || '.',
            'analyzed', v_ts)
    returning id into v_item;
    insert into public.fact_sources (org_id, fact_id, source_item_id, snippet, extracted_at) values
      (v_org, v_fact,  v_item, 'a total of $' || v_amount, v_ts),
      (v_org, v_fact2, v_item, 'Issued by ' || c_names[j] || ', due ' || to_char(v_due, 'Mon DD'), v_ts);

    insert into public.dataset_rows (dataset_id, org_id, data, created_by, origin, subject_entity_id, created_at)
    values (v_ds_inv, v_org,
            jsonb_build_object('client', c_names[j], 'invoice', v_no, 'amount', v_amount, 'due', to_char(v_due, 'YYYY-MM-DD'), 'status', v_status),
            v_uid, 'agent', v_id, v_ts);
  end loop;

  -- 8. Receipts — small purchases every few days.
  for i in 1..12 loop
    j := 1 + ((i * 3) % 10);
    v_amount := 6 + ((i * 53) % 420);
    v_due := current_date - 35 + i * 3;
    v_ts := now() - make_interval(days => 35 - i * 3, hours => (i * 11) % 24);
    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, support, created_at, updated_at)
    values (v_org, v_uid, 'receipt', 'Receipt — ' || c_names[j] || ' ' || to_char(v_due, 'Mon DD'),
            'receipt ' || lower(c_names[j]) || ' ' || v_due::text, '{}'::jsonb, 1, v_ts, v_ts)
    returning id into v_id;
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'vendor', v_id::text || '::vendor', 'one', 0.9, c_ids[j], v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_num, unit, valid_from, created_at)
    values (v_org, v_uid, v_id, 'amount', v_id::text || '::amount', 'one', 0.92, v_amount, 'USD', v_ts, v_ts);
    insert into public.dataset_rows (dataset_id, org_id, data, created_by, origin, subject_entity_id, created_at)
    values (v_ds_rec, v_org, jsonb_build_object('vendor', c_names[j], 'amount', v_amount, 'date', to_char(v_due, 'YYYY-MM-DD')), v_uid, 'agent', v_id, v_ts);
  end loop;

  -- 9. Projects — engagements the invoices and docs hang off.
  for i in 1..array_length(proj_names, 1) loop
    j := proj_comp[i];
    v_ts := now() - make_interval(days => 33 - i * 3, hours => (i * 9) % 24);
    v_due := current_date + 10 + i * 6;
    v_status := case when i % 3 = 0 then 'wrapped' else 'active' end;
    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, support, created_at, updated_at)
    values (v_org, v_uid, 'project', proj_names[i] || ' — ' || c_names[j], lower(proj_names[i] || ' ' || c_names[j]), '{}'::jsonb, 2, v_ts, v_ts)
    returning id into v_id;
    proj_ids := proj_ids || v_id;
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'for_client', v_id::text || '::for_client', 'one', 0.95, c_ids[j], v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'led_by', v_id::text || '::led_by', 'one', 0.85, p_ids[i], v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text, valid_from, created_at)
    values (v_org, v_uid, v_id, 'status', v_id::text || '::status', 'one', 0.9, v_status, v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_date, valid_from, created_at)
    values (v_org, v_uid, v_id, 'deadline', v_id::text || '::deadline', 'one', 0.85, v_due, v_ts, v_ts);
    insert into public.dataset_rows (dataset_id, org_id, data, created_by, origin, subject_entity_id, created_at)
    values (v_ds_proj, v_org, jsonb_build_object('name', proj_names[i], 'client', c_names[j], 'status', v_status, 'deadline', to_char(v_due, 'YYYY-MM-DD')), v_uid, 'agent', v_id, v_ts);
  end loop;

  -- 10. Concepts (the ideas notes and docs point at).
  for i in 1..array_length(conc_names, 1) loop
    v_ts := now() - make_interval(days => 30 - i * 4);
    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, support, created_at, updated_at)
    values (v_org, v_uid, 'concept', conc_names[i], conc_names[i], '{}'::jsonb, 1, v_ts, v_ts)
    returning id into v_id;
    conc_ids := conc_ids || v_id;
  end loop;

  -- 11. Documents — pdfs, photos, a text file and a voice memo. Thick nodes:
  -- body_md summaries + page-cited chunks; originals are placeholder hashes.
  for i in 1..array_length(doc_names, 1) loop
    j := doc_comp[i];
    v_ts := now() - make_interval(days => 34 - i * 2, hours => (i * 13) % 24);

    insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, status, received_at)
    values (v_org, v_uid, (case when doc_types[i] like 'image/%' then 'whatsapp' else 'email' end)::public.ingest_channel,
            (case when doc_types[i] like 'image/%' then '+1 (415) 555-0142' else 'docs@' || c_domains[j] end),
            'Attached: ' || doc_names[i],
            'Sharing ' || doc_names[i] || ' for the ' || c_names[j] || ' engagement.',
            'analyzed', v_ts)
    returning id into v_item;
    insert into public.attachments (item_id, org_id, owner_user_id, filename, content_type, bytes, blob_hash)
    values (v_item, v_org, v_uid, doc_names[i], doc_types[i], doc_sizes[i], 'seedh-doc-' || i);

    v_body := case
      when doc_types[i] = 'application/pdf' then
        '**' || doc_names[i] || '** — ' || c_names[j] || ' paperwork.' || chr(10) || chr(10) ||
        '- Net-30 payment terms; late fee 1.5%/month' || chr(10) ||
        '- Scope billed per statement of work' || chr(10) ||
        '- Signed counterpart on the last page'
      when doc_types[i] like 'image/%' then
        'Photo captured on the go — understood as: **' || replace(replace(doc_names[i], '-', ' '), '.jpg', '') || '** related to ' || c_names[j] || '.'
      when doc_types[i] = 'text/plain' then
        'Meeting notes with ' || c_names[j] || ':' || chr(10) || chr(10) || '- Timeline agreed: deliverables end of quarter' || chr(10) || '- Budget confirmed; PO to follow' || chr(10) || '- Next check-in booked'
      else
        'Voice memo, transcribed:' || chr(10) || chr(10) || '## Transcript' || chr(10) || chr(10) || 'Thinking about pricing for ' || c_names[j] || ' — move to value-based tiers, anchor the top tier on the rebrand work, and fold small invoices into the retainer. Draft the new pricing page this week.'
      end;

    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, body_md, support, created_at, updated_at)
    values (v_org, v_uid, 'document', doc_names[i], '#doc:seedh-doc-' || i || ':' || lower(doc_names[i]),
            jsonb_build_object('id', 'doc:seedh-doc-' || i || ':' || lower(doc_names[i])), v_body, 1, v_ts, v_ts)
    returning id into v_id;
    doc_ids := doc_ids || v_id;

    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text, valid_from, created_at)
    values (v_org, v_uid, v_id, 'file_type', v_id::text || '::file_type', 'one', 1.0, doc_types[i], v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_num, unit, valid_from, created_at)
    values (v_org, v_uid, v_id, 'file_size', v_id::text || '::file_size', 'one', 1.0, doc_sizes[i], 'bytes', v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, value_text, valid_from, created_at)
    values (v_org, v_uid, v_id, 'indexed', v_id::text || '::indexed', 'one', 1.0,
            case when doc_types[i] like 'image/%' then 'metadata_only' when i = 2 then 'partial' else 'full' end, v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'mentions', v_id::text || '::mentions::e:' || c_ids[j]::text, 'many', 0.95, c_ids[j], v_ts, v_ts)
    returning id into v_fact;
    insert into public.fact_sources (org_id, fact_id, source_item_id, snippet, extracted_at)
    values (v_org, v_fact, v_item, 'Sharing ' || doc_names[i] || ' for the ' || c_names[j] || ' engagement', v_ts);
    -- The first three pdfs each mention an invoice; photos mention a project.
    if i <= 3 then
      insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
      values (v_org, v_uid, v_id, 'mentions', v_id::text || '::mentions::e:' || inv_ids[i * 4]::text, 'many', 0.92, inv_ids[i * 4], v_ts, v_ts);
    elsif doc_types[i] like 'image/%' and i % 2 = 0 then
      insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
      values (v_org, v_uid, v_id, 'mentions', v_id::text || '::mentions::e:' || proj_ids[1 + (i % 8)]::text, 'many', 0.85, proj_ids[1 + (i % 8)], v_ts, v_ts);
    end if;
    -- Page-cited passages for the indexed text documents.
    if doc_types[i] in ('application/pdf', 'text/plain') then
      insert into public.doc_chunks (org_id, entity_id, item_id, seq, page, text, created_at) values
        (v_org, v_id, v_item, 0, 1, 'This agreement is entered into by ' || c_names[j] || ' and the consultant. Fees are payable net-30 from the invoice date; late balances accrue 1.5% per month.', v_ts),
        (v_org, v_id, v_item, 1, 2, 'Deliverables are defined per statement of work. Either party may terminate with 60 days written notice; work in progress is billed pro rata.', v_ts);
    end if;
  end loop;

  -- 12. Notes — braindumps the pipeline structured, with wikilinks.
  for i in 1..5 loop
    j := 1 + (i * 2 % 10);
    v_ts := now() - make_interval(days => 26 - i * 5, hours => (i * 17) % 24);
    insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, status, received_at)
    values (v_org, v_uid, 'whatsapp', '+1 (415) 555-0142', 'note: ' || conc_names[1 + (i % 6)],
            'Braindump about ' || conc_names[1 + (i % 6)] || ' — ' || c_names[j] || ' next steps, pricing and follow-ups.',
            'analyzed', v_ts)
    returning id into v_item;
    insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, body_md, support, created_at, updated_at)
    values (v_org, v_uid, 'note', 'Note — ' || conc_names[1 + (i % 6)] || ' (' || to_char(v_ts, 'Mon DD') || ')',
            '#note:' || v_item::text, jsonb_build_object('id', 'note:' || v_item::text),
            'Thoughts on **' || conc_names[1 + (i % 6)] || '**:' || chr(10) || chr(10) ||
            '- [[' || c_names[j] || ']] is the anchor client for this' || chr(10) ||
            '- Loop in [[' || p_names[1 + (i % 16)] || ']] before committing' || chr(10) ||
            '- Fold the open invoices into one schedule and decide by month end',
            1, v_ts, v_ts)
    returning id into v_id;
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'about', v_id::text || '::about::e:' || conc_ids[1 + (i % 6)]::text, 'many', 0.9, conc_ids[1 + (i % 6)], v_ts, v_ts);
    insert into public.facts (org_id, owner_user_id, subject_entity_id, predicate, claim_key, cardinality, confidence, object_entity_id, valid_from, created_at)
    values (v_org, v_uid, v_id, 'mentions', v_id::text || '::mentions::e:' || c_ids[j]::text, 'many', 0.9, c_ids[j], v_ts, v_ts)
    returning id into v_fact;
    insert into public.fact_sources (org_id, fact_id, source_item_id, snippet, extracted_at)
    values (v_org, v_fact, v_item, c_names[j] || ' next steps, pricing and follow-ups', v_ts);
  end loop;

  -- 13. Table relationships (dashed lines on the schema canvas).
  insert into public.dataset_relations (org_id, from_dataset_id, from_column, to_dataset_id, to_column, label, created_by) values
    (v_org, v_ds_inv,  'client',  v_ds_cli, 'name', 'billed to',  v_uid),
    (v_org, v_ds_con,  'company', v_ds_cli, 'name', 'works at',   v_uid),
    (v_org, v_ds_proj, 'client',  v_ds_cli, 'name', 'for client', v_uid)
  on conflict do nothing;

  -- 14. A human-edited row + a pending agent batch (Review has real work).
  update public.dataset_rows set human_edited = true
   where dataset_id = v_ds_inv and data->>'invoice' = inv_nos[5];
  select id into v_row from public.dataset_rows
   where dataset_id = v_ds_inv and data->>'invoice' = inv_nos[5] limit 1;

  insert into public.items (org_id, owner_user_id, channel, sender, subject, body_preview, status, received_at)
  values (v_org, v_uid, 'email', 'billing@' || c_domains[2], 'Two new invoices + a correction',
          'Attached INV-9101 and INV-9102; also note ' || inv_nos[5] || ' was re-issued at a corrected amount.', 'analyzed', now() - interval '6 hours')
  returning id into v_item;

  insert into public.dataset_rows (dataset_id, org_id, data, status, proposed_kind, proposed_by, batch_id, source_item_id, created_at) values
    (v_ds_inv, v_org, jsonb_build_object('client', c_names[2], 'invoice', 'INV-9101', 'amount', 5400, 'due', to_char(current_date + 24, 'YYYY-MM-DD'), 'status', 'Sent'), 'proposed', 'add', 'Ledger', v_batch, v_item, now() - interval '6 hours'),
    (v_ds_inv, v_org, jsonb_build_object('client', c_names[2], 'invoice', 'INV-9102', 'amount', 1180, 'due', to_char(current_date + 30, 'YYYY-MM-DD'), 'status', 'Sent'), 'proposed', 'add', 'Ledger', v_batch, v_item, now() - interval '6 hours');
  insert into public.dataset_rows (dataset_id, org_id, data, status, proposed_kind, proposed_by, batch_id, source_item_id, target_row_id, created_at)
  select v_ds_inv, v_org, r.data || jsonb_build_object('amount', ((r.data->>'amount')::numeric + 250)), 'proposed', 'update', 'Ledger', v_batch, v_item, r.id, now() - interval '6 hours'
    from public.dataset_rows r where r.id = v_row;

  -- 15. Knowledge reviews: a merge suggestion + a proposed category.
  insert into public.entities (org_id, owner_user_id, kind, canonical_label, normalized_key, natural_keys, support, created_at, updated_at)
  values (v_org, v_uid, 'company', 'ACME Incorporated', 'acme incorporated', jsonb_build_object('domain', 'acme.com'), 0, now() - interval '2 days', now() - interval '2 days')
  returning id into v_dup;
  insert into public.knowledge_reviews (org_id, owner_user_id, kind, status, confidence, impact, source_entity_id, target_entity_id, detail, created_at)
  values (v_org, v_uid, 'entity_merge', 'pending', 0.62, 4, v_dup, c_ids[3],
          jsonb_build_object('reason', 'Same domain acme.com; labels differ.', 'parsedLabel', 'ACME Incorporated'),
          now() - interval '2 days');
  insert into public.knowledge_reviews (org_id, owner_user_id, kind, status, confidence, impact, detail, created_at)
  values (v_org, v_uid, 'category_proposal', 'pending', 0.8, 3,
          jsonb_build_object(
            'proposedKind', 'subscription', 'label', 'Subscription', 'count', 3,
            'sampleLabels', jsonb_build_array('Figma', 'Adobe CC', 'Notion'),
            'template', jsonb_build_object(
              'label', 'Subscription', 'plural', 'Subscriptions', 'color', '#3E6B9C',
              'description', 'Recurring software and service subscriptions.',
              'fields', jsonb_build_array(
                jsonb_build_object('key', 'amount', 'label', 'Amount', 'type', 'number', 'required', true),
                jsonb_build_object('key', 'renews_on', 'label', 'Renews on', 'type', 'date', 'required', false)),
              'relations', jsonb_build_array(
                jsonb_build_object('predicate', 'vendor', 'label', 'Vendor', 'target', 'company')))),
          now() - interval '1 day');
end
$$;

-- The heavy demo runs on Pro so its auto-mode agents stay valid.
update public.user_settings s
   set plan = 'pro', compute_mode = 'cloud'
  from public.profiles p
 where p.id = s.user_id and p.email = 'demo@datamodo.dev';

-- (No kind-binding pass anymore: a table IS a category — the kinds carry
--  their table facet directly, one-object model, 2026-07-20.)
