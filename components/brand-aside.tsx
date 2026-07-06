import { Logo } from "@/components/logo";

/** Dark marketing panel shown beside the auth card on wide screens. */
export function BrandAside() {
  const bullets = [
    "Zero setup, zero formulas",
    "Private & encrypted",
    "Export anywhere",
  ];
  return (
    <aside className="dm-auth-aside">
      <div>
        <div style={{ marginBottom: 28 }}>
          <Logo dataSize={28} modoSize={20} color="#F1ECE1" />
        </div>
        <h3
          className="dm-display"
          style={{
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: "-0.03em",
            lineHeight: 1.08,
            marginBottom: 16,
          }}
        >
          Forward the mess. Get back a spreadsheet.
        </h3>
        <p style={{ fontSize: 15, color: "#B7AF9F", lineHeight: 1.6 }}>
          Your inbox already holds the data. datamodo just turns it into tables
          you can use.
        </p>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginTop: 28,
        }}
      >
        {bullets.map((b) => (
          <div
            key={b}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              fontSize: 14,
              color: "#D8D0C1",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: "#2B2720",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "var(--accent)",
                flexShrink: 0,
              }}
            >
              ✓
            </span>
            {b}
          </div>
        ))}
      </div>
    </aside>
  );
}
