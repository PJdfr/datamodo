"use client";

/**
 * CATEGORIES manager — the user's ontology. Each category (kind) carries a
 * template: the fields the agent should fill when something falls into it,
 * and the relationship verbs that connect it to other things. The agent
 * classifies extractions into these categories and canonicalizes predicate
 * names against them — this is how the graph stays navigable instead of
 * accumulating LLM-invented vocabulary. Builtins are editable; templates
 * steer extraction, they never block off-template facts.
 */

import { useEffect, useState } from "react";
import { C, ModalShell, monoLabel, primaryBtn, ghostBtn, Hov } from "./ui";
import type { KindDef, KindField, KindRelation } from "@/lib/datamodo/ontology";

const FIELD_TYPES = ["text", "number", "date", "entity"] as const;

const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid #DDD5C5", borderRadius: 9, padding: "9px 11px", fontFamily: "inherit", fontSize: 13, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" };
const smallInput: React.CSSProperties = { ...inputStyle, padding: "6px 8px", fontSize: 12 };

interface Draft {
  id?: string;
  label: string;
  icon: string;
  description: string;
  aliases: string; // comma-separated in the editor
  fields: KindField[];
  relations: KindRelation[];
  builtin: boolean;
}

const toDraft = (k: KindDef): Draft => ({
  id: k.id,
  label: k.label,
  icon: k.icon ?? "",
  description: k.description ?? "",
  aliases: k.aliases.join(", "),
  fields: k.fields.map((f) => ({ ...f })),
  relations: k.relations.map((r) => ({ ...r })),
  builtin: k.builtin,
});

const EMPTY: Draft = { label: "", icon: "", description: "", aliases: "", fields: [], relations: [], builtin: false };

export function CategoriesModal({ onClose }: { onClose: () => void }) {
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const res = await fetch("/api/kinds");
      const json = await res.json();
      setKinds(json.kinds ?? []);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/kinds");
        const json = await res.json();
        if (alive) setKinds(json.kinds ?? []);
      } catch {
        /* leave empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    if (!draft || !draft.label.trim()) { setError("Give the category a name."); return; }
    setSaving(true);
    setError(null);
    const body = {
      label: draft.label,
      icon: draft.icon || undefined,
      description: draft.description || undefined,
      aliases: draft.aliases.split(",").map((s) => s.trim()).filter(Boolean),
      fields: draft.fields.filter((f) => f.key && f.label),
      relations: draft.relations.filter((r) => r.predicate && r.label),
    };
    try {
      const res = await fetch(draft.id ? `/api/kinds/${draft.id}` : "/api/kinds", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Save failed."); return; }
      setDraft(null);
      await reload();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    setSaving(true);
    try {
      await fetch(`/api/kinds/${draft.id}`, { method: "DELETE" });
      setDraft(null);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={draft ? (draft.id ? `Edit “${draft.label}”` : "New category") : "Categories"}
      subtitle={draft ? "The agent fills this template when something fits" : "What your agents sort the world into — templates steer extraction"}
      onClose={onClose}
      maxWidth={640}
      footer={
        draft ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
            {draft.id && (
              <Hov onClick={remove} tag="button" base={{ background: "none", border: "none", color: "#A05A4A", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }} hover={{ color: "#7A3A2C" }}>
                Delete category
              </Hov>
            )}
            {error && <span style={{ fontSize: 12, color: "#A05A4A" }}>{error}</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <button type="button" onClick={() => { setDraft(null); setError(null); }} style={ghostBtn}>Back</button>
              <button type="button" onClick={save} disabled={saving} style={primaryBtn(saving)}>{saving ? "Saving…" : "Save category"}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
            <button type="button" onClick={() => setDraft({ ...EMPTY })} style={primaryBtn(false)}>+ New category</button>
          </div>
        )
      }
    >
      {loading ? (
        <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "26px 4px" }}>Loading categories…</div>
      ) : draft ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 10 }}>
            <div>
              <div className="dm-mono" style={{ ...monoLabel, marginBottom: 6 }}>Icon</div>
              <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="📦" maxLength={4} style={{ ...inputStyle, textAlign: "center" }} />
            </div>
            <div>
              <div className="dm-mono" style={{ ...monoLabel, marginBottom: 6 }}>Name</div>
              <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Property, Candidate, Shipment…" style={inputStyle} />
            </div>
          </div>
          <div>
            <div className="dm-mono" style={{ ...monoLabel, marginBottom: 6 }}>What belongs here? <span style={{ textTransform: "none", letterSpacing: 0 }}>(steers the agent)</span></div>
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="A short sentence describing this category…" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div>
            <div className="dm-mono" style={{ ...monoLabel, marginBottom: 6 }}>Also known as <span style={{ textTransform: "none", letterSpacing: 0 }}>(names the agent might use, comma-separated)</span></div>
            <input value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} placeholder="org, organization, vendor" style={inputStyle} />
          </div>

          <div>
            <div className="dm-mono" style={{ ...monoLabel, marginBottom: 8 }}>Fields — what the agent should capture</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {draft.fields.map((f, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 92px 24px 24px", gap: 6, alignItems: "center" }}>
                  <input value={f.key} onChange={(e) => setDraft({ ...draft, fields: draft.fields.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} placeholder="amount" className="dm-mono" style={smallInput} />
                  <input value={f.label} onChange={(e) => setDraft({ ...draft, fields: draft.fields.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} placeholder="Amount" style={smallInput} />
                  <select value={f.type} onChange={(e) => setDraft({ ...draft, fields: draft.fields.map((x, j) => j === i ? { ...x, type: e.target.value as KindField["type"] } : x) })} style={{ ...smallInput, padding: "6px 4px" }}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="checkbox" title="Required" checked={!!f.required} onChange={(e) => setDraft({ ...draft, fields: draft.fields.map((x, j) => j === i ? { ...x, required: e.target.checked } : x) })} />
                  <button type="button" title="Remove field" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setDraft({ ...draft, fields: [...draft.fields, { key: "", label: "", type: "text" }] })} style={{ ...ghostBtn, alignSelf: "flex-start" }}>+ Field</button>
            </div>
          </div>

          <div>
            <div className="dm-mono" style={{ ...monoLabel, marginBottom: 8 }}>Relationships — verbs linking to other things</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {draft.relations.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 24px", gap: 6, alignItems: "center" }}>
                  <input value={r.predicate} onChange={(e) => setDraft({ ...draft, relations: draft.relations.map((x, j) => j === i ? { ...x, predicate: e.target.value } : x) })} placeholder="issued_by" className="dm-mono" style={smallInput} />
                  <input value={r.label} onChange={(e) => setDraft({ ...draft, relations: draft.relations.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} placeholder="issued by" style={smallInput} />
                  <input value={r.targetKind ?? ""} onChange={(e) => setDraft({ ...draft, relations: draft.relations.map((x, j) => j === i ? { ...x, targetKind: e.target.value || undefined } : x) })} placeholder="→ company (optional)" className="dm-mono" style={smallInput} />
                  <button type="button" title="Remove relation" onClick={() => setDraft({ ...draft, relations: draft.relations.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setDraft({ ...draft, relations: [...draft.relations, { predicate: "", label: "" }] })} style={{ ...ghostBtn, alignSelf: "flex-start" }}>+ Relationship</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {kinds.map((k) => (
            <Hov
              key={k.id}
              onClick={() => setDraft(toDraft(k))}
              className="dm-card-tap"
              base={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, padding: "11px 14px", cursor: "pointer", fontFamily: "inherit" }}
              hover={{ border: "1px solid #F3D6CB", background: "#FDF9F2" }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 10, background: k.color ?? "#EDE7DA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{k.icon ?? "▣"}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{k.label}</span>
                  <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>{k.kind}</span>
                  {k.builtin && <span className="dm-mono" style={{ fontSize: 9, color: "#8A8477", background: "#F3EFE6", borderRadius: 4, padding: "1px 5px" }}>builtin</span>}
                </div>
                <div style={{ fontSize: 12, color: "#8A8477", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {k.fields.length} field{k.fields.length === 1 ? "" : "s"} · {k.relations.length} relation{k.relations.length === 1 ? "" : "s"}{k.description ? ` · ${k.description}` : ""}
                </div>
              </div>
              <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", flexShrink: 0 }}>edit →</span>
            </Hov>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
