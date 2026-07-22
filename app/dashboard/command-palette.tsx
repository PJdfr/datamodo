"use client";

/**
 * ⌘K command palette — the app's one keyboard front door. Navigate views,
 * open tables, run the rare build/import actions that used to crowd the
 * chrome. Frosted sheet per the premium brief; plain substring matching
 * (labels + keywords) — no fuzzy library, no dependency.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type Command = {
  id: string;
  /** Section header the command is grouped under ("Go to", "Tables", "Actions"). */
  section: string;
  label: string;
  /** Quiet right-side annotation (a count, "table", a shortcut). */
  hint?: string;
  /** Extra text the filter matches against, never shown. */
  keywords?: string;
  run: () => void;
};

/** Mounted only while open (the parent conditionally renders it), so state
 *  starts fresh on every summon — no reset effects needed. */
export function CommandPalette({ onClose, commands }: { onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) => `${c.label} ${c.section} ${c.keywords ?? ""}`.toLowerCase().includes(needle));
  }, [q, commands]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    listRef.current?.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" });
  }, [sel, filtered]);

  const runSel = (cmd?: Command) => {
    const c = cmd ?? filtered[sel];
    if (!c) return;
    onClose();
    c.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); runSel(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  // Group while preserving the incoming order of sections.
  const sections: { name: string; items: { cmd: Command; index: number }[] }[] = [];
  filtered.forEach((cmd, index) => {
    const last = sections[sections.length - 1];
    if (last && last.name === cmd.section) last.items.push({ cmd, index });
    else sections.push({ name: cmd.section, items: [{ cmd, index }] });
  });

  return (
    <div className="cc-cmdk-scrim dm-fade-in" onClick={onClose}>
      <div className="cc-cmdk dm-modal-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cc-cmdk-input"
          placeholder="Jump to a view, open a table, run an action…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={onKey}
          spellCheck={false}
        />
        <div ref={listRef} className="cc-cmdk-list cc-scroll">
          {sections.length === 0 && (
            <div style={{ padding: "18px 12px", fontSize: 13, color: "#8a8477" }}>
              Nothing matches “{q}”.
            </div>
          )}
          {sections.map((s) => (
            <div key={s.name}>
              <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a39b8b", padding: "8px 10px 4px" }}>{s.name}</div>
              {s.items.map(({ cmd, index }) => (
                <button
                  key={cmd.id}
                  type="button"
                  className={`cc-cmdk-item${index === sel ? " is-sel" : ""}`}
                  onMouseEnter={() => setSel(index)}
                  onClick={() => runSel(cmd)}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmd.label}</span>
                  {cmd.hint && <span className="hint dm-mono">{cmd.hint}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
