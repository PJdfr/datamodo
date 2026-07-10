import { CSSProperties, ReactNode } from "react";

/**
 * Fades + rises its content into view on first scroll into the viewport.
 * Optionally staggers its direct children. Content is visible from the start
 * under prefers-reduced-motion.
 */
export interface RevealOnScrollProps {
  children?: ReactNode;
  /** Animate direct children in sequence instead of all at once. Default false. */
  stagger?: boolean;
  /** Delay before the first reveal, ms. Default 0. */
  delay?: number;
  /** Delay between staggered children, ms. Default 90. */
  step?: number;
  /** Rise distance in px. Default 16. */
  y?: number;
  /** Reveal only once (stay visible). Default true. */
  once?: boolean;
  style?: CSSProperties;
}

export function RevealOnScroll(props: RevealOnScrollProps): JSX.Element;
