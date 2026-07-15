import { after } from "next/server";

/**
 * After the response is sent, claim and run extraction for freshly-stored items
 * (the same atomic `FOR UPDATE SKIP LOCKED` claim the cron sweep uses, so
 * racing a concurrent tick is safe). Shared by every capture route — email
 * (`/api/ingest`) and the local IMAP pull (`/api/local/imap`) — so a
 * just-captured item is processed immediately instead of waiting for the cron.
 */
export function kickExtraction(max = 3): void {
  after(async () => {
    try {
      const { claimStoredItems, runExtractionForItem } = await import("@/lib/datamodo/extract");
      const ids = await claimStoredItems(max);
      for (const id of ids) {
        try {
          await runExtractionForItem(id);
        } catch (err) {
          console.error(`[ingest] post-capture extraction failed for ${id}`, err);
        }
      }
    } catch (err) {
      console.error("[ingest] post-capture extraction kick failed", err);
    }
  });
}
