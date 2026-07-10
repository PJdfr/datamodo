import { CSSProperties, ReactNode } from "react";

/**
 * Asymmetric CSS-grid tile layout that breaks the even card-grid look. Tiles
 * set their own span via BentoTile; dense auto-flow packs mixed sizes into an
 * editorial composition.
 */
export interface BentoGridProps {
  children?: ReactNode;
  /** Number of grid columns. Default 4. */
  columns?: number;
  /** Height of one grid row (px or CSS). Default 168. */
  rowHeight?: number | string;
  /** Gap between tiles in px. Default 16. */
  gap?: number;
  style?: CSSProperties;
}

export function BentoGrid(props: BentoGridProps): JSX.Element;

export interface BentoTileProps {
  children?: ReactNode;
  /** Columns to span. Default 1. */
  colSpan?: number;
  /** Rows to span. Default 1. */
  rowSpan?: number;
  /** Surface treatment when not bare. Default "cream". */
  tone?: "cream" | "ink" | "accent";
  /** Render as an unstyled span (no bg/border/padding) — for graphs, windows, media. Default false. */
  bare?: boolean;
  /** Corner radius in px. Default 18. */
  radius?: number;
  /** Inner padding in px. Default 24. */
  padding?: number;
  style?: CSSProperties;
}

export function BentoTile(props: BentoTileProps): JSX.Element;
