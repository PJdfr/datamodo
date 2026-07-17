"use client";

/**
 * OBSIDIAN VAULT IMPORT modal (phase 1b) — "give access to the folder":
 * a directory picker reads the vault's .md files IN THE BROWSER (nothing
 * unparsed is uploaded; big vaults dodge body limits), shows the dry-run
 * plan (notes/links/tags + folder shapes), then confirms in batches through
 * POST /api/import/obsidian. Re-running is safe: unchanged notes no-op.
 */

import { useRef, useState } from "react";
import { C } from "./ui";

interface Stats { notes: number; links: number; tags: number; propFacts: number; folders: number }
interface Shape { folder: string; notes: number; sharedKeys: string[] }
interface Result { created: number; updated: number; unchanged: number; entitiesCreated: number; factsNew: number }

const BATCH = 100;

async function post(files: { path: string; content: string }[], confirm: boolean) {
  const res = await fetch("/api/import/obsidian", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files, confirm }),
  });
  if (!res.ok) throw new Error(`import failed (${res.status})`);
  return res.json();
}

export function ObsidianImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("Reading the vault…");
    setError(null);
    try {
      const md = [...list].filter((f) => /\.md$/i.test(f.name));
      const read = await Promise.all(
        md.map(async (f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, content: await f.text() })),
      );
      setFiles(read);
      // Dry-run on the first batch is enough for a preview of shape; totals
      // come from the client-side counts (the server re-plans on confirm).
      const dry = await post(read.slice(0, BATCH), false);
      setStats({ ...dry.stats, notes: read.length });
      setShapes(dry.folderShapes ?? []);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    setError(null);
    const totals: Result = { created: 0, updated: 0, unchanged: 0, entitiesCreated: 0, factsNew: 0 };
    try {
      for (let i = 0; i < files.length; i += BATCH) {
        setBusy(`Importing ${Math.min(i + BATCH, files.length)} / ${files.length} notes…`);
        const r = (await post(files.slice(i, i + BATCH), true)).result as Result;
        for (const k of Object.keys(totals) as (keyof Result)[]) totals[k] += r[k] ?? 0;
      }
      setResult(totals);
      onDone();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const mono = { fontSize: 11, color: "#8A8477" } as const;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(33,30,24,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", background: "#F6F2E9", border: "1px solid #E1D9C8", borderRadius: 18, boxShadow: "0 24px 60px rgba(33,30,24,0.25)", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <span style={{ color: C.accent }}>⇪</span>
          <span className="dm-display" style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em", color: C.ink }}>Import an Obsidian vault</span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#8A8477", fontSize: 15, fontFamily: "inherit" }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: "#57534A", lineHeight: 1.5, margin: "0 0 12px" }}>
          Pick your vault folder. Notes become pages, wikilinks become edges, properties become facts — parsed on your machine, imported without a single AI call. Re-importing later only touches what changed.
        </p>
        {/* webkitdirectory needs the attribute set imperatively for TS. */}
        <input ref={(el) => { if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); } inputRef.current = el; }}
          type="file" multiple style={{ display: "none" }} onChange={(e) => void pick(e.target.files)} />
        {!stats && (
          <button onClick={() => inputRef.current?.click()} disabled={!!busy}
            style={{ fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", background: C.ink, color: "#F6F2E9", border: "none", borderRadius: 10, padding: "9px 16px" }}>
            {busy ?? "Choose vault folder…"}
          </button>
        )}
        {stats && !result && (
          <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <div className="dm-mono" style={{ fontSize: 12.5, color: C.ink }}>
              {stats.notes} notes · {stats.links}+ links · {stats.tags}+ tags · {stats.propFacts}+ properties
            </div>
            {shapes.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="dm-mono" style={{ ...mono, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>folders that look like categories</div>
                {shapes.map((s) => (
                  <div key={s.folder} className="dm-mono" style={{ fontSize: 11.5, color: "#57534A" }}>▣ {s.folder} — {s.notes} notes · {s.sharedKeys.join(", ")}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {stats && !result && (
          <button onClick={() => void confirm()} disabled={!!busy}
            style={{ fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px" }}>
            {busy ?? `Import ${stats.notes} notes`}
          </button>
        )}
        {result && (
          <div className="dm-mono" style={{ fontSize: 12.5, color: C.ink }}>
            ✓ Done — {result.created} new · {result.updated} updated · {result.unchanged} unchanged · {result.factsNew} facts
          </div>
        )}
        {error && <div className="dm-mono" style={{ fontSize: 11.5, color: "#C7362C", marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
