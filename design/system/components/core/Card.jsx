import React from "react";

/**
 * datamodo Card. The warm surface container used across the product.
 *  - tone "cream":  #FFFDF8 surface, tan border, soft card shadow (default)
 *  - tone "ink":    dark #211E18/#2B2720 surface, cream text (for dark sections)
 *  - tone "accent": highlighted tint card with accent border
 * `elevated` swaps the soft card shadow for the stronger window shadow.
 */
export function Card({
  children,
  tone = "cream",
  elevated = false,
  radius = 18,
  padding = 24,
  style = {},
  ...rest
}) {
  const tones = {
    cream: {
      background: "var(--dm-surface, #FFFDF8)",
      border: "1px solid var(--dm-border, #E7E0D2)",
      color: "var(--dm-ink, #211E18)",
    },
    ink: {
      background: "var(--dm-ink-surface, #2B2720)",
      border: "1px solid var(--dm-ink-border, #3A352C)",
      color: "var(--dm-text-on-ink, #F1ECE1)",
    },
    accent: {
      background: "var(--dm-accent-tint-2, #FDF1EC)",
      border: "1px solid var(--dm-accent-tint-border, #F3D6CB)",
      color: "var(--dm-ink, #211E18)",
    },
  };
  return (
    <div
      style={{
        borderRadius: radius,
        padding,
        boxShadow: elevated
          ? "var(--dm-shadow-window, 0 30px 60px -28px rgba(33,30,24,.5),0 6px 16px -8px rgba(33,30,24,.22))"
          : "var(--dm-shadow-card, 0 18px 44px -30px rgba(33,30,24,.35))",
        ...(tones[tone] || tones.cream),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
