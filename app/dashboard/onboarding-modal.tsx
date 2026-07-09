"use client";

/**
 * ONBOARDING / business-context capture. A sentence about the user's work plus a
 * few "what to pull out" chips get saved to user_settings and injected into the
 * extraction prompt (see getOnboardingContext → runExtractionForItem), so agents
 * extract the entities this user actually cares about.
 */

import { useState } from "react";
import { C, Hov, ModalShell, primaryBtn, fieldInput, ghostBtn } from "./ui";

export const TRACK_OPTIONS = [
  "Invoices & payments",
  "Contacts & companies",
  "Meetings & calls",
  "Expenses & receipts",
  "Orders & shipments",
  "Deliverables & tasks",
  "Contracts",
  "Leads & deals",
];

export function OnboardingModal({ initialContext, initialTrack, onClose, onSaved, onImportSpreadsheet }: {
  initialContext: string | null;
  initialTrack: string[];
  onClose: () => void;
  onSaved: () => void;
  onImportSpreadsheet?: () => void;
}) {
  const [context, setContext] = useState(initialContext ?? "");
  const [track, setTrack] = useState<string[]>(initialTrack);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (t: string) => setTrack((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessContext: context, answers: { track } }),
      });
      if (!res.ok) { setErr("Couldn't save — try again."); return; }
      onSaved();
    } catch {
      setErr("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Tell your agents what matters"
      subtitle="A sentence about your work sharpens what we pull out of your messages."
      onClose={onClose}
      badge={{ initial: "✦", bg: C.accent }}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
          {err && <span className="dm-mono" style={{ fontSize: 11.5, color: C.accent, marginRight: "auto" }}>{err}</span>}
          <Hov onClick={onClose} base={{ background: "none", border: "1px solid #DCD3C2", borderRadius: 10, padding: "9px 16px", fontFamily: "inherit", fontSize: 13.5, color: "#57534A", cursor: "pointer" }} hover={{ background: "#FBF8F1" }}>Cancel</Hov>
          <Hov onClick={saving ? undefined : save} base={{ ...primaryBtn(saving), padding: "9px 18px", fontSize: 13.5 }} hover={{ background: C.accentPress }}>{saving ? "Saving…" : "Save"}</Hov>
        </div>
      }
    >
      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label className="dm-mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", display: "block", marginBottom: 8 }}>What does your business do?</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            autoFocus
            rows={3}
            placeholder="e.g. I run a freelance design studio — I care about client invoices, project deliverables, and who I'm talking to at each company."
            style={{ ...fieldInput, resize: "vertical", lineHeight: 1.5, minHeight: 78 }}
          />
          <div style={{ fontSize: 11.5, color: "#A39B8B", marginTop: 6 }}>The more specific, the better your agents extract. You can change this anytime.</div>
        </div>

        <div>
          <label className="dm-mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", display: "block", marginBottom: 10 }}>What should your agents pull out?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TRACK_OPTIONS.map((t) => {
              const on = track.includes(t);
              return (
                <Hov
                  key={t}
                  onClick={() => toggle(t)}
                  base={{
                    fontFamily: "inherit", fontSize: 13, cursor: "pointer", borderRadius: 999, padding: "7px 14px",
                    border: `1.5px solid ${on ? C.accent : "#DCD3C2"}`,
                    background: on ? "#FDF1EC" : "#fff",
                    color: on ? C.accent : "#57534A",
                    fontWeight: on ? 600 : 400,
                  }}
                  hover={on ? undefined : { background: "#FBF8F1" }}
                >
                  {on ? "✓ " : ""}{t}
                </Hov>
              );
            })}
          </div>
        </div>

        {onImportSpreadsheet && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#FDF9F2", border: "1px solid #EFE1D2", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>Already have a spreadsheet?</div>
              <div style={{ fontSize: 12, color: "#8A6a5f", marginTop: 1 }}>Seed your knowledge from it now — it&apos;s cheapest to do while your graph is fresh.</div>
            </div>
            <Hov onClick={onImportSpreadsheet} base={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0 }} hover={{ background: "#fff" }}>
              <span style={{ color: C.accent }}>✦</span> Import a spreadsheet
            </Hov>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
