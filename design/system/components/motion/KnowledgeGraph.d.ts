import { CSSProperties } from "react";

export type GraphNodeType = "hub" | "company" | "person" | "invoice" | "amount" | "message";

export interface GraphNode {
  id: string;
  label: string;
  /** x/y in the 500×340 viewBox. */
  x: number;
  y: number;
  type: GraphNodeType;
  /** Optional bullet facts shown in the inspector panel when the node is clicked. */
  facts?: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
}

/**
 * Animated, INTERACTIVE knowledge-graph canvas — datamodo's signature
 * "break from the card pile" element. Edges draw in and nodes pop on mount;
 * hover/focus lights connections in coral, DRAG a node to rearrange it (edges
 * follow live), CLICK a node to pin the inspector panel (facts + links).
 * Honors prefers-reduced-motion. A default datamodo graph is built in.
 *
 * @dsCard directory card lives in components/motion/motion.card.html
 */
export interface KnowledgeGraphProps {
  /** Nodes to render. Defaults to a sample datamodo graph. */
  nodes?: GraphNode[];
  /** Edges between node ids. Defaults to the sample graph's links. */
  edges?: GraphEdge[];
  /** Width (number px or CSS string). Default "100%". */
  width?: number | string;
  /** Play the draw-in + pop entrance and hub pulse. Default true. */
  play?: boolean;
  /** Allow holding + dragging nodes to rearrange them. Default true. */
  draggable?: boolean;
  /** Fires when a node is pinned open (or null on close). */
  onSelect?: (node: GraphNode | null) => void;
  style?: CSSProperties;
}

export function KnowledgeGraph(props: KnowledgeGraphProps): JSX.Element;
