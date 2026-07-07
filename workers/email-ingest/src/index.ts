import PostalMime from "postal-mime";

// Cloudflare Email Worker — the inbound-email adapter for Datamodo.
//
// Cloudflare Email Routing catches every message for the datamodo.dev
// catch-all and invokes this Worker's `email()` handler. We parse the raw MIME,
// gate on authentication, normalize into the app's provider-independent
// IngestEnvelope, and POST it to /api/ingest with the shared secret. The app's
// resolveTarget() maps the recipient address to the owning user.
//
// This Worker is the ONLY email-specific code: the address→user routing, storage,
// dedupe and agent review already live in the Next.js app.

export interface Env {
  /** Base URL of the deployed app, e.g. https://datamodo.app (no trailing slash). */
  APP_URL: string;
  /** Shared secret — must equal the app's INGEST_WEBHOOK_SECRET. Set with:
   *  `npx wrangler secret put INGEST_WEBHOOK_SECRET`. */
  INGEST_WEBHOOK_SECRET: string;
}

/** Binary → base64 (chunked so large attachments don't overflow the stack). */
function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Cloudflare adds an Authentication-Results header. Reject only hard DMARC
 *  failures — softer signals still reach the user, who reviews every change. */
function dmarcFailed(headers: Headers): boolean {
  return (headers.get("authentication-results") || "").toLowerCase().includes("dmarc=fail");
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (dmarcFailed(message.headers)) {
      message.setReject("Message failed DMARC authentication.");
      return;
    }

    const parsed = await PostalMime.parse(message.raw);

    const attachments = (parsed.attachments ?? []).map((a) => ({
      filename: a.filename ?? undefined,
      contentType: a.mimeType ?? undefined,
      dataBase64: typeof a.content === "string" ? a.content : toBase64(a.content),
    }));

    // Normalize into the app's IngestEnvelope (see lib/ingest/types.ts).
    const envelope = {
      channel: "email" as const,
      captureMode: "active" as const,
      recipient: message.to, // the <token>@datamodo.dev we route on
      externalId: parsed.messageId ?? message.headers.get("message-id") ?? undefined,
      externalAccount: message.to,
      sender: parsed.from?.address ?? message.from,
      recipients: (parsed.to ?? []).map((t) => t.address).filter(Boolean) as string[],
      subject: parsed.subject ?? undefined,
      sentAt: parsed.date ?? undefined,
      bodyText: parsed.text ?? undefined,
      bodyHtml: parsed.html ?? undefined,
      attachments,
    };

    const res = await fetch(`${env.APP_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-secret": env.INGEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify(envelope),
    });

    if (res.ok) return;

    const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };

    // Unknown recipient → no user has this address. Bounce so the sender knows.
    if (body.code === "NO_SOURCE" || body.code === "NO_ROUTING") {
      message.setReject("The address you sent to does not exist.");
      return;
    }
    // Anything else is our problem — surface it in Worker logs. (For at-least-once
    // durability under app outages, move the POST behind a Cloudflare Queue; see
    // README.) Throwing marks the invocation failed without bouncing the sender.
    throw new Error(`ingest failed: ${res.status} ${body.error ?? ""}`.trim());
  },
};
