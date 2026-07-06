/**
 * The datamodo wordmark: "data" in a handwritten script (Caveat, rotated) that
 * flows into "modo" in clean display type (Bricolage) — messy handwriting →
 * clean type, mirroring messy data → clean data. Pure text, never an image.
 */
export function Logo({
  dataSize = 30,
  modoSize = 21,
  color = "#211E18",
}: {
  dataSize?: number;
  modoSize?: number;
  color?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline" }}>
      <span
        className="dm-script"
        style={{
          fontWeight: 700,
          fontSize: dataSize,
          lineHeight: 1,
          color,
          display: "inline-block",
          transform: "rotate(-4deg)",
          marginRight: 1,
        }}
      >
        data
      </span>
      <span
        className="dm-display"
        style={{
          fontWeight: 700,
          fontSize: modoSize,
          letterSpacing: "-0.03em",
          color,
        }}
      >
        modo
      </span>
    </span>
  );
}
