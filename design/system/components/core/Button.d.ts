import { CSSProperties, ReactNode } from "react";

/**
 * datamodo Button. Solid coral primary, ink "dark" pill, tan outline, and ghost.
 */
export interface ButtonProps {
  children?: ReactNode;
  /** Visual style. Default "primary". */
  variant?: "primary" | "dark" | "outline" | "ghost";
  /** Default "md". */
  size?: "sm" | "md" | "lg";
  /** Adjust outline/ghost colors for placement on ink surfaces. */
  onDark?: boolean;
  /** Render as another element, e.g. "a" for links. Default "button". */
  as?: "button" | "a";
  style?: CSSProperties;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

export function Button(props: ButtonProps): JSX.Element;
