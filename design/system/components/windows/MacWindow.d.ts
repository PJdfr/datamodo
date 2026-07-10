import { CSSProperties, ReactNode } from "react";

/**
 * The macOS window chrome (traffic lights + centered title) that houses the
 * email and spreadsheet mocks. Add `floaty` for the gentle vertical bob.
 *
 * Requires the `dm-floaty` keyframes when floaty is on:
 *   @keyframes dm-floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
 */
export interface MacWindowProps {
  /** Centered title-bar caption, e.g. "datamodo — Invoices". */
  title?: string;
  children?: ReactNode;
  /** Gentle vertical bob (needs dm-floaty keyframes). */
  floaty?: boolean;
  /** Corner radius. Default 14. */
  radius?: number;
  style?: CSSProperties;
}

export function MacWindow(props: MacWindowProps): JSX.Element;
