import React from "react";

/**
 * datamodo MacWindow — the hyper-realistic macOS window chrome that houses the
 * email and spreadsheet mocks across the product. Renders the title bar with
 * real traffic-light dots (each 12px with an inset hairline) and a centered
 * title, then your content below. `floaty` adds the gentle vertical bob.
 */
export function MacWindow({ title, children, floaty = false, radius = 14, style = {} }) {
  const dot = (bg) => (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: bg,
        boxShadow: "inset 0 0 0 .5px rgba(0,0,0,.14)",
      }}
    />
  );
  return (
    <div
      style={{
        borderRadius: radius,
        overflow: "hidden",
        border: "1px solid #DEDAD0",
        background: "#fff",
        boxShadow:
          "var(--dm-shadow-window, 0 30px 60px -28px rgba(33,30,24,.5),0 6px 16px -8px rgba(33,30,24,.22))",
        animation: floaty ? "dm-floaty 6s ease-in-out infinite" : "none",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 14px",
          background: "linear-gradient(#F7F5F1,#EBE9E2)",
          borderBottom: "1px solid #DCD8CE",
        }}
      >
        {dot("var(--dm-mac-red, #FF5F57)")}
        {dot("var(--dm-mac-yellow, #FEBC2E)")}
        {dot("var(--dm-mac-green, #28C840)")}
        {title && (
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#8F897B",
              pointerEvents: "none",
            }}
          >
            {title}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
