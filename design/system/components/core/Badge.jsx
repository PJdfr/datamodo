import React from "react";

/**
 * datamodo Badge — the small pill labels used throughout.
 *  - status pills: success (green "Paid"), warning (gold "Sent"), accent
 *    ("Approved"), neutral.
 *  - the "mono" flag renders the label in Geist Mono (data feel), matching
 *    row-count chips and "+1 row added" badges.
 */
export function Badge({ children, variant = "neutral", mono = false, style = {} }) {
  const variants = {
    success: { color: "var(--dm-success, #3F8F5B)", background: "var(--dm-success-bg, #E4F0E8)" },
    warning: { color: "var(--dm-warning, #B08A2E)", background: "var(--dm-warning-bg, #F6ECD4)" },
    accent: { color: "var(--dm-accent, #E4593B)", background: "var(--dm-accent-tint-3, #FBE0D6)" },
    neutral: { color: "var(--dm-text-muted, #8A8477)", background: "var(--dm-surface-sunk, #FAF6EE)" },
    ink: { color: "#fff", background: "var(--dm-ink, #211E18)" },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: mono ? "var(--dm-font-mono, monospace)" : "var(--dm-font-body, sans-serif)",
        fontSize: 11,
        fontWeight: mono ? 500 : 600,
        padding: "2px 9px",
        borderRadius: 999,
        lineHeight: 1.5,
        ...(variants[variant] || variants.neutral),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * The mono eyebrow pill — uppercase Geist Mono label in accent on a tint pill,
 * with a leading dot. Sits above section headings ("watch it work", etc.).
 */
export function Eyebrow({ children, dot = true, onDark = false, style = {} }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--dm-font-mono, monospace)",
        fontSize: 12.5,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--dm-accent, #E4593B)",
        background: onDark ? "transparent" : "var(--dm-accent-tint, #FBEAE3)",
        border: onDark ? "none" : "1px solid var(--dm-accent-tint-border, #F3D6CB)",
        padding: onDark ? 0 : "6px 12px",
        borderRadius: 999,
        ...style,
      }}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent, #E4593B)" }} />
      )}
      {children}
    </span>
  );
}
