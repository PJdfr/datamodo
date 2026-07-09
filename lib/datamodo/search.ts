import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatasetColumn, KnowledgeEntityView } from "./types";

/**
 * Keyword search over the user's own tables — the buildable-today half of the
 * search vision (plain-language answers with citations come later, once the LLM
 * layer is wired). This runs entirely on the user's RLS client, so it can only
 * ever see the caller's own rows.
 *
 * Ranking is deliberately simple: a row scores by how many DISTINCT query terms
 * it matches (across its cell values, its column labels, and its table name), so
 * a row that hits more of what you typed sorts higher. No stemming, no fuzzy —
 * substring, case-insensitive. Good enough for v1; swap in pg full-text / the
 * embedding layer when volume or recall demands it.
 */

export interface SearchCell {
  column: string;
  label: string;
  value: string;
  matched: boolean;
}

export interface SearchHit {
  rowId: string;
  datasetId: string;
  datasetName: string;
  cells: SearchCell[];
  score: number;
}

export interface SearchResult {
  query: string;
  terms: string[];
  total: number;
  hits: SearchHit[];
}

// Question / filler words carry no signal for a keyword match — drop them so
// "How much did I invoice Acme?" searches for {invoice, acme}, not {how, much, i}.
const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are",
  "was", "were", "how", "much", "many", "what", "which", "who", "whom", "when",
  "where", "why", "did", "do", "does", "i", "my", "me", "this", "that", "at",
  "by", "with", "all", "any", "from", "have", "has", "had", "still", "so",
]);

/** Split a raw query into distinct, lowercased, meaningful search terms. */
export function tokenize(q: string): string[] {
  const raw = q.toLowerCase().match(/[a-z0-9@._$-]+/g) ?? [];
  return Array.from(new Set(raw.filter((t) => t.length >= 2 && !STOP.has(t))));
}

export async function searchDatasets(
  db: SupabaseClient,
  orgId: string,
  rawQuery: string,
  opts: { limit?: number; scan?: number } = {},
): Promise<SearchResult> {
  const query = rawQuery.trim();
  const terms = tokenize(query);
  const limit = opts.limit ?? 40;
  const scan = opts.scan ?? 2000; // cap the rows we pull for a single search
  if (terms.length === 0) return { query, terms, total: 0, hits: [] };

  const { data: dsData, error: dsErr } = await db
    .from("datasets")
    .select("id, name, columns")
    .eq("org_id", orgId);
  if (dsErr) throw dsErr;
  const datasets = (dsData ?? []) as { id: string; name: string; columns: DatasetColumn[] | null }[];
  if (datasets.length === 0) return { query, terms, total: 0, hits: [] };
  const dsById = new Map(datasets.map((d) => [d.id, d]));

  const { data: rowData, error: rowErr } = await db
    .from("dataset_rows")
    .select("id, dataset_id, data")
    .eq("org_id", orgId)
    .eq("status", "accepted")
    .limit(scan);
  if (rowErr) throw rowErr;
  const rows = (rowData ?? []) as { id: string; dataset_id: string; data: Record<string, unknown> | null }[];

  const hits: SearchHit[] = [];
  for (const r of rows) {
    const ds = dsById.get(r.dataset_id);
    if (!ds) continue;
    const cols = Array.isArray(ds.columns) ? ds.columns : [];
    const data = r.data ?? {};
    const matchedTerms = new Set<string>();

    const cells: SearchCell[] = cols.map((c) => {
      const raw = data[c.key];
      const value = raw == null ? "" : String(raw);
      const hay = `${c.label} ${value}`.toLowerCase();
      let cellMatched = false;
      for (const t of terms) {
        if (hay.includes(t)) { cellMatched = true; matchedTerms.add(t); }
      }
      return { column: c.key, label: c.label, value, matched: cellMatched };
    });

    const nameHay = ds.name.toLowerCase();
    for (const t of terms) if (nameHay.includes(t)) matchedTerms.add(t);

    const score = matchedTerms.size;
    if (score > 0) hits.push({ rowId: r.id, datasetId: ds.id, datasetName: ds.name, cells, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return { query, terms, total: hits.length, hits: hits.slice(0, limit) };
}

/**
 * Keyword search over the knowledge layer (entities + their facts), so searching
 * finds the people/companies/things you know about — not just table rows. Pure:
 * takes the already-built KnowledgeEntityView[] (from listKnowledge) and the same
 * tokens as the table search, and ranks entities by distinct terms matched across
 * their label, kind, natural keys, and each fact's predicate/value.
 */
export interface KnowledgeHitFact { predicate: string; value: string; ref: boolean; matched: boolean }
export interface KnowledgeHit { id: string; label: string; kind: string; facts: KnowledgeHitFact[]; score: number }

export function searchKnowledge(entities: KnowledgeEntityView[], terms: string[], opts: { limit?: number } = {}): KnowledgeHit[] {
  const limit = opts.limit ?? 20;
  if (terms.length === 0) return [];
  const hits: KnowledgeHit[] = [];
  for (const e of entities) {
    const matched = new Set<string>();
    const nk = Object.entries(e.naturalKeys ?? {}).map(([k, v]) => `${k} ${v}`).join(" ");
    const head = `${e.label} ${e.kind} ${nk}`.toLowerCase();
    for (const t of terms) if (head.includes(t)) matched.add(t);
    const facts: KnowledgeHitFact[] = e.facts.map((f) => {
      const hay = `${f.predicate} ${f.value}`.toLowerCase();
      let m = false;
      for (const t of terms) if (hay.includes(t)) { m = true; matched.add(t); }
      return { predicate: f.predicate, value: f.value, ref: f.ref, matched: m };
    });
    if (matched.size > 0) hits.push({ id: e.id, label: e.label, kind: e.kind, facts, score: matched.size });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
