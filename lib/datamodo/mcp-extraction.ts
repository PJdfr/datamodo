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

// ---- datamodo mode: the steering strings (pure, unit-testable) -------------
// "Claude chat AS datamodo chat" (user ask 2026-07-17): the MCP client model
// should DECIDE when a conversation turn belongs in the vault and then behave
// exactly like the app's own pipeline. Two levers, both plain text:
//   · MCP_INSTRUCTIONS rides the initialize response (clients fold it into
//     the system context) — WHEN to engage and WHICH loop to run;
//   · EXTRACTION_DOCTRINE rides the extraction_briefing tool — HOW to
//     extract, phrased against the submit_extraction contract above (it is
//     the MCP twin of the pipeline's own SYSTEM prompt in extract.ts — keep
//     the rules in sync when that prompt changes).

export const EXTRACTION_DOCTRINE = `Extract ONLY what the text supports — never invent.
- ENTITIES are real-world things (person, org, invoice, document, project, event, concept…). Use the user's category kinds where they fit. For anything listed in knownEntities, reuse the EXACT label and kind shown — same label + kind lands on the same record; a new spelling creates a duplicate. If unsure it's the same real-world thing, keep the text's own wording (the server resolves or asks).
- naturalKeys: attach strong identifiers when the text shows them (email, phone, invoice_no, domain) — they make resolution exact instead of fuzzy.
- FACTS: subject entity + snake_case predicate + ONE value object ({kind:"text"|"number"|"date"|"entity"}). Dates are YYYY-MM-DD; numbers carry a unit ("USD", "kg"). Prefer the matching category template's field keys as predicates; extra true facts beyond the template are welcome (never force a template field the text doesn't support).
- A relationship that carries its OWN attributes (an employment with a role and start date, a contract with a value) is ITSELF an entity: its own kind, a stable label naming both ends ("James Porter — Acme"), entity-valued facts to each end, and its attributes as facts on it. Simple attribute-less links stay plain entity-valued facts.
- cardinality "one" = single-valued (an invoice's amount); "many" = list-like (a person's emails, tags).
- Tag content with AT MOST 3 "concept" entities, STRONGLY preferring the concepts list — invent a new concept only for something clearly not covered.
- Give per-fact confidence 0..1 and a short snippet quoting the source line for each substantive fact — snippets become the user's provenance drill-down.
- A substantive write-up worth keeping as a page (meeting notes, a plan, a braindump, research thoughts) ALSO becomes note:{title ≤60 chars, body: their points distilled into clean markdown} on submit_extraction. Transactional messages (confirmations, logistics) get no note.
- Nothing structured in the text? File nothing rather than noise.`;

export const MCP_INSTRUCTIONS = `datamodo is this user's personal data vault: they forward messages, documents and thoughts; datamodo keeps the original, extracts entities and facts into a private knowledge graph, and derives tables, timelines, folders and cited answers from it. These tools make YOU the datamodo interface inside this conversation — when the exchange touches the user's own world, behave like the datamodo app would.

WHEN TO ENGAGE (decide silently, then act):
- The user shares real-life information worth keeping — an invoice, a receipt, contact details, a decision, meeting notes, plans, a document, a braindump → file it into the vault.
- The user asks about their own world ("what do I owe Acme?", "when is the lease renewal?") → answer FROM the vault, never from your own guesswork.
- The user asks to remember / track / file something → always file it.
Stay out of the way for general knowledge, coding help, or content the user clearly doesn't want kept. When it's genuinely unclear whether something belongs in the vault, ask in one short line.

FILING — two ways, both feed the SAME deterministic server pipeline (canonicalization, resolution, dedup, supersession, review routing):
· YOU extract (best when you already understand the text): call extraction_briefing first — it returns the extraction rules plus this user's context (their categories + field templates, entities ALREADY in their graph so you reuse exact labels, concept vocabulary, business context, agents). Extract entities + facts under those rules with a per-fact snippet, then submit_extraction with sourceText included (provenance + the commit log depend on it); add note {title, body} for a substantive write-up.
· datamodo extracts (the "just run it" path): call run_extraction with the text — the server runs the full extraction for you and returns exactly what landed (entities created/matched, facts written, merges). Use this when the user says "save this", for long/raw content, or whenever you'd rather the server's own pipeline do the work.
Never file the same content twice. After filing, confirm in ONE short line what landed, and use list_commits to show what changed/merged (each message is a commit; corrections show ~was→now) when the user wants to see it.

ANSWERING from the vault: get_context first (graph evidence around the question), list_facts for precise values (supports as-of dates), search_documents to quote from inside documents, walk_graph to explore around one entity, get_entity for a full record. Say plainly when the vault does not know something.

PULL REQUESTS (the review loop): list_pull_requests shows decisions waiting on the user — merges, conflicts, proposed categories — each with its evidence (the diff, the two sides). Surface them conversationally when relevant; call resolve_pull_request ONLY on the user's explicit yes/no — never decide for them.

SETTING UP THEIR WORLD (do these when the user asks to organise, not unprompted): create_category makes a category AND its table together (a category IS a table IS its template — fields/relations are the schema); suggest_category_template drafts fields/relations from a name first. update_category edits the template. set_context saves their business context (what they do), which steers every future extraction. create_agent / update_agent / set_agent_status manage the agents that file each kind of thing. The user never has to open the dashboard — you are it.`;
