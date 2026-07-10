import { CSSProperties, ReactNode } from "react";

/**
 * Lay out real content cards and draw smooth animated connectors between their
 * live DOM positions — the signature "break the card pile" primitive. Edges
 * draw in on scroll, a dashed pulse flows along them, and hovering a card
 * lights its links while dimming the rest. Settles to the finished connected
 * state under prefers-reduced-motion.
 */
export interface LinkedCardsProps {
  children?: ReactNode;
  /** Relationships as [fromId, toId] pairs; ids match LinkedCard `id`. */
  links?: [string, string][];
  /** Draw connectors in when scrolled into view. Default true. */
  animate?: boolean;
  /** Show the marching dashed "data flow" pulse along each edge. Default true. */
  flow?: boolean;
  /** Applied to the positioning wrapper — put your layout (grid/flex) here. */
  style?: CSSProperties;
}

export function LinkedCards(props: LinkedCardsProps): JSX.Element;

/**
 * A single card inside a LinkedCards graph. `id` must match ids in the parent
 * `links`. Registers its live position, lifts on hover/focus, and dims when a
 * different card's neighborhood is focused.
 */
export interface LinkedCardProps {
  /** Unique id referenced by the parent's `links`. */
  id: string;
  children?: ReactNode;
  /** Surface treatment. Default "cream". */
  tone?: "cream" | "ink" | "accent";
  /** Corner radius in px. Default 16. */
  radius?: number;
  /** Inner padding in px. Default 18. */
  padding?: number;
  /** Lift the card on hover/focus. Default true. */
  lift?: boolean;
  /** On hover, tilt the card in 3D toward the pointer. Default false. */
  tilt?: boolean;
  /** On hover, add a coral radial gradient that follows the pointer. Default false. */
  glow?: boolean;
  style?: CSSProperties;
}

export function LinkedCard(props: LinkedCardProps): JSX.Element;
