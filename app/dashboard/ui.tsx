"use client";

/**
 * Shared dashboard UI kit — the primitives, theme tokens, style atoms and small
 * hooks used across the Agents / Data / Versioning / Settings surfaces. Kept in
 * one place so the feature files stay focused and consistent.
 */

import {
  createElement,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ActionResult } from "./actions";

/* ------------------------------------------------------------------ */
/* CountUp — animate a number from 0 to its value on mount. A small     */
/* delight for headline stats; respects prefers-reduced-motion.        */
/* ------------------------------------------------------------------ */
export function CountUp({ value, format, duration = 900 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString("en-US"));
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const target = value;
    const from = 0;
    if (reduce || target === from) { setDisplay(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      ref.current = from + (target - from) * eased;
      setDisplay(ref.current);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{fmt(display)}</>;
}

/* ------------------------------------------------------------------ */
/* Hover helper — inline styles win over CSS :hover, so hover states   */
/* that sit on top of data-driven inline styles are swapped in JS.     */
/* ------------------------------------------------------------------ */
type HovProps = {
  tag?: "button" | "div" | "a" | "label" | "span";
  base: CSSProperties;
  hover?: CSSProperties;
  children?: ReactNode;
  className?: string;
  type?: "button" | "submit";
  title?: string;
  href?: string;
  download?: boolean | string;
  onClick?: () => void;
};
export function Hov({ tag = "button", base, hover, children, ...rest }: HovProps) {
  const [h, setH] = useState(false);
  const props: Record<string, unknown> = {
    ...rest,
    style: h && hover ? { ...base, ...hover } : base,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
  };
  if (tag === "button") props.type = rest.type ?? "button";
  return createElement(tag, props, children);
}

/* ------------------------------------------------------------------ */
/* Palette + channel assets                                            */
/* ------------------------------------------------------------------ */
export const C = {
  ink: "#211E18",
  accent: "#E4593B",
  accentPress: "#CF4A2F",
  green: "#3F8F5B",
  gold: "#B08A2E",
  blue: "#5A6B86",
};

// Only channels the backend can actually ingest are offered. gmail/outlook route
// through the email connector (forward to your inbox address); whatsapp/slack/teams
// have inbound webhook adapters. (Telegram is intentionally absent — no adapter.)
export const LOGO: Record<string, string> = {
  gmail: "/logos/google-gmail.svg",
  outlook: "/logos/microsoft-outlook.svg",
  whatsapp: "/logos/whatsapp-icon.svg",
  slack: "/logos/slack-icon.svg",
  teams: "/logos/microsoft-teams.svg",
};
export const CH_NAMES: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  whatsapp: "WhatsApp",
  slack: "Slack",
  teams: "Teams",
};

/* ------------------------------------------------------------------ */
/* View-model shapes shared by the feature surfaces                    */
/* ------------------------------------------------------------------ */
export type Agent = {
  id: string;
  name: string;
  initial: string;
  avatarBg: string;
  statusLabel: string;
  statusColor: string;
  statusDot: string;
  channels: string[];
  modeLabel: string;
  purpose: string;
  feeds: string;
  pending: number;
};

export type TableInfo = {
  id: string;
  name: string;
  rows: string;
  fields: string[];
  agent: string;
  agentInitial: string;
  agentBg: string;
  updated: string;
};

/* ------------------------------------------------------------------ */
/* Style atoms (mirror the design's DCLogic helpers)                   */
/* ------------------------------------------------------------------ */
export const navBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  background: "none",
  border: "none",
  padding: "9px 10px",
  borderRadius: 9,
  fontFamily: "inherit",
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
  transition: "background .15s ease, color .15s ease",
};
export const navStyle = (active: boolean): CSSProperties =>
  active
    ? { ...navBase, background: "#2B2720", color: "#F1ECE1", fontWeight: 500 }
    : { ...navBase, color: "#B7AF9F" };

export const modeCard = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  width: "100%",
  textAlign: "left",
  background: "#fff",
  borderRadius: 13,
  padding: "15px 16px",
  cursor: "pointer",
  fontFamily: "inherit",
  // Buttons don't inherit `color`; without this the title text falls back to
  // the UA default (white in dark color-scheme) and vanishes on the card.
  color: C.ink,
  transition: "border-color .15s ease, box-shadow .15s ease",
  border: active ? "1.5px solid #E4593B" : "1.5px solid #E7E0D2",
  boxShadow: active ? "0 0 0 3px rgba(228,89,59,.1)" : "none",
});
export const radioDot = (active: boolean): CSSProperties => ({
  width: 20,
  height: 20,
  borderRadius: "50%",
  flexShrink: 0,
  border: `2px solid ${active ? C.accent : "#D8CFBD"}`,
  background: active
    ? "radial-gradient(circle, #E4593B 0 5px, #fff 6px 20px)"
    : "#fff",
});
export const bar = (active: boolean): CSSProperties => ({
  flex: 1,
  height: 4,
  borderRadius: 999,
  background: active ? C.accent : "#E1D9C8",
});
export const toggleTrack = (on: boolean): CSSProperties => ({
  width: 38,
  height: 22,
  borderRadius: 999,
  background: on ? C.accent : "#D8CFBD",
  position: "relative",
  display: "inline-block",
  transition: "background .15s ease",
  flexShrink: 0,
});
export const toggleKnob = (on: boolean): CSSProperties => ({
  position: "absolute",
  top: 2,
  left: on ? 18 : 2,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#fff",
  transition: "left .15s ease",
  boxShadow: "0 1px 3px rgba(0,0,0,.2)",
});
export const channelTile = (active: boolean): CSSProperties => ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "#fff",
  borderRadius: 12,
  padding: "12px 14px",
  cursor: "pointer",
  fontFamily: "inherit",
  color: C.ink,
  transition: "border-color .15s ease, box-shadow .15s ease",
  border: active ? "1.5px solid #E4593B" : "1.5px solid #E7E0D2",
  boxShadow: active ? "0 0 0 3px rgba(228,89,59,.1)" : "none",
});
export const targetChip = (sel: boolean, freestyle: boolean): CSSProperties => {
  const b: CSSProperties = {
    fontSize: 11,
    padding: "6px 11px",
    borderRadius: 9,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#fff",
  };
  if (freestyle) return { ...b, border: "1px solid #ECE5D8", color: "#B7AF9F" };
  return sel
    ? { ...b, border: "1.5px solid #E4593B", color: C.accent, background: "#FDF1EC" }
    : { ...b, border: "1px solid #E1D9C8", color: "#57534A" };
};

export const monoLabel: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#A39B8B",
};

export const fieldInput: CSSProperties = { width: "100%", border: "1px solid #DDD5C5", borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" };
export const fieldLabel: CSSProperties = { ...monoLabel, marginBottom: 7 };
export const primaryBtn = (disabled: boolean): CSSProperties => ({ background: C.accent, backgroundImage: "linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0) 45%)", color: "#fff8f4", border: "none", borderRadius: 11, padding: "10px 20px", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.7 : 1, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 20px -8px rgba(228,89,59,.5)", transition: "box-shadow .2s ease, transform .12s ease" });
export const ghostBtn: CSSProperties = { background: "#fff", border: "1px solid #DCD3C2", borderRadius: 9, padding: "7px 12px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, color: "#3A352C", cursor: "pointer" };

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
// Palette used to give agents/tables a stable accent when the DB has none.
export const AVATAR_PALETTE = [C.accent, C.ink, C.green, C.gold, C.blue];
export const pickColor = (seed: string) =>
  AVATAR_PALETTE[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length];

export const relTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const showVal = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

export function coerceByType(type: string, raw: string): string | number | null {
  if (raw === "") return null;
  if (type === "number") { const n = Number(raw); return Number.isNaN(n) ? raw : n; }
  return raw;
}
export const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const COLUMN_TYPES = [{ v: "text", label: "Text" }, { v: "number", label: "Number" }, { v: "date", label: "Date" }, { v: "status", label: "Status" }];

/* ------------------------------------------------------------------ */
/* Reusable components                                                 */
/* ------------------------------------------------------------------ */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div style={{ display: "inline-flex", background: "#EFE9DC", border: "1px solid #E1D9C8", borderRadius: 9, padding: 3 }}>
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} style={{ border: "none", borderRadius: 7, padding: "6px 12px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer", ...(value === o.v ? { background: "#fff", color: C.ink, boxShadow: "0 1px 2px rgba(33,30,24,.14)" } : { background: "transparent", color: "#8A8477" }) }}>{o.label}</button>
      ))}
    </div>
  );
}

/* One source message behind a fact — the "where did this come from?" evidence.
 * Shared by Knowledge cards, entity pages, and the Explorer's edge inspector. */
export const CHANNEL_META: Record<string, { emoji: string; label: string }> = {
  email: { emoji: "✉", label: "Email" },
  whatsapp: { emoji: "🟢", label: "WhatsApp" },
  slack: { emoji: "▦", label: "Slack" },
  teams: { emoji: "◇", label: "Teams" },
};
export const channelMeta = (c: string) => CHANNEL_META[c] ?? { emoji: "•", label: c };

export function SourceRow({ s }: { s: import("@/lib/datamodo/types").FactSourceView }) {
  const ch = channelMeta(s.channel);
  return (
    <div style={{ background: "#FCFAF4", border: "1px solid #EDE7DA", borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: s.snippet || s.preview ? 5 : 0, minWidth: 0 }}>
        <span style={{ fontSize: 11 }}>{ch.emoji}</span>
        <span className="dm-mono" style={{ fontSize: 9.5, color: "#8A8477", flexShrink: 0 }}>{ch.label}</span>
        {s.sender && <span style={{ fontSize: 11.5, color: C.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sender}</span>}
        {s.subject && <span style={{ fontSize: 11, color: "#8A8477", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {s.subject}</span>}
      </div>
      {s.snippet ? (
        <div style={{ fontSize: 12, color: "#57534A", lineHeight: 1.45 }}>“<span style={{ fontStyle: "italic" }}>{s.snippet}</span>”</div>
      ) : s.preview ? (
        <div style={{ fontSize: 12, color: "#8A8477", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis" }}>{s.preview}</div>
      ) : null}
    </div>
  );
}

export function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 600, badge }: { title: ReactNode; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; maxWidth?: number; badge?: { initial: string; bg: string } }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, alignItems: "center", justifyContent: "center", padding: 24, display: "flex" }}>
      <div onClick={onClose} className="dm-fade-in" style={{ position: "absolute", inset: 0, background: "rgba(33,30,24,.5)", backdropFilter: "blur(2px)" }} />
      <div className="dm-modal-in" style={{ position: "relative", width: "100%", maxWidth, background: "#F6F2E9", border: "1px solid #E1D9C8", borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 90px -40px rgba(33,30,24,.7)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 22px", borderBottom: "1px solid #E7E0D2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {badge && (
              <span className="dm-display" style={{ width: 40, height: 40, borderRadius: 12, background: badge.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 17, flexShrink: 0 }}>{badge.initial}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="dm-display" style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.025em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
              {subtitle && <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          <Hov onClick={onClose} base={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #E1D9C8", background: "#fff", color: "#8A8477", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }} hover={{ background: "#FBF8F1", color: C.ink }}>✕</Hov>
        </div>
        <div className="cc-scroll" style={{ padding: "20px 22px", overflow: "auto", flex: 1 }}>{children}</div>
        {footer && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 22px", borderTop: "1px solid #E7E0D2", background: "#F0EBDE" }}>{footer}</div>}
      </div>
    </div>
  );
}

/* Framed panel with a soft header-bar — mono-uppercase label left, summary right. */
export function Panel({ label, summary, summaryColor = "#A39B8B", children, style }: { label: ReactNode; summary?: ReactNode; summaryColor?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: "1px solid #ECE5D8", borderRadius: 12, overflow: "hidden", background: "#fff", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 14px", background: "#FAF6EE", borderBottom: "1px solid #ECE5D8" }}>
        <span className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "#A39B8B" }}>{label}</span>
        {summary != null && <span className="dm-mono" style={{ fontSize: 10.5, color: summaryColor }}>{summary}</span>}
      </div>
      {children}
    </div>
  );
}

export function DiffBadge({ color, bg, text }: { color: string; bg: string; text: string }) {
  return <span className="dm-mono" style={{ fontSize: 10, fontWeight: 600, color, background: bg, borderRadius: 999, padding: "2px 8px" }}>{text}</span>;
}

/* ------------------------------------------------------------------ */
/* Shared hook: run a Server Action with pending + error state.        */
/* ------------------------------------------------------------------ */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) => {
    setError(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) { setError(res.error); return; }
        after?.();
      } catch {
        // A REJECTED action (network drop, or a fresh deployment invalidating
        // this page's action ids) must degrade to a message — an uncaught
        // rejection here takes down the whole page with an error screen.
        setError("Something went wrong — reload the page and try again.");
      }
    });
  };
  return { pending, error, setError, run };
}
