import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { signout } from "@/app/auth/actions";
import { Logo } from "@/components/logo";

type Sheet = { name: string; count: number; active?: boolean };
type Status = "Paid" | "Sent" | "Approved";
type Row = {
  n: number;
  client: string;
  invoice: string;
  amount: string;
  due: string;
  status: Status;
  highlight?: boolean;
};

const SHEETS: Sheet[] = [
  { name: "Invoices", count: 28, active: true },
  { name: "Contacts", count: 64 },
  { name: "Companies", count: 19 },
  { name: "Receipts", count: 112 },
  { name: "Trips", count: 7 },
];

const ROWS: Row[] = [
  { n: 1, client: "Northwind", invoice: "#A-198", amount: "$3,400", due: "Jul 20", status: "Paid" },
  { n: 2, client: "Globex", invoice: "#A-201", amount: "$8,750", due: "Jul 28", status: "Sent" },
  { n: 3, client: "Acme Inc", invoice: "#A-204", amount: "$12,000", due: "Aug 1", status: "Approved", highlight: true },
  { n: 4, client: "Initech", invoice: "#A-205", amount: "$2,120", due: "Aug 4", status: "Sent" },
];

const STATUS_STYLE: Record<Status, { color: string; bg: string }> = {
  Paid: { color: "#3F8F5B", bg: "#E4F0E8" },
  Sent: { color: "#B08A2E", bg: "#F6ECD4" },
  Approved: { color: "#E4593B", bg: "#FBE0D6" },
};

const rowGrid = {
  display: "grid",
  gridTemplateColumns: "28px 1.3fr 0.8fr 0.8fr 0.7fr 0.9fr",
  minWidth: 560,
} as const;

export default async function DashboardPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Best-effort: show the user's real forwarding inbox if the table exists.
  const { data: addrs } = await supabase
    .from("forwarding_addresses")
    .select("address")
    .limit(1);
  const inbox = addrs?.[0]?.address ?? "u8x2@datamodo.in";

  const fullName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    user?.email?.split("@")[0] ||
    "You";
  const initial = fullName.charAt(0).toUpperCase();

  return (
    <div className="dm-app-shell">
      {/* SIDEBAR */}
      <aside className="dm-side">
        <div style={{ padding: "0 8px 22px" }}>
          <Logo dataSize={26} modoSize={19} color="#F1ECE1" />
        </div>

        <button type="button" className="dm-side-new">
          <span className="plus">＋</span>New capture
        </button>

        <p className="dm-side-label">Sheets</p>
        <nav className="dm-side-nav">
          {SHEETS.map((s) => (
            <a
              key={s.name}
              href="#"
              className={`dm-sheet${s.active ? " active" : ""}`}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ color: s.active ? "var(--accent)" : "inherit" }}>▦</span>
                {s.name}
              </span>
              <span className="cnt">{s.count}</span>
            </a>
          ))}
        </nav>

        <div className="dm-side-foot">
          <span className="dm-avatar">{initial}</span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                color: "#F1ECE1",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {fullName}
            </div>
            <div
              className="dm-mono"
              style={{ fontSize: 10.5, color: "#7C766B" }}
            >
              Free plan
            </div>
          </div>
          <form action={signout} style={{ marginLeft: "auto" }}>
            <button type="submit" className="dm-signout" title="Sign out">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* MAIN */}
      <main className="dm-main">
        <div className="dm-topbar">
          <form className="dm-ask">
            <span style={{ color: "var(--accent)" }}>✦</span>
            <input
              type="text"
              name="q"
              placeholder="How much did I invoice Acme this quarter?"
              aria-label="Ask anything"
            />
            <span className="key">Ask</span>
          </form>
          <div className="dm-inbox">
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#3F8F5B" }}
            />
            {inbox}
          </div>
        </div>

        <div className="dm-content">
          {/* stat cards */}
          <div className="dm-stats">
            <div className="dm-stat">
              <div className="dm-stat-label">Captured this week</div>
              <div className="dm-stat-num">231</div>
            </div>
            <div className="dm-stat">
              <div className="dm-stat-label">Open invoices</div>
              <div className="dm-stat-num" style={{ color: "var(--accent)" }}>
                $41.2k
              </div>
            </div>
            <div className="dm-stat">
              <div className="dm-stat-label">Sheets</div>
              <div className="dm-stat-num">5</div>
            </div>
            <div className="dm-stat dark">
              <div className="dm-stat-label">Auto-linked</div>
              <div className="dm-stat-num">1,904</div>
            </div>
          </div>

          {/* table card */}
          <div className="dm-tablecard">
            <div className="dm-tablecard-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className="dm-display"
                  style={{ fontWeight: 600, fontSize: 16 }}
                >
                  Invoices
                </span>
                <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>
                  28 rows
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" className="dm-chip">
                  Filter
                </button>
                <button type="button" className="dm-chip dark">
                  Export CSV
                </button>
              </div>
            </div>

            <div className="dm-table-scroll">
              {/* header */}
              <div
                className="dm-mono"
                style={{
                  ...rowGrid,
                  background: "#FAF6EE",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  color: "#A39B8B",
                }}
              >
                <span style={{ padding: "9px 8px", borderRight: "1px solid #EFE9DC", textAlign: "center" }}>#</span>
                <span style={{ padding: "9px 12px", borderRight: "1px solid #EFE9DC" }}>Client</span>
                <span style={{ padding: "9px 12px", borderRight: "1px solid #EFE9DC" }}>Invoice</span>
                <span style={{ padding: "9px 12px", borderRight: "1px solid #EFE9DC" }}>Amount</span>
                <span style={{ padding: "9px 12px", borderRight: "1px solid #EFE9DC" }}>Due</span>
                <span style={{ padding: "9px 12px" }}>Status</span>
              </div>
              {/* rows */}
              {ROWS.map((r) => {
                const border = r.highlight ? "#F3D6CB" : "#F1EDE4";
                const cell = { padding: "11px 12px", borderRight: `1px solid ${border}` };
                const st = STATUS_STYLE[r.status];
                return (
                  <div
                    key={r.n}
                    style={{
                      ...rowGrid,
                      borderTop: `1px solid ${border}`,
                      color: r.highlight ? "#211E18" : "#57534A",
                      fontWeight: r.highlight ? 600 : 400,
                      ...(r.highlight
                        ? {
                            background: "#FDF1EC",
                            boxShadow: "inset 3px 0 0 var(--accent)",
                            animation: "dm-flash 6s ease-in-out infinite",
                          }
                        : {}),
                    }}
                  >
                    <span
                      style={{
                        padding: "11px 8px",
                        borderRight: `1px solid ${border}`,
                        textAlign: "center",
                        background: r.highlight ? "transparent" : "#FBFAF7",
                        color: r.highlight ? "var(--accent)" : "#A39B8B",
                        fontWeight: r.highlight ? 500 : 400,
                      }}
                    >
                      {r.n}
                    </span>
                    <span style={cell}>{r.client}</span>
                    <span className="dm-mono" style={cell}>
                      {r.invoice}
                    </span>
                    <span
                      className="dm-mono"
                      style={{ ...cell, color: r.highlight ? "var(--accent)" : undefined }}
                    >
                      {r.amount}
                    </span>
                    <span style={cell}>{r.due}</span>
                    <span style={{ padding: "11px 12px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          color: st.color,
                          background: st.bg,
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                      >
                        {r.status}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
