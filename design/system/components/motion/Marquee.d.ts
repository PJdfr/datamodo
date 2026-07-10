import { CSSProperties, ReactNode } from "react";

/**
 * Infinite horizontal marquee with edge fade masks; pauses on hover. Streams
 * channel logos or entity chips across full width. Freezes under
 * prefers-reduced-motion.
 */
export interface MarqueeProps {
  children?: ReactNode;
  /** Seconds for one full loop. Lower = faster. Default 32. */
  duration?: number;
  /** Scroll direction. Default "left". */
  direction?: "left" | "right";
  /** Gap between items in px. Default 20. */
  gap?: number;
  /** Pause the loop while hovered. Default true. */
  pauseOnHover?: boolean;
  /** Cream fade masks at both edges. Default true. */
  fade?: boolean;
  style?: CSSProperties;
}

export function Marquee(props: MarqueeProps): JSX.Element;
