-- MCP OAUTH (2026-07-16): datamodo as its own OAuth 2.1 authorization server
-- for the MCP endpoint, so claude.ai connectors can connect with a real
-- sign-in instead of a pasted bearer token (ROADMAP "MCP server", phase 3).
--
--   oauth_clients — dynamically registered clients (RFC 7591; public clients,
--                   PKCE-only, no secrets).
--   oauth_codes   — single-use authorization codes, PKCE(S256)-bound; the
--                   token endpoint DELETES first, so replays fail closed.
--   oauth_tokens  — access + rotating refresh tokens, stored as sha256 HASHES
--                   (a leaked table yields no usable credential). Per-user
--                   revocation = delete the user's rows — the thing the
--                   stateless HMAC dmk_ tokens can't do.
--
-- The HMAC dmk_ tokens keep working side by side (Claude Code / any
-- header-capable client). Idempotent DDL.

create table if not exists public.oauth_clients (
  id            uuid        primary key default gen_random_uuid(),
  client_id     text        not null unique,
  client_name   text        not null,
  redirect_uris jsonb       not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.oauth_codes (
  code_hash      text        primary key,
  client_id      text        not null,
  user_id        uuid        not null,
  redirect_uri   text        not null,
  code_challenge text        not null,
  scope          text        not null default 'vault',
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create table if not exists public.oauth_tokens (
  token_hash         text        primary key,
  refresh_hash       text        not null unique,
  client_id          text        not null,
  user_id            uuid        not null,
  scope              text        not null default 'vault',
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at         timestamptz not null default now()
);

-- Per-user revocation ("disconnect Claude") scans by user.
create index if not exists oauth_tokens_user_idx on public.oauth_tokens (user_id);
