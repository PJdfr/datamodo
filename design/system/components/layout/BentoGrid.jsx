import React from "react";

/**
 * datamodo BentoGrid — an asymmetric tile layout that breaks the monotony of
 * an even N-column card grid. Children control their own span via a
 * data-driven `items` map OR by passing `colSpan`/`rowSpan` on a wrapping
 * <BentoTile>. Built on CSS grid with a dense auto-flow so tiles of mixed
 * sizes pack into an editorial, magazine-like composition.
 */
export function BentoGrid({
  children,
  columns = 4,
  rowHeight = 168,
  gap = 16,
  style = {},
  ...rest
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: typeof rowHeight === "number" ? `${rowHeight}px` : rowHeight,
        gridAutoFlow: "dense",
        gap,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * A single tile inside BentoGrid. Set colSpan/rowSpan to size it. `tone`
 * matches the Card tones (cream / ink / accent). By default it renders as a
 * warm surface with the soft card shadow; pass bare={true} for an unstyled
 * span (e.g. to drop a KnowledgeGraph or MacWindow straight in).
 */
export function BentoTile({
  children,
  colSpan = 1,
  rowSpan = 1,
  tone = "cream",
  bare = false,
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
        gridColumn: `span ${colSpan}`,
        gridRow: `span ${rowSpan}`,
        minWidth: 0,
        ...(bare
          ? {}
          : {
              borderRadius: radius,
              padding,
              overflow: "hidden",
              boxShadow: "var(--dm-shadow-card, 0 18px 44px -30px rgba(33,30,24,.35))",
              ...tones[tone],
            }),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
