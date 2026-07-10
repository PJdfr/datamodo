import React from "react";

/**
 * datamodo ChannelPill — a rounded "works with" pill: a real full-color channel
 * logo + label. Pass the logo src (the design system ships the SVGs under
 * assets/logos/). Used in the landing "works with everything" strip.
 */
export function ChannelPill({ src, label, style = {} }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        fontSize: 14,
        fontWeight: 500,
        color: "var(--dm-text-body-2, #57534A)",
        background: "var(--dm-surface, #FFFDF8)",
        border: "1px solid var(--dm-border, #E7E0D2)",
        padding: "9px 16px",
        borderRadius: 999,
        ...style,
      }}
    >
      {src && <img src={src} alt="" style={{ height: 18, width: "auto", display: "block" }} />}
      {label}
    </span>
  );
}
