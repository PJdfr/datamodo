# Messaging channel webhooks (WhatsApp · Slack · Teams)

The forward-to-a-contact bots. A user forwards a message to a single shared bot
on the platform, and it lands in their Datamodo workspace for an agent to review
— the same capture pipeline as inbound email, just a different front door.

```
user forwards → platform → THIS WEBHOOK (verify signature)
   → linked sender?  yes → ingest() → item captured → agent review
                     no  → claim link code → write ingest_sources → confirm
```

## Why this is NOT one bot per user

Email routes by **recipient**: Cloudflare's catch-all gives every user a unique
`<token>@datamodo.dev`, so we know who a message is for by the address it was
sent *to*. Messaging platforms don't hand out infinite inbound addresses — a
WhatsApp number / Slack app / Teams bot is **one** heavyweight identity. So we
flip it and route by **sender**: one shared bot per platform, and we recognize
the user by *who forwarded* the message.

The user proves which platform identity is theirs exactly once, via a link code:

1. Dashboard → **Connect channel** mints a short code (`DM-XXXXX`, 15-min TTL).
2. The user sends that code to the bot.
3. The webhook consumes it and writes `(channel, handle) → user` into
   `ingest_sources` (`lib/channels/link.ts`).
4. Every later forward from that handle is attributed automatically by
   `resolveTarget()` — no code, no per-user provisioning.

All the shared machinery — storage, dedup, agent review — is the existing
`/api/ingest` core. Each channel here is just a thin adapter (`lib/channels/*`)
that verifies the request, normalizes into `InboundMessage[]`, and hands off to
`handleInbound()`.

## Endpoints

| Channel  | Route                    | Auth on inbound                              |
| -------- | ------------------------ | -------------------------------------------- |
| WhatsApp | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` HMAC (app secret)      |
| Slack    | `/api/webhooks/slack`    | `v0` request signature (signing secret)      |
| Teams    | `/api/webhooks/teams`    | Bot Framework Bearer JWT (verified vs JWKS)  |

Set the env vars in `.env.example` per channel. A channel with no secrets set is
inert (the dashboard shows "Not set up on the server yet"); it never 500s.

## One-time setup per platform

### WhatsApp (Meta WhatsApp Cloud API)
1. Create a Meta app + a WhatsApp Business number. Note the **Phone number ID**,
   a permanent **access token**, and the app **secret**.
2. Set `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (any string you pick),
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BOT_NUMBER`.
3. In the app's WhatsApp → Configuration, set the Callback URL to
   `https://<app>/api/webhooks/whatsapp` and the Verify Token to the same value.
   Meta calls `GET` with `hub.challenge`; the route echoes it. Subscribe to the
   **messages** field.

### Slack (Events API)
1. Create a Slack app. Copy the **Signing Secret** → `SLACK_SIGNING_SECRET`, and
   a **Bot User OAuth Token** (`xoxb-…`) → `SLACK_BOT_TOKEN`.
2. Event Subscriptions → Request URL `https://<app>/api/webhooks/slack`. Slack
   sends a one-time `url_verification` challenge, which the route echoes.
3. Subscribe to `message.im` (DMs) and add scopes `chat:write`, `im:history`.
4. Set `SLACK_BOT_HANDLE` for display (e.g. `@datamodo`).

### Microsoft Teams (Azure Bot Service)
1. Register an Azure Bot. Copy the **Microsoft App ID** → `TEAMS_APP_ID` and a
   client secret → `TEAMS_APP_PASSWORD`.
2. Set the bot's messaging endpoint to `https://<app>/api/webhooks/teams`.
3. Enable the Teams channel; install the bot for your users. Set
   `TEAMS_BOT_HANDLE` for display.

Inbound is authenticated by verifying the Bot Framework JWT against the channel
JWKS (`lib/channels/jwt.ts`) — issuer `https://api.botframework.com`, audience =
your app id. Replies use a client-credentials Connector token.

## Test
1. Sign in → **Connect channel** → pick a channel → copy the `DM-XXXXX` code.
2. Send the code to the bot. It replies "Connected".
3. Forward any message to the bot → it appears as a captured item. `wrangler`-
   style logs aren't needed; failures are logged server-side and the webhook
   still returns 200 (platforms retry aggressively on non-2xx).

## Retention & source of truth

Every captured message stores a lightweight **`source_ref`** (provider ids + a
deep link) alongside its content, so the UI can always "open the original" and,
where possible, re-fetch it. What happens to the heavy content (body + attachment
blobs) after review depends on whether the original is **re-fetchable from the
provider** — a per-channel capability in `lib/ingest/retention.ts`, not a guess
by channel name:

```
capture → store full content + source_ref            [content_state = hydrated]
  while a proposal from it is pending → keep full     (reviewer sees the chunk)
  last proposal accepted OR rejected →
     re-fetchable?  yes → drop blobs, keep source_ref [content_state = dereferenced]
                    no  → retain (WhatsApp, Cloudflare email, Teams-bot)
"show source" later → hydrated: read blobs · dereferenced: re-fetch by source_ref
```

`isRefetchable()` is `true` only for **Slack** today (`conversations.history` +
`files.info`). WhatsApp has no read API and its media expires; Cloudflare-routed
email is push-once; a Teams bot can't read history — so those are **always
retained**, because dereferencing would be irreversible data loss. Email flips to
re-fetchable the day a Gmail/Graph OAuth mailbox is connected — wire that one flag
and it joins Slack's behavior, no other change.

Attachments are **downloaded and stored on capture** on all four channels
(WhatsApp media via Graph, Slack files via the bot token, Teams via the file
downloadUrl / Connector token). That's the only copy guaranteed to survive for
non-re-fetchable channels. `getItemSource()` (`lib/ingest/source.ts`) reads the
stored bytes while hydrated and re-fetches from the provider once dereferenced.

## Hardening notes
- **Latency / retries:** parse + ingest run inline (WhatsApp also downloads media
  inline). Under load, push the normalized `InboundMessage[]` onto a queue and
  return 200 immediately, draining with a worker — mirrors the email worker's
  queue note.
- **Idempotency:** each `InboundMessage.externalId` is the provider message id, so
  a replayed webhook is deduped by the capture core (unique `(org, channel,
  external_id)`), exactly like email.
- **Least privilege:** reply tokens are optional. Without them, linking still
  works — the user just doesn't get the "Connected" confirmation message back.
