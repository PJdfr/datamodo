"use client";

/**
 * CATEGORIES manager — the user's ontology. Each category (kind) carries a
 * template: the fields the agent fills when something falls into it, and the
 * relationship verbs connecting it to other things. Extraction classifies
 * against these and canonicalizes predicate names — this is how the graph
 * stays navigable instead of accumulating LLM-invented vocabulary.
 *
 * UX principle: the USER never writes schema. They name the category (plus an
 * optional sentence), the agent drafts the template, and they prune chips.
 * Keys, aliases and types live behind the scenes (AI-drafted) or under
 * "Advanced". Templates steer extraction, they never block.
 */

import { useEffect, useState } from "react";
import { C, ModalShell, monoLabel, primaryBtn, ghostBtn, Hov } from "./ui";
import type { KindDef, KindField, KindRelation } from "@/lib/datamodo/ontology";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const TYPE_GLYPH: Record<string, string> = { text: "Aa", number: "#", date: "📅", entity: "→" };

const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid #DDD5C5", borderRadius: 9, padding: "9px 11px", fontFamily: "inherit", fontSize: 13, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" };
const miniInput: React.CSSProperties = { ...inputStyle, padding: "6px 9px", fontSize: 12, width: "auto", flex: 1, minWidth: 90 };

interface Draft {
  id?: string;
  label: string;
  icon: string;
  plural?: string;
  description: string;
  aliases: string[];
  fields: KindField[];
  relations: KindRelation[];
  builtin: boolean;
}

const toDraft = (k: KindDef): Draft => ({
  id: k.id, label: k.label, icon: k.icon ?? "", plural: k.plural, description: k.description ?? "",
  aliases: [...k.aliases], fields: k.fields.map((f) => ({ ...f })), relations: k.relations.map((r) => ({ ...r })), builtin: k.builtin,
});

/** One template chip — a field or relation the agent will fill. */
function Chip({ glyph, label, hint, required, onRemove }: { glyph: string; label: string; hint?: string; required?: boolean; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 999, padding: "5px 6px 5px 11px", fontSize: 12.5, color: C.ink }}>
      <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>{glyph}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>
      {required && <span title="Required" style={{ color: C.accent, fontSize: 11, lineHeight: 1 }}>●</span>}
      {hint && <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>{hint}</span>}
      <button type="button" onClick={onRemove} title="Remove" style={{ width: 17, height: 17, borderRadius: "50%", border: "none", background: "#F3EFE6", color: "#8A8477", cursor: "pointer", fontSize: 10, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </span>
  );
}

export function CategoriesModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [newField, setNewField] = useState<{ label: string; type: KindField["type"] }>({ label: "", type: "text" });
  const [newRel, setNewRel] = useState<{ label: string; target: string }>({ label: "", target: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/kinds");
        const json = await res.json();
        if (alive) setKinds(json.kinds ?? []);
      } catch { /* leave empty */ } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const reload = async () => {
    const res = await fetch("/api/kinds").catch(() => null);
    if (res?.ok) setKinds((await res.json()).kinds ?? []);
  };

  const openEditor = (d: Draft) => { setDraft(d); setAdvanced(false); setNotice(null); setError(null); };

  /** The agent drafts the template from the name + optional sentence. */
  const suggest = async () => {
    if (!draft?.label.trim()) { setError("Name the category first."); return; }
    setDrafting(true); setError(null);
    try {
      const res = await fetch("/api/kinds/suggest", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: draft.label, hint: draft.description || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Drafting failed — add fields by hand."); return; }
      const t = json.template ?? {};
      setDraft({
        ...draft,
        icon: draft.icon || t.icon || "",
        plural: draft.plural || t.plural,
        description: draft.description || t.description || "",
        aliases: draft.aliases.length ? draft.aliases : t.aliases ?? [],
        fields: t.fields ?? draft.fields,
        relations: t.relations ?? draft.relations,
      });
      setNotice("Drafted — remove what you don't need, then save.");
    } catch {
      setError("Drafting failed — add fields by hand.");
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    if (!draft || !draft.label.trim()) { setError("Give the category a name."); return; }
    setSaving(true); setError(null);
    const body = {
      label: draft.label, icon: draft.icon || undefined, plural: draft.plural, description: draft.description || undefined,
      aliases: draft.aliases, fields: draft.fields, relations: draft.relations,
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
    } finally { setSaving(false); }
  };

  /** Template → table, one click: columns mirror the fields + verbs. */
  const buildTable = async () => {
    if (!draft?.id) return;
    setBuilding(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/kinds/${draft.id}/table`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not build the table."); return; }
      setNotice(`Table “${json.name}” — ${json.added} added, ${json.updated} updated, ${json.unchanged} unchanged.`);
      onChanged?.();
    } catch {
      setError("Could not build the table.");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <ModalShell
      title={draft ? (draft.id ? `${draft.icon || "▣"} ${draft.label}` : "New category") : "Categories"}
      subtitle={draft ? "Name it — the agent drafts what to capture" : "What your agents sort the world into"}
      onClose={onClose}
      maxWidth={620}
      footer={
        draft ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
            {draft.id && (
              <Hov onClick={remove} tag="button" base={{ background: "none", border: "none", color: "#A05A4A", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }} hover={{ color: "#7A3A2C" }}>
                Delete
              </Hov>
            )}
            {draft.id && (
              <button type="button" onClick={buildTable} disabled={building} style={{ ...ghostBtn, opacity: building ? 0.6 : 1 }}>
                {building ? "Building…" : "▦ Build table"}
              </button>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setDraft(null)} style={ghostBtn}>Back</button>
              <button type="button" onClick={save} disabled={saving} style={primaryBtn(saving)}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
            <button type="button" onClick={() => openEditor({ label: "", icon: "", description: "", aliases: [], fields: [], relations: [], builtin: false })} style={primaryBtn(false)}>+ New category</button>
          </div>
        )
      }
    >
      {loading ? (
        <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "26px 4px" }}>Loading categories…</div>
      ) : draft ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Name + one sentence → the agent does the rest. */}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="📦" maxLength={4} style={{ ...inputStyle, width: 52, textAlign: "center", flexShrink: 0 }} />
            <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="What kind of thing? e.g. Candidate" autoFocus={!draft.id} style={{ ...inputStyle, fontSize: 14.5, fontWeight: 600 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="One sentence: what belongs here? (optional)" style={inputStyle} />
            <button type="button" onClick={suggest} disabled={drafting} style={{ ...primaryBtn(drafting), padding: "0 16px", fontSize: 13, whiteSpace: "nowrap", boxShadow: "none" }}>
              {drafting ? "Drafting…" : "✦ Draft it"}
            </button>
          </div>
          {notice && <div style={{ fontSize: 12.5, color: "#3E6B44", background: "#EDF5EC", border: "1px solid #D5E6D3", borderRadius: 9, padding: "8px 11px" }}>{notice}</div>}
          {error && <div style={{ fontSize: 12.5, color: "#A05A4A", background: "#FBEDE9", border: "1px solid #F0D5CC", borderRadius: 9, padding: "8px 11px" }}>{error}</div>}

          {/* The template, as prunable chips. */}
          <div>
            <div className="dm-mono" style={{ ...monoLabel, marginBottom: 8 }}>The agent captures</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {draft.fields.map((f, i) => (
                <Chip key={i} glyph={TYPE_GLYPH[f.type] ?? "Aa"} label={f.label} hint={f.unit} required={f.required} onRemove={() => setDraft({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })} />
              ))}
              {draft.fields.length === 0 && <span style={{ fontSize: 12.5, color: "#A39B8B" }}>Nothing yet — “✦ Draft it” or add below.</span>}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
              <input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="Add a field, e.g. Salary" style={miniInput}
                onKeyDown={(e) => { if (e.key === "Enter" && newField.label.trim()) { setDraft({ ...draft, fields: [...draft.fields, { key: slugify(newField.label), label: newField.label.trim(), type: newField.type }] }); setNewField({ label: "", type: "text" }); } }} />
              <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value as KindField["type"] })} style={{ ...miniInput, flex: "0 0 auto", minWidth: 0 }}>
                <option value="text">text</option><option value="number">number</option><option value="date">date</option>
              </select>
              <button type="button" style={{ ...ghostBtn, flexShrink: 0 }} onClick={() => { if (!newField.label.trim()) return; setDraft({ ...draft, fields: [...draft.fields, { key: slugify(newField.label), label: newField.label.trim(), type: newField.type }] }); setNewField({ label: "", type: "text" }); }}>+</button>
            </div>
          </div>

          <div>
            <div className="dm-mono" style={{ ...monoLabel, marginBottom: 8 }}>Linked to</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {draft.relations.map((r, i) => (
                <Chip key={i} glyph="⇢" label={r.label} hint={r.targetKind ? `→ ${r.targetKind}` : undefined} onRemove={() => setDraft({ ...draft, relations: draft.relations.filter((_, j) => j !== i) })} />
              ))}
              {draft.relations.length === 0 && <span style={{ fontSize: 12.5, color: "#A39B8B" }}>No links yet.</span>}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
              <input value={newRel.label} onChange={(e) => setNewRel({ ...newRel, label: e.target.value })} placeholder="Add a link, e.g. applied to" style={miniInput}
                onKeyDown={(e) => { if (e.key === "Enter" && newRel.label.trim()) { setDraft({ ...draft, relations: [...draft.relations, { predicate: slugify(newRel.label), label: newRel.label.trim(), targetKind: newRel.target.trim() ? slugify(newRel.target) : undefined }] }); setNewRel({ label: "", target: "" }); } }} />
              <input value={newRel.target} onChange={(e) => setNewRel({ ...newRel, target: e.target.value })} placeholder="→ company (optional)" style={{ ...miniInput, flex: "0 0 150px" }} />
              <button type="button" style={{ ...ghostBtn, flexShrink: 0 }} onClick={() => { if (!newRel.label.trim()) return; setDraft({ ...draft, relations: [...draft.relations, { predicate: slugify(newRel.label), label: newRel.label.trim(), targetKind: newRel.target.trim() ? slugify(newRel.target) : undefined }] }); setNewRel({ label: "", target: "" }); }}>+</button>
            </div>
          </div>

          {/* Everything schema-ish hides here. */}
          <div>
            <button type="button" onClick={() => setAdvanced(!advanced)} className="dm-mono" style={{ background: "none", border: "none", padding: 0, fontSize: 10.5, color: "#A39B8B", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {advanced ? "▾" : "▸"} Advanced
            </button>
            {advanced && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div className="dm-mono" style={{ ...monoLabel, marginBottom: 5 }}>Also known as (comma-separated)</div>
                  <input value={draft.aliases.join(", ")} onChange={(e) => setDraft({ ...draft, aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="org, organization" style={inputStyle} />
                </div>
                <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", lineHeight: 1.6 }}>
                  keys: {draft.fields.map((f) => f.key).join(" · ") || "—"}<br />
                  verbs: {draft.relations.map((r) => r.predicate).join(" · ") || "—"}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {kinds.map((k) => (
            <Hov
              key={k.id}
              onClick={() => openEditor(toDraft(k))}
              className="dm-card-tap"
              base={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, padding: "11px 14px", cursor: "pointer", fontFamily: "inherit" }}
              hover={{ border: "1px solid #F3D6CB", background: "#FDF9F2" }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 10, background: k.color ?? "#EDE7DA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{k.icon ?? "▣"}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{k.label}</span>
                  {k.builtin && <span className="dm-mono" style={{ fontSize: 9, color: "#8A8477", background: "#F3EFE6", borderRadius: 4, padding: "1px 5px" }}>builtin</span>}
                </div>
                <div style={{ fontSize: 12, color: "#8A8477", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {k.fields.map((f) => f.label).slice(0, 4).join(" · ")}{k.fields.length > 4 ? " · …" : ""}
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
