import { CSSProperties } from "react";

/**
 * A "works with" channel pill — full-color logo + label on a cream pill.
 */
export interface ChannelPillProps {
  /** URL to the channel logo SVG (ships under assets/logos/). */
  src?: string;
  /** Channel name, e.g. "Gmail". */
  label: string;
  style?: CSSProperties;
}

export function ChannelPill(props: ChannelPillProps): JSX.Element;
