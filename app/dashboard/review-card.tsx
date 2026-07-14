"use client";

/**
 * REVIEW CARD CORE — one rendering of a review's EVIDENCE (the diff, the
 * sides, the facts, the drafted template) shared by every surface that asks
 * for a decision (ROADMAP "Chat review bubbles: full PR fidelity",
 * 2026-07-14). Two skins over the same body: PAPER (Review Studio — white
 * cards on cream) and INK (the chat's datamodo bubble — the design keeper:
 * warm ink, ONE coral accent). Surfaces keep their own chrome (headers,
 * impact meters, action labels); this module owns what the user is actually
 * judging, so the chat bubble and the Studio can never drift apart.
 */

import { Fragment } from "react";
import { C } from "./ui";
import type { ReviewItem, ReviewEntitySide, ReviewFact } from "@/lib/datamodo/review-types";

export interface ReviewSkin {
  /** Primary / secondary / faint text. */
  text: string;
  sub: string;
  faint: string;
  /** Card surface + a sunken nested surface. */
  surface: string;
  surfaceAlt: string;
  border: string;
  /** Status tones, tuned per background (green on cream ≠ green on ink). */
  accent: string;
  good: string;
  gold: string;
  blue: string;
  /** The conflict diff's "old value" tone. */
  strike: string;
}

/** Review Studio: white cards on the cream page. */
export const PAPER_SKIN: ReviewSkin = {
  text: C.ink, sub: "#57534A", faint: "#A39B8B",
  surface: "#fff", surfaceAlt: "#FCFAF4", border: "#ECE5D8",
  accent: C.accent, good: C.green, gold: C.gold, blue: C.blue, strike: "#B44536",
};

/** The chat's ink bubble (datamodo speaking) — tones lifted for contrast. */
export const INK_SKIN: ReviewSkin = {
  text: "#F1ECE1", sub: "#C9C2B4", faint: "#9C958A",
  surface: "#2B2720", surfaceAlt: "#262219", border: "#3A352C",
  accent: C.accent, good: "#7FC79A", gold: "#D9B45C", blue: "#9FB2CE", strike: "#E58B7B",
};

const confColor = (s: ReviewSkin, c: number) => (c >= 0.85 ? s.good : c >= 0.65 ? s.gold : s.accent);

const kicker = (s: ReviewSkin): React.CSSProperties => ({
  fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: s.faint,
});

/* One "s —p→ v" evidence line — the graph's atom, everywhere the same. */
function FactLine({ f, skin, dot }: { f: ReviewFact; skin: ReviewSkin; dot?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minWidth: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot ?? confColor(skin, f.c), flexShrink: 0 }} />
      <span style={{ color: skin.faint, flexShrink: 0 }}>{f.s}</span>
      <span className="dm-mono" style={{ fontSize: 10.5, color: skin.faint, flexShrink: 0 }}>{f.p.replace(/_/g, " ")}</span>
      <span style={{ color: f.ref ? skin.accent : skin.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.ref ? `→ ${f.v}` : f.v}</span>
    </div>
  );
}

/* One side of a merge — identity card with its attributes. */
function SideCard({ side, tone, tag, skin }: { side: ReviewEntitySide; tone: string; tag: string; skin: ReviewSkin }) {
  return (
    <div style={{ flex: 1, minWidth: 170, background: skin.surface, border: `1px solid ${skin.border}`, borderRadius: 12, padding: "11px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: side.attrs.length ? 8 : 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{side.label.charAt(0)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", color: skin.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{side.label}</div>
          <div className="dm-mono" style={kicker(skin)}>{tag} · {side.type}</div>
        </div>
      </div>
      {side.attrs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12 }}>
          {side.attrs.map((a) => (
            <Fragment key={a.k}>
              <span className="dm-mono" style={{ fontSize: 10, color: skin.faint, whiteSpace: "nowrap" }}>{a.k}</span>
              <span style={{ color: skin.sub, overflow: "hidden", textOverflow: "ellipsis" }}>{a.v}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The evidence body for any review kind. Headers, impact meters, and the
 * accept/decline buttons stay with the surface — this is what they judge.
 */
export function ReviewCardBody({ item, skin }: { item: ReviewItem; skin: ReviewSkin }) {
  if (item.kind === "entity_merge") {
    const tone = confColor(skin, item.confidence ?? 0);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "stretch", gap: 9, flexWrap: "wrap" }}>
          <SideCard side={item.parsed} tone={skin.blue} tag="just parsed" skin={skin} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, minWidth: 44 }}>
            <span className="dm-mono" style={{ fontSize: 12, fontWeight: 700, color: tone }}>{Math.round((item.confidence ?? 0) * 100)}%</span>
            <span style={{ color: tone, fontSize: 15, lineHeight: 1 }}>⇄</span>
            <span className="dm-mono" style={{ fontSize: 9, color: skin.faint }}>match</span>
          </div>
          <SideCard side={item.canonical} tone={skin.accent} tag="in your data" skin={skin} />
        </div>
        <div style={{ fontSize: 12, color: skin.sub, lineHeight: 1.5, marginTop: 8, display: "flex", gap: 7 }}>
          <span style={{ color: tone, flexShrink: 0 }}>❝</span><span>{item.reason}</span>
        </div>
      </div>
    );
  }

  if (item.kind === "fact_conflict") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div className="dm-mono" style={{ ...kicker(skin), marginBottom: 3 }}>current · {item.wasSource}</div>
            <div style={{ fontSize: 13.5, color: skin.strike, textDecoration: "line-through" }}>{item.was}</div>
          </div>
          <span style={{ color: skin.faint, fontSize: 15 }}>→</span>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div className="dm-mono" style={{ ...kicker(skin), color: skin.good, marginBottom: 3 }}>new · {item.nowSource}</div>
            <div style={{ fontSize: 13.5, color: skin.text, fontWeight: 700 }}>{item.now}</div>
          </div>
        </div>
        {item.note && <div style={{ fontSize: 11.5, color: skin.faint, marginTop: 7, fontStyle: "italic" }}>{item.note}</div>}
      </div>
    );
  }

  if (item.kind === "extraction") {
    return (
      <div>
        <div style={{ fontSize: 12.5, color: skin.sub, lineHeight: 1.55, background: skin.surfaceAlt, border: `1px solid ${skin.border}`, borderRadius: "4px 12px 12px 12px", padding: "9px 12px" }}>{item.snippet}</div>
        <div className="dm-mono" style={{ ...kicker(skin), margin: "9px 0 6px" }}>understood {item.facts.length} fact{item.facts.length === 1 ? "" : "s"} · from {item.from}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {item.facts.map((f, i) => <FactLine key={i} f={f} skin={skin} />)}
        </div>
      </div>
    );
  }

  if (item.kind === "off_template") {
    return (
      <div>
        <div style={{ fontSize: 12, color: skin.sub, lineHeight: 1.5, marginBottom: 8 }}>
          <span className="dm-mono" style={{ fontSize: 11, color: skin.faint }}>▤ {item.docLabel}</span> said things {item.docKind ? <>the <b style={{ fontWeight: 600, color: skin.text }}>{item.docKind}</b> template</> : "its category template"} doesn&apos;t cover:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {item.facts.map((f, i) => <FactLine key={i} f={f} skin={skin} dot={skin.blue} />)}
        </div>
      </div>
    );
  }

  // category_proposal
  return (
    <div>
      <div style={{ fontSize: 12, color: skin.sub, lineHeight: 1.5, marginBottom: item.sampleLabels.length ? 8 : 0 }}>
        {item.count} <b style={{ fontWeight: 600, color: skin.text }}>{item.label.toLowerCase()}{item.count === 1 ? "" : "s"}</b> captured and no category covers them{item.description ? <> — {item.description.replace(/\.$/, "").toLowerCase()}</> : ""}.
      </div>
      {item.sampleLabels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: item.fields.length + item.relations.length ? 9 : 0 }}>
          {item.sampleLabels.map((l) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: skin.sub, background: skin.surfaceAlt, border: `1px solid ${skin.border}`, borderRadius: 999, padding: "2px 8px" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: skin.accent }} />{l}
            </span>
          ))}
        </div>
      )}
      {(item.fields.length > 0 || item.relations.length > 0) && (
        <div style={{ background: skin.surfaceAlt, border: `1px solid ${skin.border}`, borderRadius: 10, padding: "2px 0 6px", overflow: "hidden" }}>
          <div className="dm-mono" style={{ ...kicker(skin), padding: "6px 11px 3px" }}>drafted template — edit anytime in categories</div>
          {item.fields.map((f) => (
            <div key={f.key} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 11px" }}>
              <span className="dm-mono" style={{ fontSize: 11, color: skin.sub }}>{f.key}</span>
              <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: skin.faint }}>{f.type}</span>
            </div>
          ))}
          {item.relations.map((r) => (
            <div key={r.predicate} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 11px" }}>
              <span className="dm-mono" style={{ fontSize: 11, color: skin.accent }}>{r.predicate}</span>
              <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: skin.faint }}>→ {r.targetKind ?? "any"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
