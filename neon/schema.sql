-- ============================================================
-- datamodo schema, ported to Neon (Postgres 18)
-- app-layer authz: RLS policies, auth.* coupling, Supabase roles,
-- and the pgmq/pg_cron/pg_net/vault objects are intentionally removed.
-- Signup side-effects (personal org, settings, forwarding address) move
-- to app code. Extraction queue becomes a SKIP LOCKED table scan later.
-- ============================================================
create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
create extension if not exists btree_gin;
create extension if not exists btree_gist;
create extension if not exists "uuid-ossp";
create schema if not exists private;

--
-- PostgreSQL database dump
--

\restrict 00rvmrPt4n0ZyDJ0UfZBJyXSFhNJ3YwvfXxWJrMbIc1xppG39maia9GVUBAy9XY

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;

SET lock_timeout = 0;

SET idle_in_transaction_session_timeout = 0;

SET transaction_timeout = 0;

SET client_encoding = 'UTF8';

SET standard_conforming_strings = on;

SELECT pg_catalog.set_config('search_path', '', false);

SET check_function_bodies = false;

SET xmloption = content;

SET client_min_messages = warning;

SET row_security = off;



--
-- Name: attachments_refcount(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.attachments_refcount() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    perform private.blob_ref(new.org_id, new.blob_hash, 1);
  elsif tg_op = 'DELETE' then
    perform private.blob_ref(old.org_id, old.blob_hash, -1);
  end if;
  return null;
end
$$;



--
-- Name: blob_ref(uuid, text, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.blob_ref(p_org uuid, p_hash text, p_delta integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.blobs set ref_count = ref_count + p_delta
   where org_id = p_org and hash = p_hash;
$$;



--
-- Name: items_refcount(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.items_refcount() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.body_hash is not null then perform private.blob_ref(new.org_id, new.body_hash, 1); end if;
    if new.raw_hash  is not null then perform private.blob_ref(new.org_id, new.raw_hash,  1); end if;
  elsif tg_op = 'DELETE' then
    if old.body_hash is not null then perform private.blob_ref(old.org_id, old.body_hash, -1); end if;
    if old.raw_hash  is not null then perform private.blob_ref(old.org_id, old.raw_hash,  -1); end if;
  end if;
  return null;
end
$$;



--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end
$$;
--
-- PostgreSQL database dump complete
--

\unrestrict 00rvmrPt4n0ZyDJ0UfZBJyXSFhNJ3YwvfXxWJrMbIc1xppG39maia9GVUBAy9XY
--
-- PostgreSQL database dump
--

\restrict fxdPUuJNYQiA5izh1LLelkKUnmD89ZfJ5d9OuE3DiOOpRsdnPwzNVg4pcemnSAy

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;

SET lock_timeout = 0;

SET idle_in_transaction_session_timeout = 0;

SET transaction_timeout = 0;

SET client_encoding = 'UTF8';

SET standard_conforming_strings = on;

SELECT pg_catalog.set_config('search_path', '', false);

SET check_function_bodies = false;

SET xmloption = content;

SET client_min_messages = warning;

SET row_security = off;



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';



--
-- Name: agent_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_mode AS ENUM (
    'auto',
    'ping'
);



--
-- Name: agent_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_purpose AS ENUM (
    'curate',
    'auto'
);



--
-- Name: agent_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_status AS ENUM (
    'active',
    'paused'
);



--
-- Name: billing_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_plan AS ENUM (
    'free',
    'pro',
    'max'
);



--
-- Name: capture_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.capture_mode AS ENUM (
    'active',
    'auto'
);



--
-- Name: dataset_row_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dataset_row_status AS ENUM (
    'accepted',
    'proposed'
);



--
-- Name: ingest_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ingest_channel AS ENUM (
    'email',
    'whatsapp',
    'slack',
    'teams',
    'sms',
    'upload',
    'other'
);



--
-- Name: item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_status AS ENUM (
    'received',
    'stored',
    'analyzing',
    'analyzed',
    'failed',
    'skipped'
);



--
-- Name: org_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_role AS ENUM (
    'owner',
    'admin',
    'member'
);



--
-- Name: add_dataset_column(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_dataset_column(p_dataset_id uuid, p_key text, p_default jsonb) RETURNS void
    LANGUAGE sql
    AS $$
  update public.dataset_rows
     set data = jsonb_set(coalesce(data, '{}'::jsonb), array[p_key], coalesce(p_default, 'null'::jsonb), true)
   where dataset_id = p_dataset_id
     and not (coalesce(data, '{}'::jsonb) ? p_key);
$$;



SET default_tablespace = '';


SET default_table_access_method = heap;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_personal boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: dataset_accepted_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dataset_accepted_counts(p_org_id uuid) RETURNS TABLE(dataset_id uuid, n bigint)
    LANGUAGE sql STABLE
    AS $$
  select dataset_id, count(*)::bigint
    from public.dataset_rows
   where org_id = p_org_id and status = 'accepted'
   group by dataset_id;
$$;



--
-- Name: knowledge_match_entities(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.knowledge_match_entities(p_org uuid, p_kind text, p_label text, p_limit integer DEFAULT 10) RETURNS TABLE(id uuid, canonical_label text, sim real)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select e.id, e.canonical_label, similarity(e.canonical_label, p_label) as sim
  from public.entities e
  where e.org_id = p_org
    and e.kind = p_kind
    and e.merged_into is null
    and (
      e.canonical_label % p_label
      or e.canonical_label ilike '%' || p_label || '%'
      or p_label ilike '%' || e.canonical_label || '%'
    )
  order by sim desc
  limit p_limit;
$$;



--
-- Name: remove_dataset_column(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_dataset_column(p_dataset_id uuid, p_key text) RETURNS void
    LANGUAGE sql
    AS $$
  update public.dataset_rows
     set data = data - p_key
   where dataset_id = p_dataset_id
     and data ? p_key;
$$;



--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    name text NOT NULL,
    purpose_text text,
    purpose public.agent_purpose DEFAULT 'curate'::public.agent_purpose NOT NULL,
    channels text[] DEFAULT '{}'::text[] NOT NULL,
    mode public.agent_mode DEFAULT 'auto'::public.agent_mode NOT NULL,
    status public.agent_status DEFAULT 'active'::public.agent_status NOT NULL,
    freestyle boolean DEFAULT false NOT NULL,
    avatar_bg text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid,
    filename text,
    content_type text,
    bytes bigint DEFAULT 0 NOT NULL,
    blob_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: blobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blobs (
    org_id uuid NOT NULL,
    hash text NOT NULL,
    storage_path text NOT NULL,
    bytes bigint NOT NULL,
    stored_bytes bigint NOT NULL,
    encoding text DEFAULT 'identity'::text NOT NULL,
    content_type text,
    ref_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: channel_link_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_link_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    channel public.ingest_channel NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    consumed_handle text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: dataset_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dataset_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    from_dataset_id uuid NOT NULL,
    from_column text NOT NULL,
    to_dataset_id uuid NOT NULL,
    to_column text NOT NULL,
    label text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: dataset_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dataset_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_id uuid NOT NULL,
    org_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.dataset_row_status DEFAULT 'accepted'::public.dataset_row_status NOT NULL,
    source_item_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'manual'::text NOT NULL,
    human_edited boolean DEFAULT false NOT NULL,
    proposed_kind text,
    target_row_id uuid,
    proposed_by text,
    batch_id uuid,
    subject_entity_id uuid
);



--
-- Name: dataset_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dataset_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_id uuid NOT NULL,
    org_id uuid NOT NULL,
    actor text DEFAULT 'You'::text NOT NULL,
    summary text NOT NULL,
    columns jsonb DEFAULT '[]'::jsonb NOT NULL,
    rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: datasets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    agent_id uuid,
    name text NOT NULL,
    description text,
    columns jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid,
    kind text NOT NULL,
    canonical_label text NOT NULL,
    normalized_key text NOT NULL,
    natural_keys jsonb DEFAULT '{}'::jsonb NOT NULL,
    embedding public.vector(1536),
    support integer DEFAULT 0 NOT NULL,
    merged_into uuid,
    body_md text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: fact_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fact_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    fact_id uuid NOT NULL,
    source_item_id uuid,
    snippet text,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid,
    subject_entity_id uuid NOT NULL,
    predicate text NOT NULL,
    object_entity_id uuid,
    value_text text,
    value_num numeric,
    value_date date,
    unit text,
    cardinality text DEFAULT 'one'::text NOT NULL,
    claim_key text NOT NULL,
    confidence real DEFAULT 1.0 NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_to timestamp with time zone,
    superseded_by uuid,
    source_item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: forwarding_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forwarding_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid,
    address text NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: ingest_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid,
    channel public.ingest_channel NOT NULL,
    mode public.capture_mode DEFAULT 'active'::public.capture_mode NOT NULL,
    handle text NOT NULL,
    display_name text,
    provider text,
    secret text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid,
    source_id uuid,
    channel public.ingest_channel NOT NULL,
    capture_mode public.capture_mode DEFAULT 'active'::public.capture_mode NOT NULL,
    external_id text,
    external_account text,
    sender text,
    recipients text[],
    subject text,
    body_preview text,
    body_hash text,
    raw_hash text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    bytes bigint DEFAULT 0 NOT NULL,
    sent_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.item_status DEFAULT 'received'::public.item_status NOT NULL,
    error text,
    claimed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    extraction_version integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: doc_chunks; Type: TABLE; Schema: public; Owner: -
--
-- Evidence layer: chunk-level passages from documents (page lineage +
-- optional embeddings) so search and grounded answers can cite from INSIDE
-- documents, not just from extracted facts.

CREATE TABLE public.doc_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    item_id uuid,
    seq integer NOT NULL,
    page integer,
    text text NOT NULL,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX doc_chunks_org_idx ON public.doc_chunks USING btree (org_id);

CREATE INDEX doc_chunks_entity_idx ON public.doc_chunks USING btree (entity_id, seq);

CREATE INDEX doc_chunks_embedding_idx ON public.doc_chunks USING hnsw (embedding public.vector_cosine_ops);



--
-- Name: kinds; Type: TABLE; Schema: public; Owner: -
--
-- Ontology layer: user-editable kind registry ("Categories") — display
-- identity, classifier-steering description, field template + relation
-- vocabulary per entity kind. Builtins seeded per org, editable.

CREATE TABLE public.kinds (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    owner_user_id uuid,
    kind text NOT NULL,
    label text NOT NULL,
    plural text,
    icon text,
    color text,
    description text,
    aliases text[] DEFAULT '{}' NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    relations jsonb DEFAULT '[]'::jsonb NOT NULL,
    builtin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX kinds_org_kind_uq ON public.kinds USING btree (org_id, kind);

CREATE INDEX kinds_org_idx ON public.kinds USING btree (org_id);



--
-- Name: knowledge_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    owner_user_id uuid,
    kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confidence real,
    impact integer DEFAULT 0 NOT NULL,
    source_entity_id uuid,
    target_entity_id uuid,
    new_fact_id uuid,
    old_fact_id uuid,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    item_id uuid
);



--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.org_role DEFAULT 'member'::public.org_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: sheet_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sheet_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_id uuid NOT NULL,
    org_id uuid NOT NULL,
    source_kind text DEFAULT 'upload'::text NOT NULL,
    source_ref text,
    key_column text NOT NULL,
    last_synced_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    user_id uuid NOT NULL,
    plan public.billing_plan DEFAULT 'free'::public.billing_plan NOT NULL,
    compute_mode text DEFAULT 'byok'::text NOT NULL,
    ai_provider text DEFAULT 'anthropic'::text NOT NULL,
    byok_key text,
    stripe_customer_id text,
    stripe_subscription_id text,
    plan_status text,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_context text,
    onboarding jsonb DEFAULT '{}'::jsonb NOT NULL
);



--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);



--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);



--
-- Name: blobs blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blobs
    ADD CONSTRAINT blobs_pkey PRIMARY KEY (org_id, hash);



--
-- Name: channel_link_codes channel_link_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_link_codes
    ADD CONSTRAINT channel_link_codes_code_key UNIQUE (code);



--
-- Name: channel_link_codes channel_link_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_link_codes
    ADD CONSTRAINT channel_link_codes_pkey PRIMARY KEY (id);



--
-- Name: dataset_relations dataset_relations_from_dataset_id_from_column_to_dataset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_relations
    ADD CONSTRAINT dataset_relations_from_dataset_id_from_column_to_dataset_id_key UNIQUE (from_dataset_id, from_column, to_dataset_id, to_column);



--
-- Name: dataset_relations dataset_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_relations
    ADD CONSTRAINT dataset_relations_pkey PRIMARY KEY (id);



--
-- Name: dataset_rows dataset_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_rows
    ADD CONSTRAINT dataset_rows_pkey PRIMARY KEY (id);



--
-- Name: dataset_snapshots dataset_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_snapshots
    ADD CONSTRAINT dataset_snapshots_pkey PRIMARY KEY (id);



--
-- Name: datasets datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_pkey PRIMARY KEY (id);



--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);



--
-- Name: fact_sources fact_sources_fact_id_source_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_sources
    ADD CONSTRAINT fact_sources_fact_id_source_item_id_key UNIQUE (fact_id, source_item_id);



--
-- Name: fact_sources fact_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_sources
    ADD CONSTRAINT fact_sources_pkey PRIMARY KEY (id);



--
-- Name: facts facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_pkey PRIMARY KEY (id);



--
-- Name: forwarding_addresses forwarding_addresses_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forwarding_addresses
    ADD CONSTRAINT forwarding_addresses_address_key UNIQUE (address);



--
-- Name: forwarding_addresses forwarding_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forwarding_addresses
    ADD CONSTRAINT forwarding_addresses_pkey PRIMARY KEY (id);



--
-- Name: ingest_sources ingest_sources_channel_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_sources
    ADD CONSTRAINT ingest_sources_channel_handle_key UNIQUE (channel, handle);



--
-- Name: ingest_sources ingest_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_sources
    ADD CONSTRAINT ingest_sources_pkey PRIMARY KEY (id);



--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);



--
-- Name: knowledge_reviews knowledge_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_reviews
    ADD CONSTRAINT knowledge_reviews_pkey PRIMARY KEY (id);



--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (org_id, user_id);



--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);



--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);



--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);



--
-- Name: sheet_links sheet_links_dataset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_links
    ADD CONSTRAINT sheet_links_dataset_id_key UNIQUE (dataset_id);



--
-- Name: sheet_links sheet_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_links
    ADD CONSTRAINT sheet_links_pkey PRIMARY KEY (id);



--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);



--
-- Name: agents_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_org_created_idx ON public.agents USING btree (org_id, created_at);



--
-- Name: agents_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_org_idx ON public.agents USING btree (org_id);



--
-- Name: agents_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_owner_idx ON public.agents USING btree (owner_user_id);



--
-- Name: attachments_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_item_idx ON public.attachments USING btree (item_id);



--
-- Name: attachments_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_org_idx ON public.attachments USING btree (org_id);



--
-- Name: channel_link_codes_live_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_link_codes_live_idx ON public.channel_link_codes USING btree (code) WHERE (consumed_at IS NULL);



--
-- Name: channel_link_codes_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_link_codes_owner_idx ON public.channel_link_codes USING btree (owner_user_id);



--
-- Name: dataset_relations_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_relations_from_idx ON public.dataset_relations USING btree (from_dataset_id);



--
-- Name: dataset_relations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_relations_org_idx ON public.dataset_relations USING btree (org_id);



--
-- Name: dataset_relations_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_relations_to_idx ON public.dataset_relations USING btree (to_dataset_id);



--
-- Name: dataset_rows_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_batch_idx ON public.dataset_rows USING btree (batch_id) WHERE (status = 'proposed'::public.dataset_row_status);



--
-- Name: dataset_rows_dataset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_dataset_idx ON public.dataset_rows USING btree (dataset_id);



--
-- Name: dataset_rows_dataset_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_dataset_status_created_idx ON public.dataset_rows USING btree (dataset_id, status, created_at);



--
-- Name: dataset_rows_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_entity_idx ON public.dataset_rows USING btree (dataset_id, subject_entity_id);



--
-- Name: dataset_rows_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_org_created_idx ON public.dataset_rows USING btree (org_id, created_at);



--
-- Name: dataset_rows_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_org_idx ON public.dataset_rows USING btree (org_id);



--
-- Name: dataset_rows_org_proposed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_org_proposed_idx ON public.dataset_rows USING btree (org_id, created_at DESC) WHERE (status = 'proposed'::public.dataset_row_status);



--
-- Name: dataset_rows_proposed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_rows_proposed_idx ON public.dataset_rows USING btree (dataset_id) WHERE (status = 'proposed'::public.dataset_row_status);



--
-- Name: dataset_snapshots_dataset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_snapshots_dataset_idx ON public.dataset_snapshots USING btree (dataset_id, created_at DESC);



--
-- Name: dataset_snapshots_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dataset_snapshots_org_created_idx ON public.dataset_snapshots USING btree (org_id, created_at DESC);



--
-- Name: datasets_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX datasets_agent_idx ON public.datasets USING btree (agent_id);



--
-- Name: datasets_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX datasets_org_created_idx ON public.datasets USING btree (org_id, created_at);



--
-- Name: datasets_org_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX datasets_org_name_idx ON public.datasets USING btree (org_id, lower(name));



--
-- Name: entities_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entities_embedding_idx ON public.entities USING hnsw (embedding public.vector_cosine_ops);



--
-- Name: entities_label_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entities_label_trgm ON public.entities USING gin (canonical_label public.gin_trgm_ops);



--
-- Name: entities_norm_key_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entities_norm_key_uq ON public.entities USING btree (org_id, kind, normalized_key) WHERE (merged_into IS NULL);



--
-- Name: entities_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entities_org_idx ON public.entities USING btree (org_id);



--
-- Name: fact_sources_fact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fact_sources_fact_idx ON public.fact_sources USING btree (fact_id);



--
-- Name: facts_current_claim_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX facts_current_claim_uq ON public.facts USING btree (org_id, claim_key) WHERE (valid_to IS NULL);



--
-- Name: facts_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX facts_org_idx ON public.facts USING btree (org_id);



--
-- Name: facts_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX facts_source_idx ON public.facts USING btree (source_item_id);



--
-- Name: facts_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX facts_subject_idx ON public.facts USING btree (subject_entity_id);



--
-- Name: forwarding_addresses_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forwarding_addresses_org_id_idx ON public.forwarding_addresses USING btree (org_id);



--
-- Name: forwarding_addresses_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forwarding_addresses_owner_idx ON public.forwarding_addresses USING btree (owner_user_id);



--
-- Name: ingest_sources_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingest_sources_org_idx ON public.ingest_sources USING btree (org_id);



--
-- Name: items_idem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX items_idem_idx ON public.items USING btree (org_id, channel, external_id) WHERE (external_id IS NOT NULL);



--
-- Name: items_org_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_org_received_idx ON public.items USING btree (org_id, received_at DESC);



--
-- Name: items_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_status_idx ON public.items USING btree (status);



--
-- Name: knowledge_reviews_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_reviews_item_idx ON public.knowledge_reviews USING btree (item_id);



--
-- Name: knowledge_reviews_triage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_reviews_triage_idx ON public.knowledge_reviews USING btree (org_id, status, impact DESC, confidence);



--
-- Name: organization_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_user_id_idx ON public.organization_members USING btree (user_id);



--
-- Name: sheet_links_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sheet_links_org_idx ON public.sheet_links USING btree (org_id);



--
-- Name: agents agents_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agents_touch_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();



--
-- Name: attachments attachments_refcount_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attachments_refcount_trg AFTER INSERT OR DELETE ON public.attachments FOR EACH ROW EXECUTE FUNCTION private.attachments_refcount();



--
-- Name: dataset_rows dataset_rows_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dataset_rows_touch_updated_at BEFORE UPDATE ON public.dataset_rows FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();



--
-- Name: datasets datasets_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER datasets_touch_updated_at BEFORE UPDATE ON public.datasets FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();



--
-- Name: items items_refcount_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_refcount_trg AFTER INSERT OR DELETE ON public.items FOR EACH ROW EXECUTE FUNCTION private.items_refcount();



--
-- Name: user_settings user_settings_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_settings_touch_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();



--
-- Name: agents agents_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: attachments attachments_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;



--
-- Name: attachments attachments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: blobs blobs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blobs
    ADD CONSTRAINT blobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: channel_link_codes channel_link_codes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_link_codes
    ADD CONSTRAINT channel_link_codes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: dataset_relations dataset_relations_from_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_relations
    ADD CONSTRAINT dataset_relations_from_dataset_id_fkey FOREIGN KEY (from_dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;



--
-- Name: dataset_relations dataset_relations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_relations
    ADD CONSTRAINT dataset_relations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: dataset_relations dataset_relations_to_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_relations
    ADD CONSTRAINT dataset_relations_to_dataset_id_fkey FOREIGN KEY (to_dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;



--
-- Name: dataset_rows dataset_rows_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_rows
    ADD CONSTRAINT dataset_rows_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;



--
-- Name: dataset_rows dataset_rows_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_rows
    ADD CONSTRAINT dataset_rows_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: dataset_rows dataset_rows_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_rows
    ADD CONSTRAINT dataset_rows_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.items(id) ON DELETE SET NULL;



--
-- Name: dataset_rows dataset_rows_subject_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_rows
    ADD CONSTRAINT dataset_rows_subject_entity_id_fkey FOREIGN KEY (subject_entity_id) REFERENCES public.entities(id) ON DELETE SET NULL;



--
-- Name: dataset_rows dataset_rows_target_row_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_rows
    ADD CONSTRAINT dataset_rows_target_row_id_fkey FOREIGN KEY (target_row_id) REFERENCES public.dataset_rows(id) ON DELETE CASCADE;



--
-- Name: dataset_snapshots dataset_snapshots_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_snapshots
    ADD CONSTRAINT dataset_snapshots_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;



--
-- Name: dataset_snapshots dataset_snapshots_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_snapshots
    ADD CONSTRAINT dataset_snapshots_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: datasets datasets_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;



--
-- Name: datasets datasets_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: entities entities_merged_into_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.entities(id) ON DELETE SET NULL;



--
-- Name: entities entities_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: fact_sources fact_sources_fact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_sources
    ADD CONSTRAINT fact_sources_fact_id_fkey FOREIGN KEY (fact_id) REFERENCES public.facts(id) ON DELETE CASCADE;



--
-- Name: fact_sources fact_sources_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_sources
    ADD CONSTRAINT fact_sources_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: fact_sources fact_sources_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_sources
    ADD CONSTRAINT fact_sources_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.items(id) ON DELETE SET NULL;



--
-- Name: facts facts_object_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_object_entity_id_fkey FOREIGN KEY (object_entity_id) REFERENCES public.entities(id) ON DELETE SET NULL;



--
-- Name: facts facts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: facts facts_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.items(id) ON DELETE SET NULL;



--
-- Name: facts facts_subject_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_subject_entity_id_fkey FOREIGN KEY (subject_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;



--
-- Name: facts facts_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.facts(id) ON DELETE SET NULL;



--
-- Name: forwarding_addresses forwarding_addresses_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forwarding_addresses
    ADD CONSTRAINT forwarding_addresses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: ingest_sources ingest_sources_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_sources
    ADD CONSTRAINT ingest_sources_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: items items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: items items_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.ingest_sources(id) ON DELETE SET NULL;



--
-- Name: knowledge_reviews knowledge_reviews_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_reviews
    ADD CONSTRAINT knowledge_reviews_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;



--
-- Name: knowledge_reviews knowledge_reviews_new_fact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_reviews
    ADD CONSTRAINT knowledge_reviews_new_fact_id_fkey FOREIGN KEY (new_fact_id) REFERENCES public.facts(id) ON DELETE SET NULL;



--
-- Name: knowledge_reviews knowledge_reviews_old_fact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_reviews
    ADD CONSTRAINT knowledge_reviews_old_fact_id_fkey FOREIGN KEY (old_fact_id) REFERENCES public.facts(id) ON DELETE SET NULL;



--
-- Name: knowledge_reviews knowledge_reviews_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_reviews
    ADD CONSTRAINT knowledge_reviews_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: knowledge_reviews knowledge_reviews_source_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_reviews
    ADD CONSTRAINT knowledge_reviews_source_entity_id_fkey FOREIGN KEY (source_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;



--
-- Name: knowledge_reviews knowledge_reviews_target_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_reviews
    ADD CONSTRAINT knowledge_reviews_target_entity_id_fkey FOREIGN KEY (target_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;



--
-- Name: organization_members organization_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;



--
-- Name: sheet_links sheet_links_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_links
    ADD CONSTRAINT sheet_links_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;



--
-- Name: sheet_links sheet_links_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_links
    ADD CONSTRAINT sheet_links_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
--
-- PostgreSQL database dump complete
--

\unrestrict fxdPUuJNYQiA5izh1LLelkKUnmD89ZfJ5d9OuE3DiOOpRsdnPwzNVg4pcemnSAy
