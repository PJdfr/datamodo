import React from "react";

/**
 * The datamodo wordmark: "data" in a handwritten script (Caveat, rotated -4deg)
 * flowing into "modo" in clean display type (Bricolage Grotesque).
 * Messy handwriting -> clean type, mirroring messy data -> clean data.
 * Always pure text, never an image.
 */
export function Logo({
  dataSize = 30,
  modoSize = 21,
  color = "#211E18",
  onDark = false,
  style = {},
}) {
  const resolved = onDark ? "#F1ECE1" : color;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", ...style }}>
      <span
        style={{
          fontFamily: "var(--dm-font-script, 'Caveat', cursive)",
          fontWeight: 700,
          fontSize: dataSize,
          lineHeight: 1,
          color: resolved,
          display: "inline-block",
          transform: "rotate(-4deg)",
          marginRight: 1,
        }}
      >
        data
      </span>
      <span
        style={{
          fontFamily: "var(--dm-font-display, 'Bricolage Grotesque', sans-serif)",
          fontWeight: 700,
          fontSize: modoSize,
          letterSpacing: "-0.03em",
          color: resolved,
        }}
      >
        modo
      </span>
    </span>
  );
}
