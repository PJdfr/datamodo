// Canonical ingestion envelope.
//
// Every source — a forwarded email (via any provider), an auto-synced mailbox,
// a WhatsApp/Slack/Teams message, a direct upload — is normalized by a thin
// adapter into this one shape before it reaches the capture core. The store
// never sees provider-specific formats, so we are not locked to any email or
// messaging provider.

export type IngestChannel =
  | "email"
  | "whatsapp"
  | "slack"
  | "teams"
  | "sms"
  | "upload"
  | "other";

export type CaptureMode = "active" | "auto";

export interface IngestAttachment {
  filename?: string;
  contentType?: string;
  /** Raw bytes, base64-encoded. */
  dataBase64: string;
}

export interface IngestEnvelope {
  channel: IngestChannel;
  /** 'active' = user forwarded one thing; 'auto' = firehose we filter. */
  captureMode?: CaptureMode;

  // --- Routing: how we resolve the owning org/user. Provide either an explicit
  // (orgId, ownerUserId) pair, or a `recipient` handle we look up. ---
  orgId?: string;
  ownerUserId?: string;
  /** The address/number/account the item was sent to (matched against a source). */
  recipient?: string;

  // --- Provenance ---
  /** Provider message id — used as the idempotency key. */
  externalId?: string;
  /** The connected account the item arrived through (sender mailbox, WA number…). */
  externalAccount?: string;
  sender?: string;
  recipients?: string[];
  subject?: string;
  /** ISO 8601 timestamp the item was originally sent. */
  sentAt?: string;

  // --- Content ---
  bodyText?: string;
  bodyHtml?: string;
  /** The raw provider payload (e.g. the full .eml) kept for fidelity/replay. */
  raw?: { contentType?: string; dataBase64: string };
  attachments?: IngestAttachment[];

  /** Provider-specific extras, stored verbatim as jsonb (never load-bearing). */
  meta?: Record<string, unknown>;

  /** Durable pointer back to the provider's original (ids + deep link). Kept
   *  even after the heavy content is dereferenced, so the source can be
   *  re-fetched or deep-linked. See lib/ingest/retention.ts + source.ts. */
  sourceRef?: Record<string, unknown>;
}

export interface IngestResult {
  itemId: string;
  status: "stored" | "failed";
  /** True when this exact item was already ingested (idempotent no-op). */
  deduped: boolean;
  attachments: number;
  /** Blobs that already existed and were reused instead of re-uploaded. */
  blobsReused: number;
  bytes: number;
}
