/* global React, ReactDOM */
const { useState } = React;
const DS = window.DatamodoDesignSystem_07247b;
const { Logo, Button, Input, Field, Card, Badge, DataTable, MacWindow } = DS;

const mono = "var(--dm-font-mono, monospace)";
const display = "var(--dm-font-display, sans-serif)";

/* ---------------------------------------------------------------- seed data */
const SHEETS = {
  Invoices: {
    count: 28,
    columns: [
      { key: "client", label: "Client", flex: "1.3fr" },
      { key: "invoice", label: "Invoice", mono: true, flex: "0.8fr" },
      { key: "amount", label: "Amount", mono: true, accent: true, flex: "0.8fr" },
      { key: "due", label: "Due", flex: "0.7fr" },
      { key: "status", label: "Status", flex: "0.9fr" },
    ],
    rows: [
      { cells: { client: "Northwind", invoice: "#A-198", amount: "$3,400", due: "Jul 20", status: { badge: "success", text: "Paid" } } },
      { cells: { client: "Globex", invoice: "#A-201", amount: "$8,750", due: "Jul 28", status: { badge: "warning", text: "Sent" } } },
      { cells: { client: "Acme Inc", invoice: "#A-204", amount: "$12,000", due: "Aug 1", status: { badge: "accent", text: "Approved" } }, highlight: true },
      { cells: { client: "Initech", invoice: "#A-205", amount: "$2,120", due: "Aug 4", status: { badge: "warning", text: "Sent" } } },
      { cells: { client: "Umbrella", invoice: "#A-206", amount: "$5,600", due: "Aug 9", status: { badge: "success", text: "Paid" } } },
    ],
  },
  Contacts: {
    count: 64,
    columns: [
      { key: "name", label: "Name", flex: "1.1fr" },
      { key: "email", label: "Email", mono: true, flex: "1.4fr" },
      { key: "company", label: "Company", flex: "1fr" },
      { key: "role", label: "Role", flex: "1fr" },
    ],
    rows: [
      { cells: { name: "Sarah Chen", email: "sarah@acme.com", company: "Acme Inc", role: "Ops Lead" } },
      { cells: { name: "Marcus Webb", email: "m.webb@globex.io", company: "Globex", role: "Founder" } },
      { cells: { name: "Dr. Lee", email: "lee@northwind.co", company: "Northwind", role: "Advisor" } },
      { cells: { name: "Priya Nair", email: "priya@initech.com", company: "Initech", role: "Finance" } },
    ],
  },
  Companies: {
    count: 19,
    columns: [
      { key: "name", label: "Company", flex: "1.1fr" },
      { key: "domain", label: "Domain", mono: true, flex: "1.2fr" },
      { key: "people", label: "People", mono: true, flex: "0.7fr" },
      { key: "open", label: "Open", mono: true, accent: true, flex: "0.8fr" },
    ],
    rows: [
      { cells: { name: "Acme Inc", domain: "acme.com", people: "6", open: "$12,000" }, highlight: true },
      { cells: { name: "Globex", domain: "globex.io", people: "3", open: "$8,750" } },
      { cells: { name: "Northwind", domain: "northwind.co", people: "4", open: "$0" } },
    ],
  },
  Receipts: {
    count: 112,
    columns: [
      { key: "vendor", label: "Vendor", flex: "1.1fr" },
      { key: "amount", label: "Amount", mono: true, accent: true, flex: "0.8fr" },
      { key: "date", label: "Date", flex: "0.8fr" },
      { key: "category", label: "Category", flex: "1fr" },
    ],
    rows: [
      { cells: { vendor: "Delta", amount: "$389.00", date: "Sep 14", category: "Travel" } },
      { cells: { vendor: "Uber", amount: "$18.00", date: "Sep 15", category: "Travel" } },
      { cells: { vendor: "Blue Bottle", amount: "$6.40", date: "Sep 15", category: "Food" } },
    ],
  },
  Trips: {
    count: 7,
    columns: [
      { key: "trip", label: "Trip", flex: "1.1fr" },
      { key: "spend", label: "Spend", mono: true, accent: true, flex: "0.8fr" },
      { key: "nights", label: "Nights", mono: true, flex: "0.6fr" },
      { key: "traveler", label: "Traveler", flex: "1fr" },
    ],
    rows: [
      { cells: { trip: "Lisbon", spend: "$1,120", nights: "4", traveler: "Alex Rivera" } },
      { cells: { trip: "Tahoe", spend: "$690", nights: "3", traveler: "Alex Rivera" } },
      { cells: { trip: "Tokyo", spend: "$3,240", nights: "9", traveler: "Alex Rivera" } },
    ],
  },
};
const SHEET_ORDER = ["Invoices", "Contacts", "Companies", "Receipts", "Trips"];

/* --------------------------------------------------------------- auth screen */
function Auth({ onSignIn }) {
  const [mode, setMode] = useState("login");
  const isLogin = mode === "login";
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, gap: 28, flexWrap: "wrap" }}>
      <div style={{ flex: "0 1 420px", minWidth: 340 }}>
        <div style={{ background: "var(--dm-canvas)", border: "1px solid var(--dm-border-2)", borderRadius: 22, overflow: "hidden", boxShadow: "var(--dm-shadow-modal)" }}>
          <div style={{ padding: "40px 40px 34px" }}>
            <div style={{ marginBottom: 34 }}><Logo /></div>
            <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: 30, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 0 8px" }}>
              {isLogin ? "Welcome back." : "Start your second brain."}
            </h2>
            <p style={{ fontSize: 15, color: "#6B665B", margin: "0 0 28px" }}>
              {isLogin ? "Sign in to your second brain." : "Free to try. No card needed."}
            </p>
            <Button variant="outline" style={{ width: "100%", background: "#fff", borderColor: "var(--dm-border-3)", fontWeight: 500, marginBottom: 18 }} onClick={onSignIn}>
              <img src="../../assets/logos/google-gmail.svg" alt="" style={{ height: 17 }} />
              {isLogin ? "Continue with Google" : "Sign up with Google"}
            </Button>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <span style={{ height: 1, flex: 1, background: "var(--dm-border-2)" }} />
              <span style={{ fontFamily: mono, fontSize: 11, color: "var(--dm-text-faint)" }}>or</span>
              <span style={{ height: 1, flex: 1, background: "var(--dm-border-2)" }} />
            </div>
            {!isLogin && (
              <Field label="Full name" style={{ marginBottom: 14 }}>
                <Input glyph="◔" defaultValue="Alex Rivera" />
              </Field>
            )}
            <Field label="Email" style={{ marginBottom: 16 }}>
              <Input glyph="✉" defaultValue="you@company.com" />
            </Field>
            <Field label="Password" trailing={isLogin ? <a href="#" style={{ fontSize: 12 }}>Forgot?</a> : null} style={{ marginBottom: 24 }}>
              <Input glyph="🔒" type="password" defaultValue="passwordvalue" />
            </Field>
            <Button style={{ width: "100%" }} onClick={onSignIn}>{isLogin ? "Sign in" : "Create account"}</Button>
            {!isLogin && <p style={{ fontSize: 11.5, color: "var(--dm-text-faint)", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>By continuing you agree to our Terms &amp; Privacy Policy.</p>}
          </div>
          <div style={{ padding: "16px 40px", borderTop: "1px solid var(--dm-border-2)", background: "#F0EBDE", textAlign: "center", fontSize: 13.5, color: "#6B665B" }}>
            {isLogin ? "New here? " : "Already have an account? "}
            <a href="#" style={{ fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setMode(isLogin ? "register" : "login"); }}>
              {isLogin ? "Create an account" : "Sign in"}
            </a>
          </div>
        </div>
      </div>
      {/* marketing aside */}
      <div style={{ flex: "0 1 320px", minWidth: 280, alignSelf: "stretch", display: "flex" }}>
        <div style={{ background: "var(--dm-ink)", color: "var(--dm-text-on-ink)", borderRadius: 22, padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 440, width: "100%" }}>
          <div>
            <div style={{ marginBottom: 28 }}><Logo dataSize={28} modoSize={20} onDark /></div>
            <h3 style={{ fontFamily: display, fontWeight: 700, fontSize: 28, letterSpacing: "-0.03em", lineHeight: 1.08, margin: "0 0 16px" }}>Forward the mess. Get back a spreadsheet.</h3>
            <p style={{ fontSize: 15, color: "var(--dm-text-on-ink-muted)", lineHeight: 1.6, margin: 0 }}>Your inbox already holds the data. datamodo just turns it into tables you can use.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
            {["Zero setup, zero formulas", "Private & encrypted", "Export anywhere"].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14, color: "#D8D0C1" }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: "var(--dm-ink-surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--dm-accent)" }}>✓</span>{t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dashboard */
function Dashboard({ onSignOut }) {
  const [active, setActive] = useState("Invoices");
  const sheet = SHEETS[active];
  return (
    <div style={{ minHeight: "100vh", padding: "40px 32px 80px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", background: "var(--dm-canvas)", border: "1px solid var(--dm-border-2)", borderRadius: 22, overflow: "hidden", boxShadow: "var(--dm-shadow-app)", display: "flex", minHeight: 680 }}>
        {/* sidebar */}
        <aside style={{ width: 248, flexShrink: 0, background: "var(--dm-ink)", color: "#C9C1B2", padding: "22px 16px", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "0 8px 22px" }}><Logo dataSize={26} modoSize={19} onDark /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--dm-ink-surface)", borderRadius: 11, padding: "10px 12px", color: "var(--dm-text-on-ink)", fontSize: 14, fontWeight: 500, marginBottom: 22, cursor: "pointer" }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: "var(--dm-accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>＋</span>New capture
          </div>
          <p style={{ fontFamily: mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--dm-text-on-ink-faint)", padding: "0 8px 8px", margin: 0 }}>Sheets</p>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {SHEET_ORDER.map((name) => {
              const on = name === active;
              return (
                <span key={name} onClick={() => setActive(name)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 10px", borderRadius: 9, cursor: "pointer", background: on ? "var(--dm-ink-surface)" : "transparent", color: on ? "var(--dm-text-on-ink)" : "var(--dm-text-on-ink-muted)", fontSize: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ color: on ? "var(--dm-accent)" : "inherit" }}>▦</span>{name}</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: on ? "var(--dm-text-muted)" : "var(--dm-text-on-ink-faint)" }}>{SHEETS[name].count}</span>
                </span>
              );
            })}
          </nav>
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: "1px solid var(--dm-ink-border)", cursor: "pointer" }} onClick={onSignOut}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--dm-accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>A</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--dm-text-on-ink)", fontWeight: 500 }}>Alex Rivera</div>
              <div style={{ fontFamily: mono, fontSize: 10.5, color: "var(--dm-text-on-ink-faint)" }}>Free plan</div>
            </div>
          </div>
        </aside>

        {/* main */}
        <main style={{ flex: 1, background: "var(--dm-surface-main)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* topbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px", borderBottom: "1px solid var(--dm-border)", background: "var(--dm-canvas)" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid var(--dm-border-2)", borderRadius: 11, padding: "10px 14px", maxWidth: 520 }}>
              <span style={{ color: "var(--dm-accent)" }}>✦</span>
              <input defaultValue="How much did I invoice Acme this quarter?" style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--dm-ink)", width: "100%", fontFamily: "var(--dm-font-body)" }} />
              <span style={{ fontFamily: mono, fontSize: 10.5, color: "var(--dm-text-faint)", border: "1px solid var(--dm-border-2)", borderRadius: 6, padding: "2px 6px" }}>Ask</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 12, color: "#6B665B", background: "#fff", border: "1px solid var(--dm-border-2)", borderRadius: 10, padding: "8px 12px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-success)" }} />u8x2@datamodo.in
            </div>
          </div>
          {/* content */}
          <div style={{ padding: 24, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 22 }}>
              <Stat label="Captured this week" value="231" />
              <Stat label="Open invoices" value="$41.2k" accent />
              <Stat label="Sheets" value="5" />
              <Stat label="Auto-linked" value="1,904" ink />
            </div>
            <div style={{ background: "#fff", border: "1px solid var(--dm-border)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: "1px solid var(--dm-border-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: display, fontWeight: 600, fontSize: 16 }}>{active}</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: "var(--dm-text-faint)" }}>{sheet.count} rows</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: "#6B665B", border: "1px solid var(--dm-border-2)", borderRadius: 8, padding: "5px 10px" }}>Filter</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: "#fff", background: "var(--dm-ink)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Export .xlsx</span>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 560 }}>
                  <DataTable columns={sheet.columns} rows={sheet.rows} />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, ink }) {
  return (
    <div style={{ background: ink ? "var(--dm-ink)" : "#fff", border: "1px solid " + (ink ? "var(--dm-ink)" : "var(--dm-border)"), borderRadius: 14, padding: 16, color: ink ? "var(--dm-text-on-ink)" : "inherit" }}>
      <div style={{ fontFamily: mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: ink ? "#9A9384" : "var(--dm-text-faint)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em", color: accent ? "var(--dm-accent)" : "inherit" }}>{value}</div>
    </div>
  );
}

/* -------------------------------------------------------------------- shell */
function App() {
  const [signedIn, setSignedIn] = useState(false);
  return signedIn ? <Dashboard onSignOut={() => setSignedIn(false)} /> : <Auth onSignIn={() => setSignedIn(true)} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
