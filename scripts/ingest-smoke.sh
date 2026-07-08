#!/usr/bin/env bash
# Connector smoke test — POST a synthetic email envelope to /api/ingest and
# verify the capture path (route → ingest() → items/blobs) works end-to-end,
# without needing real inbound-email infrastructure.
#
# Usage:
#   INGEST_WEBHOOK_SECRET=... RECIPIENT=token@datamodo.dev ./scripts/ingest-smoke.sh
#
# Env:
#   INGEST_URL             default http://localhost:3000/api/ingest
#   INGEST_WEBHOOK_SECRET  required — must match the app's env
#   RECIPIENT              a provisioned forwarding address (email channel), OR
#   ORG_ID                 explicit org id (bypasses recipient resolution)
set -euo pipefail

URL="${INGEST_URL:-http://localhost:3000/api/ingest}"
SECRET="${INGEST_WEBHOOK_SECRET:?set INGEST_WEBHOOK_SECRET}"

# A tiny but real-ish .eml kept as the raw payload, plus a text attachment.
EML=$'From: vendor@acme.example\r\nTo: '"${RECIPIENT:-inbox@datamodo.dev}"$'\r\nSubject: Invoice INV-1042 due 2026-08-01\r\n\r\nHi,\r\nPlease find invoice INV-1042 for $2,300.00, due 2026-08-01.\r\nThanks,\r\nAcme\r\n'
RAW_B64=$(printf '%s' "$EML" | base64 | tr -d '\n')
ATT_B64=$(printf 'INV-1042,2300.00,2026-08-01\n' | base64 | tr -d '\n')

# Route by recipient (email channel) or explicit orgId.
if [[ -n "${ORG_ID:-}" ]]; then
  ROUTING="\"orgId\": \"${ORG_ID}\""
else
  ROUTING="\"recipient\": \"${RECIPIENT:?set RECIPIENT or ORG_ID}\""
fi

PAYLOAD=$(cat <<JSON
{
  "channel": "email",
  "captureMode": "active",
  ${ROUTING},
  "externalId": "smoke-$(date +%s)",
  "sender": "vendor@acme.example",
  "subject": "Invoice INV-1042 due 2026-08-01",
  "sentAt": "2026-07-08T09:00:00Z",
  "bodyText": "Please find invoice INV-1042 for \$2,300.00, due 2026-08-01.",
  "raw": { "contentType": "message/rfc822", "dataBase64": "${RAW_B64}" },
  "attachments": [
    { "filename": "invoice.csv", "contentType": "text/csv", "dataBase64": "${ATT_B64}" }
  ]
}
JSON
)

echo "POST $URL" >&2
curl -sS -X POST "$URL" \
  -H "content-type: application/json" \
  -H "x-ingest-secret: ${SECRET}" \
  -d "$PAYLOAD" \
  -w '\nHTTP %{http_code}\n'
