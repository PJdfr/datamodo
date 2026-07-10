import { CSSProperties } from "react";

/**
 * An abstract 3D knowledge-graph orb: a sphere of points each wired to a
 * central coral hub by a radial spoke; a few "concept" points and their spokes
 * glow coral (the freshly-detected facts). Static at rest — it rotates and
 * tilts toward the pointer on hover and the points flee the cursor. Light on
 * dark: place it on an ink surface. Canvas-rendered; honors prefers-reduced-motion.
 *
 * @dsCard directory card lives in components/motion/motion.card.html
 */
export interface OrbGraphProps {
  /** Labels to highlight as concept nodes. Defaults to the sample email's facts. */
  concepts?: string[];
  /** Canvas height in px. Default 360. */
  height?: number;
  /** Total number of points on the sphere. Default 78. */
  count?: number;
  style?: CSSProperties;
}

export function OrbGraph(props: OrbGraphProps): JSX.Element;
