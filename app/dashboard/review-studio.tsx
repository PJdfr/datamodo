"use client";

/**
 * REVIEW STUDIO — where the user validates what the knowledge layer inferred.
 *
 * Layout follows the QUESTION, not a template:
 *   • entity_merge → "are these the same thing?"   (side-by-side comparison)
 *   • fact_conflict → "which value is right now?"   (before → after diff)
 *   • extraction   → "did we understand this?"      (message ↔ facts, editorial)
 *   • off_template → "keep what didn't fit the template?" (doc facts, opt-in)
 *   • category_proposal → "make a category for these?"    (growth loop ⑤, opt-in)
 *   • orphan_prune → "prune what's linked to nothing?"     (consolidation pass, opt-in)
 * Flow: triage header → impact spotlight → calmer grouped sections, ranked by impact.
 *
 * Data comes from GET /api/knowledge/reviews (typed by lib/datamodo/review-types).
 * Real reviews only (user call 2026-07-16): no review = the calm all-caught-up
 * state, never simulated rows.
 */

import { useEffect, useMemo, useState } from "react";
import { C, Hov, ghostBtn, relTime } from "./ui";
import { ReviewCardBody, PAPER_SKIN } from "./review-card";
import { ReviewGraphPanel, previewInputFor } from "./review-graph-modal";
import { explainReview } from "@/lib/datamodo/review-explain";
import type { ReviewItem, MergeReview, ConflictReview, ExtractionReview, OffTemplateReview, CategoryProposalReview, OrphanPruneReview, FieldProposalReview } from "@/lib/datamodo/review-types";

/* ------------------------------ small atoms ------------------------------- */

function confColor(c: number): string {
  return c >= 0.85 ? C.green : c >= 0.65 ? C.gold : C.accent;
}

function ConfidenceRing({ value, size = 46 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const col = confColor(value);
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECE5D8" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={4} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - value)} />
      </svg>
      <span className="dm-mono" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: col }}>{Math.round(value * 100)}</span>
    </span>
  );
}

function ImpactMeter({ n }: { n: number }) {
  const filled = Math.max(1, Math.round((Math.min(n, 12) / 12) * 5));
  return (
    <span title={`Touches ${n} facts / edges`} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", height: 14 }}>
        {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 3, height: 5 + i * 2, borderRadius: 1, background: i < filled ? C.ink : "#E1D9C8" }} />)}
      </span>
      <span className="dm-mono" style={{ fontSize: 10.5, color: "#8A8477" }}>touches {n}</span>
    </span>
  );
}

const CHANNEL: Record<string, { emoji: string; label: string }> = {
  email: { emoji: "✉", label: "Email" }, whatsapp: { emoji: "🟢", label: "WhatsApp" },
  slack: { emoji: "▦", label: "Slack" }, teams: { emoji: "◇", label: "Teams" },
};
const channelOf = (c: string) => CHANNEL[c] ?? { emoji: "•", label: c };

function TypeChip({ label, tone }: { label: string; tone: string }) {
  return <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: tone, background: "#fff", border: `1px solid ${tone}33`, borderRadius: 6, padding: "2px 7px" }}>{label}</span>;
}

type Resolve = (id: string, action: "accept" | "reject") => void;

function Actions({ id, onResolve, acceptLabel, rejectLabel }: { id: string; onResolve: Resolve; acceptLabel: string; rejectLabel: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Hov onClick={() => onResolve(id, "accept")} base={{ background: C.green, color: "#fff", border: "none", borderRadius: 9, padding: "8px 15px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }} hover={{ background: "#357C4C" }}>{acceptLabel}</Hov>
      <Hov onClick={() => onResolve(id, "reject")} base={{ ...ghostBtn, padding: "7px 13px", fontSize: 12.5 }} hover={{ background: "#FBF8F1" }}>{rejectLabel}</Hov>
    </div>
  );
}

/* --------------------------- kind-specific cards -------------------------- */

/* Every card = kind-specific HEADER (what kind of decision) + the SHARED
 * evidence body (review-card.tsx — the same rendering the chat bubble uses,
 * paper skin) + kind-specific FOOTER (hint + action labels). */

function CardShell({ header, footer, children }: { header: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #E7E0D2", borderRadius: 15, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 15px", background: "#FBF8F1", borderBottom: "1px solid #EFE9DC", flexWrap: "wrap" }}>{header}</div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderTop: "1px solid #F1EDE4", background: "#FCFAF4", flexWrap: "wrap" }}>{footer}</div>
    </div>
  );
}

function MergeCard({ m, onResolve }: { m: MergeReview; onResolve: Resolve }) {
  return (
    <CardShell
      header={<>
        <TypeChip label="Possible duplicate" tone={C.accent} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Same {m.parsed.type}?</span>
        <div style={{ marginLeft: "auto" }}><ImpactMeter n={m.impact} /></div>
      </>}
      footer={<>
        <span style={{ fontSize: 12, color: "#8A8477" }}>Merging repoints every fact — a wrong merge is why we ask.</span>
        <div style={{ marginLeft: "auto" }}><Actions id={m.id} onResolve={onResolve} acceptLabel={`Merge into ${m.canonical.label}`} rejectLabel="Keep separate" /></div>
      </>}
    >
      <ReviewCardBody item={m} skin={PAPER_SKIN} />
    </CardShell>
  );
}

function ConflictCard({ c, onResolve }: { c: ConflictReview; onResolve: Resolve }) {
  return (
    <CardShell
      header={<>
        <TypeChip label="Value changed" tone={C.gold} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{c.subject}</span>
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477" }}>· {c.field}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {c.confidence != null && <span className="dm-mono" style={{ fontSize: 10.5, color: confColor(c.confidence) }}>{Math.round(c.confidence * 100)}% sure</span>}
          <ImpactMeter n={c.impact} />
        </div>
      </>}
      footer={<>
        <span style={{ fontSize: 12, color: "#8A8477" }}>The old value stays in history either way — bitemporal, nothing is erased.</span>
        <div style={{ marginLeft: "auto" }}><Actions id={c.id} onResolve={onResolve} acceptLabel="Use new" rejectLabel="Keep current" /></div>
      </>}
    >
      <ReviewCardBody item={c} skin={PAPER_SKIN} />
    </CardShell>
  );
}

function ExtractionCard({ e, onResolve }: { e: ExtractionReview; onResolve: Resolve }) {
  const ch = channelOf(e.channel);
  const low = (e.confidence ?? 1) < 0.65;
  return (
    <CardShell
      header={<>
        <TypeChip label="New from a message" tone={C.blue} />
        {low && <TypeChip label="low confidence" tone={C.gold} />}
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginLeft: "auto" }}>{ch.emoji} {ch.label} · {relTime(e.createdAt)}</span>
      </>}
      footer={<>
        <ConfidenceRing value={e.confidence ?? 1} size={34} />
        <span style={{ fontSize: 12, color: "#8A8477" }}>{low ? "Worth a glance — some of this is a guess." : "Looks clean — accept to file it into your data."}</span>
        <div style={{ marginLeft: "auto" }}><Actions id={e.id} onResolve={onResolve} acceptLabel="Accept all" rejectLabel="Discard" /></div>
      </>}
    >
      <ReviewCardBody item={e} skin={PAPER_SKIN} />
    </CardShell>
  );
}

function OffTemplateCard({ o, onResolve }: { o: OffTemplateReview; onResolve: Resolve }) {
  return (
    <CardShell
      header={<>
        <TypeChip label="Off the template" tone={C.blue} />
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginLeft: "auto" }}>▤ {o.docLabel} · {relTime(o.createdAt)}</span>
      </>}
      footer={<>
        <span style={{ fontSize: 12, color: "#8A8477" }}>Accept to file them into your graph anyway — or add the field to the category so next time it just fits.</span>
        <div style={{ marginLeft: "auto" }}><Actions id={o.id} onResolve={onResolve} acceptLabel="Add anyway" rejectLabel="Leave out" /></div>
      </>}
    >
      <ReviewCardBody item={o} skin={PAPER_SKIN} />
    </CardShell>
  );
}

function CategoryProposalCard({ p, onResolve }: { p: CategoryProposalReview; onResolve: Resolve }) {
  return (
    <CardShell
      header={<>
        <TypeChip label="New category?" tone={C.accent} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{p.icon ? `${p.icon} ` : ""}{p.label}</span>
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginLeft: "auto" }}>{p.count} captured · {relTime(p.createdAt)}</span>
      </>}
      footer={<>
        <span style={{ fontSize: 12, color: "#8A8477" }}>Accepting creates the category (a table shape too); declining never asks again.</span>
        <div style={{ marginLeft: "auto" }}><Actions id={p.id} onResolve={onResolve} acceptLabel="Create category" rejectLabel="No thanks" /></div>
      </>}
    >
      <ReviewCardBody item={p} skin={PAPER_SKIN} />
    </CardShell>
  );
}

function OrphanPruneCard({ o, onResolve }: { o: OrphanPruneReview; onResolve: Resolve }) {
  return (
    <CardShell
      header={<>
        <TypeChip label="Unlinked strays" tone={C.gold} />
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginLeft: "auto" }}>{o.count} flagged · {relTime(o.createdAt)}</span>
      </>}
      footer={<>
        <span style={{ fontSize: 12, color: "#8A8477" }}>Accept prunes only what is STILL unlinked; declining never asks about these again.</span>
        <div style={{ marginLeft: "auto" }}><Actions id={o.id} onResolve={onResolve} acceptLabel="Prune them" rejectLabel="Keep them" /></div>
      </>}
    >
      <ReviewCardBody item={o} skin={PAPER_SKIN} />
    </CardShell>
  );
}

function FieldProposalCard({ f, onResolve }: { f: FieldProposalReview; onResolve: Resolve }) {
  return (
    <CardShell
      header={<>
        <TypeChip label="Grow the template?" tone={C.green} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{f.targetKind} · {f.predicate.replace(/_/g, " ")}</span>
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginLeft: "auto" }}>{f.count} in use · {relTime(f.createdAt)}</span>
      </>}
      footer={<>
        <span style={{ fontSize: 12, color: "#8A8477" }}>Accepting adds the {f.aliasOf ? "alias" : f.asRelation ? "relation" : "field"} to the category; declining never asks about this one again.</span>
        <div style={{ marginLeft: "auto" }}><Actions id={f.id} onResolve={onResolve} acceptLabel={f.aliasOf ? "Add alias" : f.asRelation ? "Add relation" : "Add field"} rejectLabel="No thanks" /></div>
      </>}
    >
      <ReviewCardBody item={f} skin={PAPER_SKIN} />
    </CardShell>
  );
}

function renderCard(it: ReviewItem, onResolve: Resolve) {
  if (it.kind === "entity_merge") return <MergeCard m={it} onResolve={onResolve} />;
  if (it.kind === "fact_conflict") return <ConflictCard c={it} onResolve={onResolve} />;
  if (it.kind === "off_template") return <OffTemplateCard o={it} onResolve={onResolve} />;
  if (it.kind === "category_proposal") return <CategoryProposalCard p={it} onResolve={onResolve} />;
  if (it.kind === "orphan_prune") return <OrphanPruneCard o={it} onResolve={onResolve} />;
  if (it.kind === "field_proposal") return <FieldProposalCard f={it} onResolve={onResolve} />;
  return <ExtractionCard e={it} onResolve={onResolve} />;
}

/* ------------------------- PR-style queue pieces -------------------------- */
/* The queue reads like a pull request against your knowledge graph: a header
 * with the branch chips + change counts, grouped one-line diff rows you can
 * expand for the full evidence, and a merge bar. (Same metaphor as the landing
 * page's "Review the changes. Merge when it's right." section.) */

function GitGlyph({ light }: { light?: boolean }) {
  const s = light ? "#fff" : "currentColor";
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" style={{ display: "block" }}>
      <circle cx="4" cy="4" r="2" fill="none" stroke={s} strokeWidth="1.6" />
      <circle cx="4" cy="12" r="2" fill="none" stroke={s} strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2" fill="none" stroke={s} strokeWidth="1.6" />
      <path d="M4 6v4M6 12h4M12 6v4" fill="none" stroke={s} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PillBtn({ on, color, onClick, title, children }: { on?: boolean; color: string; onClick: () => void; title: string; children: string }) {
  const [h, setH] = useState(false);
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 27, height: 27, borderRadius: 7, cursor: "pointer", fontSize: 12, lineHeight: 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: "1px solid " + (on || h ? color : "#E1D9C8"),
        background: on ? color : h ? "#FBF8F1" : "#fff",
        color: on ? "#fff" : h ? color : "#8A8477",
        transform: h ? "scale(1.1)" : "scale(1)",
        transition: "all .14s ease",
      }}
    >
      {children}
    </button>
  );
}

/** One-line diff summary per review kind: glyph + mono text + branch color. */
function rowMeta(it: ReviewItem): { glyph: string; color: string; text: string } {
  if (it.kind === "entity_merge") return { glyph: "⇄", color: C.gold, text: `merge  “${it.parsed.label}”  into  “${it.canonical.label}”` };
  if (it.kind === "fact_conflict") return { glyph: "~", color: C.accent, text: `${it.subject} · ${it.field}  “${it.was}” → “${it.now}”` };
  if (it.kind === "off_template") return { glyph: "±", color: C.blue, text: `${it.facts.length} off-template fact${it.facts.length === 1 ? "" : "s"} from “${it.docLabel}”` };
  if (it.kind === "category_proposal") return { glyph: "▣", color: C.accent, text: `new category “${it.label}” — ${it.count} thing${it.count === 1 ? "" : "s"} already fit it` };
  if (it.kind === "orphan_prune") return { glyph: "−", color: C.gold, text: `prune ${it.count} unlinked stray${it.count === 1 ? "" : "s"} (${it.entities.slice(0, 3).map((e) => e.label).join(", ")}${it.count > 3 ? "…" : ""})` };
  if (it.kind === "field_proposal") return { glyph: "▤", color: C.green, text: `add “${it.predicate.replace(/_/g, " ")}” to the ${it.targetKind} template — ${it.count} fact${it.count === 1 ? "" : "s"} already use it` };
  const who = it.entities.map((e) => e.label).join(", ") || channelOf(it.channel).label;
  return { glyph: "+", color: C.green, text: `${it.facts.length} fact${it.facts.length === 1 ? "" : "s"} about ${who}` };
}

const GROUP_META: Record<ReviewItem["kind"], { title: string; hint: string }> = {
  entity_merge: { title: "Duplicates", hint: "same real-world thing twice?" },
  fact_conflict: { title: "Changed values", hint: "a newer message disagrees" },
  extraction: { title: "New from your messages", hint: "accept to file into your data" },
  off_template: { title: "Outside the template", hint: "a document said more than its category covers" },
  category_proposal: { title: "Proposed categories", hint: "things you keep capturing that no category covers" },
  orphan_prune: { title: "Unlinked strays", hint: "entities nothing references — prune or keep" },
  field_proposal: { title: "Template growth", hint: "predicates your facts keep using that no template covers" },
};

function DiffRow({ it, expanded, onToggle, onResolve }: { it: ReviewItem; expanded: boolean; onToggle: () => void; onResolve: Resolve }) {
  const m = rowMeta(it);
  const [hov, setHov] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #F1EDE4" }}>
      <div
        onClick={onToggle}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        role="button"
        aria-expanded={expanded}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 8px 12px", cursor: "pointer", background: expanded ? "#FBF8F1" : hov ? "#FCFAF4" : "transparent", transition: "background .15s ease" }}
      >
        <span className="dm-mono" style={{ width: 16, textAlign: "center", fontWeight: 700, fontSize: 13, color: m.color, flexShrink: 0 }}>{m.glyph}</span>
        <span className="dm-mono" style={{ flex: 1, fontSize: 11.5, color: "#514C43", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</span>
        {it.confidence != null && (
          <span className="dm-mono" style={{ fontSize: 10, color: confColor(it.confidence), flexShrink: 0 }}>{Math.round(it.confidence * 100)}%</span>
        )}
        <span className="dm-mono" title={`touches ${it.impact} facts/edges`} style={{ fontSize: 10, color: "#A39B8B", flexShrink: 0 }}>×{it.impact}</span>
        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <PillBtn title="Approve" color={C.green} onClick={() => onResolve(it.id, "accept")}>✓</PillBtn>
          <PillBtn title="Reject" color="#C7362C" onClick={() => onResolve(it.id, "reject")}>✕</PillBtn>
        </span>
        <span style={{ color: "#B7AF9F", fontSize: 12, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .12s", flexShrink: 0 }}>›</span>
      </div>
      {/* Click a row → the SIMPLE decision (user call 2026-07-20: source of
          the uncertainty first, then what accept/refuse each do, minimal
          words); the full evidence card + graph live behind "details". */}
      {expanded && <ExpandedDecision it={it} onResolve={onResolve} />}
    </div>
  );
}

/** One big clickable choice: what this future does, in one breath. */
function ChoiceCard({ glyph, tone, bg, border, label, body, onClick }: {
  glyph: string; tone: string; bg: string; border: string; label: string; body: string; onClick: () => void;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        flex: "1 1 260px", minWidth: 240, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        background: bg, border: `1px solid ${h ? tone : border}`, borderRadius: 13, padding: "13px 15px",
        boxShadow: h ? `0 10px 24px -14px ${tone}66` : "none",
        transform: h ? "translateY(-1px)" : "none", transition: "all .15s ease",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ width: 21, height: 21, borderRadius: "50%", background: tone, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{glyph}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{label}</span>
      </span>
      <span style={{ display: "block", fontSize: 12.5, color: "#57534A", lineHeight: 1.5 }}>{body}</span>
    </button>
  );
}

/** The expanded row: question → where it comes from → two futures to click.
 *  Everything else (the dense evidence card, the graph walk) is one
 *  disclosure away — depth on demand, never in the way of the choice. */
function ExpandedDecision({ it, onResolve }: { it: ReviewItem; onResolve: Resolve }) {
  const [details, setDetails] = useState(false);
  const ex = explainReview(it);
  const hasGraph = previewInputFor(it) !== null;
  return (
    <div style={{ padding: "2px 14px 16px" }}>
      <div className="dm-display" style={{ fontWeight: 700, fontSize: 16.5, letterSpacing: "-0.02em", color: C.ink, margin: "6px 2px 10px" }}>{ex.question}</div>

      {/* WHY: the source of the uncertainty, quoted when we have the text. */}
      <div style={{ background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11, padding: "10px 13px", marginBottom: 12 }}>
        <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 4 }}>why you&apos;re being asked</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: C.accent, fontSize: 13, flexShrink: 0 }}>{ex.source.icon}</span>
          <span style={{ fontSize: 13, color: "#3A352C", lineHeight: 1.5 }}>{ex.source.label}</span>
        </div>
        {ex.source.quote && (
          <div className="dm-mono" style={{ marginTop: 7, fontSize: 11.5, color: "#57534A", background: "#fff", border: "1px solid #EFE9DC", borderLeft: `3px solid ${C.accent}`, borderRadius: 7, padding: "7px 11px", lineHeight: 1.5 }}>
            “{ex.source.quote}”
          </div>
        )}
      </div>

      {/* THE CHOICE: two futures, each one click. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <ChoiceCard glyph="✓" tone={C.green} bg="#F5FAF6" border="#CBE4D2" label={ex.acceptLabel} body={ex.accept} onClick={() => onResolve(it.id, "accept")} />
        <ChoiceCard glyph="✕" tone="#C7362C" bg="#fff" border="#E7E0D2" label={ex.refuseLabel} body={ex.refuse} onClick={() => onResolve(it.id, "reject")} />
      </div>

      {/* DEPTH ON DEMAND: the full evidence card + the graph walk. */}
      <button type="button" onClick={() => setDetails((d) => !d)} className="dm-mono"
        style={{ marginTop: 10, background: "none", border: "none", padding: "4px 2px", cursor: "pointer", fontSize: 11, color: details ? C.accent : "#8A8477", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-block", transform: details ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▸</span>
        {details ? "Hide the evidence & graph" : hasGraph ? "See the evidence & what it does to your graph" : "See the full evidence"}
      </button>
      {details && (
        <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>{renderCard(it, onResolve)}</div>
          {hasGraph && (
            <div style={{ flex: "2 1 420px", minWidth: 320 }}>
              <ReviewGraphPanel item={it} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

export function ReviewStudio() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [done, setDone] = useState({ accepted: 0, rejected: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/knowledge/reviews");
        const json = await res.json();
        const real: ReviewItem[] = json.reviews ?? [];
        if (!alive) return;
        setItems(real);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const resolve: Resolve = (id, action) => {
    setItems((s) => s.filter((i) => i.id !== id));
    setDone((d) => (action === "accept" ? { ...d, accepted: d.accepted + 1 } : { ...d, rejected: d.rejected + 1 }));
    setExpanded((e) => (e === id ? null : e));
    void fetch(`/api/knowledge/reviews/${id}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
  };

  const live = useMemo(() => [...items].sort((a, b) => b.impact - a.impact), [items]);
  const groups = useMemo(() => {
    const order: ReviewItem["kind"][] = ["extraction", "fact_conflict", "entity_merge", "off_template", "category_proposal", "field_proposal", "orphan_prune"];
    return order
      .map((kind) => ({ kind, items: live.filter((i) => i.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [live]);
  const counts = {
    merge: live.filter((i) => i.kind === "entity_merge").length,
    conflict: live.filter((i) => i.kind === "fact_conflict").length,
    extraction: live.filter((i) => i.kind === "extraction").length,
    offTemplate: live.filter((i) => i.kind === "off_template").length,
    proposals: live.filter((i) => i.kind === "category_proposal").length,
  };

  if (loading) return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Loading review queue…</div>;

  if (live.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "80px 20px" }}>
        <div style={{ width: 66, height: 66, borderRadius: 20, background: "#EAF4EC", border: "1px solid #CBE4D2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 28 }}>✓</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.03em", margin: "0 0 8px" }}>All caught up</h2>
        <p style={{ fontSize: 15, color: "#57534A", maxWidth: "44ch", margin: 0, lineHeight: 1.55 }}>
          Every merge, conflict, and new fact we inferred has been reviewed. Tables update automatically from the facts you accept.
          {done.accepted + done.rejected > 0 && <span className="dm-mono" style={{ display: "block", marginTop: 10, fontSize: 11.5, color: "#A39B8B" }}>this session: {done.accepted} merged · {done.rejected} dismissed</span>}
        </p>
      </div>
    );
  }

  return (
    // Full-bleed (user call 2026-07-20): the queue was capped at 880px, which
    // squeezed the per-row graph preview until the Explorer scene cropped —
    // the expanded evidence + graph want every pixel the main column gives.
    <div>

      <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
        {/* PR header */}
        <div style={{ padding: "15px 18px", borderBottom: "1px solid #EFE9DC" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
            <span className="dm-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600, letterSpacing: ".04em", color: C.green, background: "#E4F0E8", padding: "3px 9px", borderRadius: 999 }}>
              <GitGlyph /> OPEN
            </span>
            <span className="dm-display" style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em", color: C.ink }}>New facts from your inbox</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#8A8477" }}>{live.length} change{live.length === 1 ? "" : "s"} · ranked by impact</span>
          </div>
          <div className="dm-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#8A8477", flexWrap: "wrap" }}>
            <span style={{ background: "#FBF8F1", border: "1px solid #E1D9C8", borderRadius: 6, padding: "2px 8px" }}>graph:main</span>
            <span>←</span>
            <span style={{ background: "#FBF8F1", border: "1px solid #E1D9C8", borderRadius: 6, padding: "2px 8px" }}>inbox/new-facts</span>
            {counts.extraction > 0 && <span style={{ marginLeft: 4, color: C.green }}>+{counts.extraction}</span>}
            {counts.conflict > 0 && <span style={{ color: C.accent }}>~{counts.conflict}</span>}
            {counts.merge > 0 && <span style={{ color: C.gold }}>⇄{counts.merge}</span>}
            {counts.offTemplate > 0 && <span style={{ color: C.blue }}>±{counts.offTemplate}</span>}
            {counts.proposals > 0 && <span style={{ color: C.accent }}>▣{counts.proposals}</span>}
          </div>
        </div>

        {/* grouped diff rows */}
        {groups.map((g) => (
          <div key={g.kind}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "9px 18px 7px", background: "#FCFAF4" }}>
              <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>▦</span>
              <span className="dm-mono" style={{ fontSize: 11.5, fontWeight: 600, color: C.ink }}>{GROUP_META[g.kind].title}</span>
              <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>{g.items.length} · {GROUP_META[g.kind].hint}</span>
            </div>
            {g.items.map((it) => (
              <DiffRow
                key={it.id}
                it={it}
                expanded={expanded === it.id}
                onToggle={() => setExpanded((e) => (e === it.id ? null : it.id))}
                onResolve={resolve}
              />
            ))}
          </div>
        ))}

        {/* merge bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "#FBF8F1", borderTop: "1px solid #EFE9DC" }}>
          <span className="dm-mono" style={{ fontSize: 10.5, color: "#8A8477", flex: 1 }}>
            {done.accepted} approved · {done.rejected} rejected · <b style={{ color: C.ink, fontWeight: 600 }}>{live.length} open</b>
            <span style={{ marginLeft: 8, color: "#B7AF9F" }}>each ✓ commits straight to your graph — expand a row for the evidence</span>
          </span>
          <Hov
            onClick={() => live.forEach((it, i) => setTimeout(() => resolve(it.id, "accept"), i * 90))}
            base={{ border: "none", background: C.green, color: "#fff", borderRadius: 8, padding: "8px 14px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}
            hover={{ background: "#357C4C" }}
          >
            <GitGlyph light /> Approve all &amp; merge
          </Hov>
        </div>
      </div>
    </div>
  );
}
