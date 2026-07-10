import { CSSProperties, ReactNode } from "react";

/**
 * datamodo text field — white surface, tan border, optional leading glyph.
 */
export interface InputProps {
  /** Leading icon/glyph node (e.g. a Mail or Lock icon). */
  glyph?: ReactNode;
  value?: string;
  placeholder?: string;
  type?: "text" | "email" | "password";
  readOnly?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
}

export function Input(props: InputProps): JSX.Element;

export interface FieldProps {
  label: string;
  /** Optional trailing node (e.g. a "Forgot?" link). */
  trailing?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

/** A label row (with optional trailing action) that wraps an Input. */
export function Field(props: FieldProps): JSX.Element;
