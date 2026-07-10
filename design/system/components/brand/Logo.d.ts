import { CSSProperties } from "react";

/**
 * The datamodo wordmark. "data" set in Caveat (handwritten, rotated) flowing
 * into "modo" set in Bricolage Grotesque. Pure text — never an image.
 */
export interface LogoProps {
  /** Font-size (px) of the handwritten "data". Default 30. */
  dataSize?: number;
  /** Font-size (px) of the "modo" display type. Default 21. */
  modoSize?: number;
  /** Ink color when not on a dark surface. Default #211E18. */
  color?: string;
  /** Render in cream for placement on ink/dark backgrounds. */
  onDark?: boolean;
  style?: CSSProperties;
}

export function Logo(props: LogoProps): JSX.Element;
