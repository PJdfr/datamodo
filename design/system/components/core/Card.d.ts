import { CSSProperties, ReactNode } from "react";

/**
 * datamodo surface container — warm cream card, dark ink card, or accent-tint card.
 */
export interface CardProps {
  children?: ReactNode;
  /** Surface treatment. Default "cream". */
  tone?: "cream" | "ink" | "accent";
  /** Use the stronger elevated (window) shadow instead of the soft card shadow. */
  elevated?: boolean;
  /** Corner radius in px. Default 18. */
  radius?: number;
  /** Inner padding in px. Default 24. */
  padding?: number;
  style?: CSSProperties;
}

export function Card(props: CardProps): JSX.Element;
