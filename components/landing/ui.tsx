"use client";

/**
 * Landing-page primitives ported from the datamodo design system
 * (design/system/components — Button, Eyebrow, MacWindow). Landing-only:
 * the signed-in app keeps its own primitives in app/dashboard/ui.tsx.
 */
import type { CSSProperties, ReactNode, MouseEvent } from "react";
import Link from "next/link";

/* ----------------------------------------------------------------- button */
type ButtonVariant = "primary" | "dark" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const BTN_SIZES: Record<ButtonSize, { padding: string; fontSize: number; radius: number }> = {
  sm: { padding: "9px 16px", fontSize: 14, radius: 11 },
  md: { padding: "13px 22px", fontSize: 15, radius: 13 },
  lg: { padding: "15px 26px", fontSize: 16, radius: 13 },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  onDark = false,
  href,
  style = {},
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onDark?: boolean;
  href?: string;
  style?: CSSProperties;
}) {
  const s = BTN_SIZES[size];
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "var(--dm-font-body)",
    fontWeight: 600,
    fontSize: s.fontSize,
    padding: s.padding,
    borderRadius: s.radius,
    border: "1px solid transparent",
    cursor: "pointer",
    textDecoration: "none",
    lineHeight: 1.1,
    transition: "background .18s ease, border-color .18s ease",
    whiteSpace: "nowrap",
  };
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: "var(--dm-accent)",
      color: "var(--dm-accent-on)",
      boxShadow: "var(--dm-shadow-accent)",
    },
    dark: { background: "var(--dm-ink)", color: "var(--dm-canvas)" },
    outline: {
      background: "transparent",
      color: onDark ? "var(--dm-text-on-ink)" : "var(--dm-ink)",
      borderColor: onDark ? "var(--dm-ink-border)" : "#DCD3C2",
    },
    ghost: {
      background: "transparent",
      color: onDark ? "var(--dm-text-on-ink)" : "var(--dm-ink)",
    },
  };
  const hoverBg =
    variant === "primary"
      ? "var(--dm-accent-press)"
      : variant === "dark"
        ? "#31291F"
        : onDark
          ? "var(--dm-ink-surface)"
          : "var(--dm-surface)";
  const restBg = (variants[variant].background as string) ?? "transparent";
  const enter = (e: MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = hoverBg;
  };
  const leave = (e: MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = restBg;
  };
  const merged = { ...base, ...variants[variant], ...style };

  if (href) {
    return (
      <Link href={href} style={merged} onMouseEnter={enter} onMouseLeave={leave}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" style={merged} onMouseEnter={enter} onMouseLeave={leave}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- eyebrow */
export function Eyebrow({
  children,
  dot = true,
  bare = false,
  style = {},
}: {
  children: ReactNode;
  dot?: boolean;
  /** bare: no pill chrome (used on dark sections and dense headers) */
  bare?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--dm-font-mono)",
        fontSize: 12.5,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--dm-accent)",
        background: bare ? "transparent" : "var(--dm-accent-tint)",
        border: bare ? "none" : "1px solid var(--dm-accent-tint-border)",
        padding: bare ? 0 : "6px 12px",
        borderRadius: 999,
        ...style,
      }}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent)" }} />
      )}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- MacWindow */
export function MacWindow({
  title,
  children,
  floaty = false,
  radius = 14,
  style = {},
}: {
  title?: string;
  children: ReactNode;
  floaty?: boolean;
  radius?: number;
  style?: CSSProperties;
}) {
  const dot = (bg: string) => (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: bg,
        boxShadow: "inset 0 0 0 .5px rgba(0,0,0,.14)",
      }}
    />
  );
  return (
    <div
      style={{
        borderRadius: radius,
        overflow: "hidden",
        border: "1px solid #DEDAD0",
        background: "#fff",
        boxShadow: "var(--dm-shadow-window)",
        animation: floaty ? "lp-floaty 6s ease-in-out infinite" : "none",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 14px",
          background: "linear-gradient(#F7F5F1,#EBE9E2)",
          borderBottom: "1px solid #DCD8CE",
        }}
      >
        {dot("var(--dm-mac-red)")}
        {dot("var(--dm-mac-yellow)")}
        {dot("var(--dm-mac-green)")}
        {title && (
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#8F897B",
              pointerEvents: "none",
            }}
          >
            {title}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
