/**
 * Instant dashboard skeleton. Next renders this the moment you navigate to
 * /dashboard, so you see the shell + placeholder content immediately while the
 * server component fetches agents/datasets/pending changes. Structure mirrors
 * the real ControlCenter shell so there's no layout jump when data arrives.
 */

const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
  width: w,
  height: h,
  borderRadius: radius,
  background: "#ECE5D8",
  animation: "cc-pulse 1.6s ease-in-out infinite",
});

const darkBlock = (w: number | string, h: number): React.CSSProperties => ({
  width: w,
  height: h,
  borderRadius: 8,
  background: "#2B2720",
  animation: "cc-pulse 1.6s ease-in-out infinite",
});

function Card() {
  return (
    <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ ...block(40, 40, 12) }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={block(120, 12)} />
          <div style={block(70, 9)} />
        </div>
      </div>
      <div style={block("100%", 10)} />
      <div style={block("80%", 10)} />
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <div style={block(60, 20, 999)} />
        <div style={block(40, 20, 999)} />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="dm-app">
      <div className="cc-shell" aria-busy="true" aria-label="Loading your workspace">
        {/* Sidebar skeleton */}
        <aside className="cc-side">
          <div style={{ padding: "2px 8px 22px" }}>
            <div style={darkBlock(120, 22)} />
          </div>
          <div style={{ ...darkBlock("100%", 40), marginBottom: 22 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2, 3].map((i) => <div key={i} style={darkBlock("100%", 34)} />)}
          </div>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={darkBlock("100%", 60)} />
            <div style={darkBlock("100%", 44)} />
          </div>
        </aside>

        {/* Main skeleton */}
        <main className="cc-main">
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 26px", borderBottom: "1px solid #E7E0D2", background: "#F6F2E9" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={block(140, 18)} />
              <div style={block(220, 11)} />
            </div>
            <div style={{ marginLeft: "auto" }}><div style={block(200, 34, 10)} /></div>
          </div>
          <div style={{ padding: "24px 26px" }}>
            <div style={{ ...block("100%", 64, 14), marginBottom: 24 }} />
            <div style={block(120, 14)} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(268px,1fr))", gap: 16, marginTop: 12 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <Card key={i} />)}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
