# datamodo-email-ingest (Cloudflare Email Worker)

The inbound-email adapter. Cloudflare Email Routing catches every message sent to
the `datamodo.dev` catch-all and invokes this Worker, which parses the MIME,
normalizes it into the app's `IngestEnvelope`, and POSTs it to `/api/ingest`. The
app matches the recipient address to a user (`forwarding_addresses`) and captures
the message. This Worker is the only email-specific code in the stack.

```
sender → MX (datamodo.dev) → Email Routing catch-all → THIS WORKER
       → POST {APP_URL}/api/ingest (x-ingest-secret) → item captured → agent review
```

## One-time setup

### 1. Put the domain on Cloudflare
- Add `datamodo.dev` as a zone in Cloudflare and point the registrar's
  nameservers at the ones Cloudflare gives you. Wait for the zone to go *Active*.

### 2. Enable Email Routing
- Cloudflare dashboard → your domain → **Email** → **Email Routing** → enable.
- Accept the DNS records it adds (MX + an SPF `TXT`). These are required for mail
  to reach Cloudflare at all.

### 3. Deploy this Worker
```bash
cd workers/email-ingest
npm install
npx wrangler login
# Point the Worker at your deployed app:
#   edit wrangler.toml → APP_URL = "https://<your-app>"
npx wrangler secret put INGEST_WEBHOOK_SECRET   # same value as the app's env var
npx wrangler deploy
```

### 4. Route the catch-all to the Worker
- Email Routing → **Routing rules** → **Catch-all address** → Edit →
  **Action: Send to a Worker** → select `datamodo-email-ingest` → **Save** and
  enable the catch-all.

That's it — no per-user setup. Every `<token>@datamodo.dev` the app mints
(`lib/datamodo/inbox.ts`) is covered by the one catch-all.

## Test it
1. Sign in to the app and copy your inbox address (`<token>@datamodo.dev`).
2. Send or forward an email to it.
3. It should appear as a captured item; unknown addresses get bounced
   ("address does not exist"). Watch logs with `npx wrangler tail`.

## Notes / hardening
- **Auth:** we reject hard `dmarc=fail`; Cloudflare already filters obvious spam.
  Tighten by allow-listing senders per source later.
- **Reliability:** an Email Worker runs once and does not auto-retry on throw. If
  the app is briefly down the message is lost. For at-least-once delivery, push
  the envelope to a **Cloudflare Queue** here and drain it with a queue consumer.
- **Large attachments:** Email Routing caps message size (~25 MB) and the Worker
  has limited memory; base64-ing a huge attachment in-Worker is risky. For big
  files, stream `message.raw` to **R2** and pass a pointer instead of inline bytes.
- **Secret:** `INGEST_WEBHOOK_SECRET` must match the app's env var exactly, or
  `/api/ingest` returns 401.
