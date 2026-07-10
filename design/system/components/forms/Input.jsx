import React from "react";

/**
 * datamodo text field. White surface, tan border, radius 11, with an optional
 * leading glyph/icon. The label + optional trailing (e.g. "Forgot?") are handled
 * by the caller; this renders the field row itself.
 */
export function Input({
  glyph,
  value,
  placeholder,
  type = "text",
  readOnly = false,
  onChange,
  style = {},
  inputStyle = {},
  ...rest
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        background: "var(--dm-surface-pure, #fff)",
        border: "1px solid var(--dm-border-3, #DDD5C5)",
        borderRadius: 11,
        padding: "11px 13px",
        ...style,
      }}
    >
      {glyph && (
        <span style={{ color: "var(--dm-text-faint, #B7AF9F)", fontSize: 14, display: "inline-flex" }}>
          {glyph}
        </span>
      )}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={onChange}
        style={{
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "var(--dm-font-body, 'Geist', sans-serif)",
          fontSize: 14.5,
          color: "var(--dm-ink, #211E18)",
          width: "100%",
          letterSpacing: type === "password" ? "0.15em" : "normal",
          ...inputStyle,
        }}
        {...rest}
      />
    </div>
  );
}

/** A field label + optional trailing action, above an Input. */
export function Field({ label, trailing, children, style = {} }) {
  return (
    <div style={{ ...style }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: trailing ? "space-between" : "flex-start",
          marginBottom: 6,
        }}
      >
        <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--dm-text-body-2, #57534A)" }}>
          {label}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  );
}
