import { CSSProperties, ReactNode } from "react";

/**
 * Warm card that lifts, tilts toward the cursor, and shows a coral spotlight
 * glow on hover. Breaks the flat card-pile feel for feature tiles and lists.
 * Settles instantly under prefers-reduced-motion.
 */
export interface SpotlightCardProps {
  children?: ReactNode;
  /** Surface treatment. Default "cream". */
  tone?: "cream" | "ink";
  /** Max pointer tilt in degrees; 0 keeps spotlight + lift only. Default 6. */
  tilt?: number;
  /** Corner radius in px. Default 18. */
  radius?: number;
  /** Inner padding in px. Default 24. */
  padding?: number;
  style?: CSSProperties;
}

export function SpotlightCard(props: SpotlightCardProps): JSX.Element;
