import React from "react";

/**
 * datamodo Button. Three variants matching the brand:
 *  - primary: solid coral, cream text, warm shadow (main CTA)
 *  - dark:    ink fill, cream text ("Get started" nav pill)
 *  - outline: ink text, tan hairline border
 *  - ghost:   ink text, no chrome
 * On dark sections, pass onDark for the outline/ghost variants.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  onDark = false,
  as = "button",
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: "9px 16px", fontSize: 14, radius: 11 },
    md: { padding: "13px 22px", fontSize: 15, radius: 13 },
    lg: { padding: "15px 26px", fontSize: 16, radius: 13 },
  };
  const s = sizes[size] || sizes.md;

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "var(--dm-font-body, 'Geist', sans-serif)",
    fontWeight: 600,
    fontSize: s.fontSize,
    padding: s.padding,
    borderRadius: s.radius,
    border: "1px solid transparent",
    cursor: "pointer",
    textDecoration: "none",
    lineHeight: 1.1,
    transition: "background .18s ease, border-color .18s ease, transform .1s ease",
    whiteSpace: "nowrap",
  };

  const variants = {
    primary: {
      background: "var(--dm-accent, #E4593B)",
      color: "var(--dm-accent-on, #FFF8F4)",
      boxShadow: "var(--dm-shadow-accent, 0 6px 18px rgba(228,89,59,.28))",
    },
    dark: {
      background: "var(--dm-ink, #211E18)",
      color: "var(--dm-canvas, #F6F2E9)",
    },
    outline: {
      background: "transparent",
      color: onDark ? "var(--dm-text-on-ink, #F1ECE1)" : "var(--dm-ink, #211E18)",
      borderColor: onDark ? "var(--dm-ink-border, #3A352C)" : "#DCD3C2",
    },
    ghost: {
      background: "transparent",
      color: onDark ? "var(--dm-text-on-ink, #F1ECE1)" : "var(--dm-ink, #211E18)",
    },
  };

  const Tag = as;
  return (
    <Tag
      style={{ ...base, ...(variants[variant] || variants.primary), ...style }}
      onMouseEnter={(e) => {
        if (variant === "primary") e.currentTarget.style.background = "var(--dm-accent-press, #CF4A2F)";
        else if (variant === "dark") e.currentTarget.style.background = "#31291F";
        else e.currentTarget.style.background = onDark ? "var(--dm-ink-surface, #2B2720)" : "var(--dm-surface, #FFFDF8)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = (variants[variant] || variants.primary).background;
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
