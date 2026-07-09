# Message forwarding + data-access work

Branch: `claude/message-forwarding-bot-wj0tlp`. This README summarizes everything
changed on the branch, how it fits together, what's verified, and what's next.

## What this adds, in one line

Extend capture beyond inbound email to **WhatsApp / Slack / Teams** (forward-to-a-
contact bots), add a **review-gated content-retention lifecycle**, and give
technical users **real SQL access** to their data via typed Postgres views.

---

## 1. Forward-to-a-contact bots (WhatsApp · Slack · Teams)

The capture core was already channel-agnostic (`IngestChannel`, `ingest_sources`,
`resolveTarget`). This adds the per-platform front doors + the linking messaging
needs.

**Routing model.** Email routes by *recipient* (a unique `<token>@datamodo.dev`).
Messaging platforms give you *one shared bot* per platform, so they route by
*sender*: the user links their platform identity once, then anything they forward
to the bot is attributed to them. **One shared bot per platform — never one per
user** (Meta/Slack/Microsoft don't hand out identities at that rate).

**Linking flow.** Dashboard → *Connect channel* mints a one-time code
(`DM-XXXXX`, 15-min TTL). The user sends it to the bot; the webhook consumes it
and writes `(channel, handle) → user` into `ingest_sources`. Every later forward
resolves automatically.

Files:
- `supabase/migrations/20260708120000_channel_link_codes.sql` — link-code table + RLS
- `lib/channels/` — `config` (env-gated per channel), `handles` (normalization),
  `link` (mint/claim codes), `inbound` (shared linked/link/nudge processor),
  `whatsapp` / `slack` / `teams` adapters, `jwt` (Bot Framework RS256 verify)
- `app/api/webhooks/{whatsapp,slack,teams}/route.ts`
- `app/dashboard/channels-modal.tsx` + `listChannelsAction` / `startChannelLinkAction`
- `app/api/webhooks/README.md` — per-platform setup (Meta / Slack / Azure)
- `.env.example` — channel env vars

## 2. Attachment capture + content-retention lifecycle

Attachments are downloaded + stored on capture on **all four channels** (WhatsApp
media via Graph, Slack files via bot token, Teams via downloadUrl / Connector
token, email already).

Retention is **capability-driven, not channel-name-driven** — the axis is "can we
re-fetch the original from the provider later?":

```
capture → store full content + source_ref            (hydrated)
  while a proposal from it is pending → keep full     (reviewer sees the chunk)
  last proposal accepted OR rejected →
     re-fetchable?  yes → drop blobs, keep source_ref (dereferenced)
                    no  → retain
"show source" later → hydrated: read blobs · dereferenced: re-fetch by source_ref
```

`isRefetchable()` is **true only for Slack** today. WhatsApp (no read API, media
expires), Cloudflare-routed email (push-once), and Teams-via-bot are **always
retained** — dereferencing them would be irreversible loss. Email auto-joins the
day a Gmail/Graph OAuth mailbox is wired.

Files:
- `supabase/migrations/20260708130000_item_retention.sql` — `items.source_ref` +
  `content_state`; `items_refcount` trigger now handles UPDATE (so nulling a hash
  frees the blob)
- `lib/ingest/retention.ts` — `isRefetchable`, `dereferenceItemIfSafe`,
  age-guarded orphan-blob GC, `dereferenceItems` hook
- `lib/ingest/source.ts` — `getItemSource` (read blobs when hydrated, re-fetch
  from provider when dereferenced)
- adapters set `source_ref`; accept/reject actions run the sweep after resolution

## 3. Typed SQL view projection (real-DB access for technical users)

The shared jsonb store stays the system of record (it's what makes the agent
propose→review→merge→version flow work). Each dataset is **projected** into a
typed Postgres view at `org_<orgid>.<dataset_slug>`, kept in lock-step by a
trigger. `security_invoker` views mean RLS still scopes each caller; only
`accepted` rows appear. Non-technical users use Excel/Sheets over the same rows.

Files:
- `supabase/migrations/20260708140000_dataset_sql_views.sql` — `sql_slug` /
  `org_schema` / `sync_dataset_view` / `drop_dataset_view`, a `datasets` trigger,
  and a backfill
- `lib/datamodo/projection.ts` — TS mirror of the naming (`org_x."trips"`)
- `docs/data-model.md` — tenancy (shared + RLS), the projection, Excel path, and
  the git-model-not-git-tool versioning decision

---

## Verification status

- **Typecheck + lint:** clean on all new/edited TS (pre-existing `stripe` /
  `@tanstack` "cannot find module" errors are just uninstalled deps in the dev
  container, unrelated to this branch).
- **NOT runtime-tested:** there is no Postgres/Supabase in the build container, so
  the migrations, the plpgsql (retention trigger, view generator), and the
  end-to-end webhook flows need a `supabase db reset` + real provider webhooks to
  confirm. Every channel is inert until its env vars are set (webhooks 401, never
  500), so nothing here activates by default.
- **Migrations apply on `dev`:** CI (`supabase-migrate.yml`) pushes migrations
  only on push to `dev`, so the hosted DB gets these tables/triggers when this
  branch merges — not before.

## Next steps (not built yet)

1. **Wire the review UI to `getItemSource`** — render the source message + its
   attachments behind a pending proposal (the retention design keeps content
   hydrated precisely so the reviewer sees this).
2. **Excel / Google Sheets two-way sync** — the non-technical UX (`sheet_links`
   scaffolding exists). Independent of storage.
3. **External SQL access** — grant a per-user Postgres role usage on its `org_*`
   schema, and make the views **writable** via `INSTEAD OF` triggers.
4. **Slack sender names** — resolve `users.info` (currently the raw user id).
5. **Richer WhatsApp types** — location, shared contacts, forwarded-context flag.
6. **Durability** — move the webhook parse+ingest behind a queue for at-least-once
   under load (mirrors the email worker's queue note).
7. **Decide on Prisma** — a dependency but imported nowhere; keep and wire, or cut.
8. **Optional field-level encryption** for raw bodies/attachments if the threat
   model needs more than at-rest infra encryption.
