-- BYOK MONTHLY SPEND CAP (2026-07-16): a per-user ceiling on what datamodo
-- may spend on the user's OWN LLM key in a calendar month, measured against
-- the llm_usage ledger (estimated costs count — the cap is a safety rail,
-- not an invoice). NULL = no cap. Enforcement lives in llmForUser: local
-- falls back to the machine's free Ollama, cloud fails the item with a clear
-- "cap reached" error. Idempotent DDL.

alter table public.user_settings
  add column if not exists byok_monthly_cap_usd double precision;
