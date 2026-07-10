import { CSSProperties, ReactNode } from "react";

/**
 * datamodo pill labels: status badges (Paid / Sent / Approved) and the mono
 * eyebrow that sits above section headings.
 */
export interface BadgeProps {
  children?: ReactNode;
  /** Semantic color. Default "neutral". */
  variant?: "success" | "warning" | "accent" | "neutral" | "ink";
  /** Render the label in Geist Mono (data feel). */
  mono?: boolean;
  style?: CSSProperties;
}

export function Badge(props: BadgeProps): JSX.Element;

export interface EyebrowProps {
  children?: ReactNode;
  /** Show the leading accent dot. Default true. */
  dot?: boolean;
  /** Drop the pill chrome for placement on ink sections. */
  onDark?: boolean;
  style?: CSSProperties;
}

/** Uppercase mono eyebrow label above section headings. */
export function Eyebrow(props: EyebrowProps): JSX.Element;
