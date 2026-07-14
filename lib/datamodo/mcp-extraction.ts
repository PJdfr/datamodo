// The MCP `submit_extraction` contract — a strict zod mirror of the server's
// Extraction input (knowledge.ts): the CLIENT model (Claude on the user's
// subscription) extracts, the SERVER pipeline stays deterministic
// (canonicalization, resolution, dedup, supersession, reviews). Validation
// lives here so the tool can reject malformed submissions with a message the
// model can act on, and so it unit-tests without the MCP transport.

import { z } from "zod";
import type { Extraction } from "./knowledge";

const localId = z.string().min(1).max(120);

export const extractionSchema = z
  .object({
    entities: z
      .array(
        z.object({
          localId,
          kind: z.string().min(1).max(60),
          label: z.string().min(1).max(300),
          naturalKeys: z.record(z.string(), z.string().max(300)).optional(),
        }),
      )
      .max(60),
    facts: z
      .array(
        z.object({
          subjectLocalId: localId,
          predicate: z.string().min(1).max(80),
          cardinality: z.enum(["one", "many"]).optional(),
          value: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("text"), text: z.string().min(1).max(2000) }),
            z.object({ kind: z.literal("number"), num: z.number().finite(), unit: z.string().max(20).optional() }),
            z.object({ kind: z.literal("date"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD") }),
            z.object({ kind: z.literal("entity"), entityLocalId: localId }),
          ]),
          confidence: z.number().min(0).max(1).optional(),
          snippet: z.string().max(500).optional(),
        }),
      )
      .max(200),
  })
  .superRefine((x, ctx) => {
    // Every fact must reference declared entities — a dangling localId would
    // silently drop server-side; better to bounce it back to the model.
    const ids = new Set(x.entities.map((e) => e.localId));
    x.facts.forEach((f, i) => {
      if (!ids.has(f.subjectLocalId)) {
        ctx.addIssue({ code: "custom", path: ["facts", i, "subjectLocalId"], message: `unknown entity localId "${f.subjectLocalId}"` });
      }
      if (f.value.kind === "entity" && !ids.has(f.value.entityLocalId)) {
        ctx.addIssue({ code: "custom", path: ["facts", i, "value", "entityLocalId"], message: `unknown entity localId "${f.value.entityLocalId}"` });
      }
    });
  });

/** Parse a submission → the server Extraction shape, or a message the model
 *  can fix its output from. */
export function parseExtraction(input: unknown): { ok: true; extraction: Extraction } | { ok: false; error: string } {
  const r = extractionSchema.safeParse(input);
  if (!r.success) {
    const first = r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: `invalid extraction — ${first}` };
  }
  return { ok: true, extraction: r.data as Extraction };
}
