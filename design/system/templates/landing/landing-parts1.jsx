/* global React, ReactDOM */
const DS = window.DatamodoDesignSystem_07247b;
const { Logo, Button, Eyebrow, ChannelPill, MacWindow, DataTable, KnowledgeGraph, Marquee, SpotlightCard, RevealOnScroll } = DS;

const mono = "var(--dm-font-mono, monospace)";
const display = "var(--dm-font-display, sans-serif)";
const MAX = 1160;

const play = "running";

/* --------------------------------------------------------------------- nav */
function Nav() {
  const link = { color: "inherit", fontSize: 15 };
  return (
    <nav style={{ maxWidth: MAX, margin: "0 auto", padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo />
      <div style={{ display: "flex", alignItems: "center", gap: 26, color: "var(--dm-text-body)" }}>
        <a href="#how" style={link}>How it works</a>
        <a href="#control" style={link}>Stay in control</a>
        <a href="#uses" style={link}>Use cases</a>
        <a href="#brain" style={link}>Ask anything</a>
        <a href="#" style={link}>Log in</a>
        <Button variant="dark" size="sm" as="a" href="#cta">Get started</Button>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------- hero */
function Hero() {
  return (
    <header style={{ maxWidth: MAX, margin: "0 auto", padding: "84px 28px 40px", textAlign: "center" }}>
      <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(40px,5.8vw,66px)", lineHeight: 1.02, letterSpacing: "-0.035em", margin: "0 auto 24px", maxWidth: "15ch", textWrap: "balance" }}>
        Forward the mess. Get back a spreadsheet.
      </h1>
      <p style={{ fontSize: 18.5, color: "var(--dm-text-body)", maxWidth: "58ch", margin: "0 auto 34px", textWrap: "pretty" }}>
        The invoices, contacts, deal terms, files and to-dos that run your work are scattered across email, WhatsApp and Slack. Forward them to datamodo and get them back as clean tables and neatly filed folders — no assistant, no data entry, no formulas.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <Button size="lg" as="a" href="#cta">Get your inbox — free</Button>
        <Button variant="outline" size="lg" as="a" href="#how">See how it works</Button>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- hero demo */
/* An above-the-fold animated band: three messages arrive from three channels
   on the left and land as clean rows in a live table on the right. Loops. */
const HERO_IN = [
  { logo: "google-gmail", label: "Gmail", text: "Approving invoice #A-204 for $12,000 — Q3 retainer.", who: "Sarah · Acme Inc" },
  { logo: "whatsapp-icon", label: "WhatsApp", text: "Deal's done — $40k, net 30. Send the paperwork 🤝", who: "Priya · Northwind" },
  { logo: "slack-icon", label: "Slack", text: "New lead: Globex, intro'd by Dana. Follow up Fri.", who: "#deals" },
];
const HERO_ROWS = [
  { entity: "Acme Inc", type: "Company", value: "acme.co", accent: false },
  { entity: "#A-204", type: "Invoice", value: "$12,000", accent: true },
  { entity: "Northwind", type: "Deal", value: "$40,000", accent: true },
  { entity: "Globex", type: "Lead", value: "Fri follow-up", accent: false },
];
function HeroDemo() {
  return (
    <section style={{ maxWidth: 1000, margin: "8px auto 8px", padding: "0 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 42px minmax(280px,1.15fr)", gap: 0, alignItems: "center" }}>

        {/* incoming messages */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {HERO_IN.map((m, i) => (
            <div key={m.label} style={{ background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: "12px 14px", boxShadow: "var(--dm-shadow-card)", textAlign: "left", animation: `dm-loop-pop 9s ease-in-out ${i * 1.1}s infinite` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <img src={`../../assets/logos/${m.logo}.svg`} alt="" width="16" height="16" style={{ display: "block" }} />
                <span style={{ fontFamily: mono, fontSize: 11, color: "var(--dm-text-muted)" }}>{m.label}</span>
                <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: "var(--dm-text-faint)" }}>{m.who}</span>
              </div>
              <p style={{ fontSize: 13.5, color: "var(--dm-text-body)", lineHeight: 1.45 }}>{m.text}</p>
            </div>
          ))}
        </div>

        {/* flow arrow */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent)", opacity: 0.35, animation: `dm-pulse 1.8s ease-out ${i * 0.28}s infinite` }} />
          ))}
        </div>

        {/* extracted table */}
        <MacWindow title="datamodo — everything, sorted">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 13px", borderBottom: "1px solid #EFEBE2", background: "#FBFAF7" }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: "var(--dm-text-muted)" }}>▦ your data</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: "var(--dm-accent)", background: "var(--dm-accent-tint-2)", padding: "3px 8px", borderRadius: 999 }}>live</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.85fr 0.95fr", fontFamily: mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--dm-text-faint)", padding: "8px 14px", background: "var(--dm-surface-sunk)" }}>
            <span>Entity</span><span>Type</span><span style={{ textAlign: "right" }}>Value</span>
          </div>
          {HERO_ROWS.map((r, i) => (
            <div key={r.entity} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.85fr 0.95fr", alignItems: "center", fontSize: 13, padding: "10px 14px", borderTop: "1px solid #F1EDE4", animation: `dm-dropin 9s ease-in-out ${0.5 + i * 1.0}s infinite` }}>
              <span style={{ fontWeight: 600, fontFamily: r.entity.startsWith("#") ? mono : "inherit", color: "var(--dm-ink)" }}>{r.entity}</span>
              <span style={{ fontSize: 11.5, color: "var(--dm-text-muted)" }}>{r.type}</span>
              <span style={{ fontFamily: mono, fontSize: 12.5, textAlign: "right", color: r.accent ? "var(--dm-accent)" : "var(--dm-text-body-2)", fontWeight: r.accent ? 600 : 400 }}>{r.value}</span>
            </div>
          ))}
        </MacWindow>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- watch it work */
function StepHead({ n, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--dm-ink)", color: "var(--dm-canvas)", fontFamily: display, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
      <span style={{ fontFamily: display, fontWeight: 600, fontSize: 20, letterSpacing: "-0.02em" }}>{title}</span>
    </div>
  );
}
const stepCard = { background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 20, padding: 30, display: "flex", flexWrap: "wrap", gap: 32, alignItems: "center" };
const stepLeft = { flex: "1 1 220px", minWidth: 210 };
const stepRight = { flex: "1.6 1 380px", minWidth: 290 };
const stepP = { fontSize: 15, color: "var(--dm-text-body-2)", lineHeight: 1.6 };
const Arrow = () => <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}><span style={{ color: "#C9BFAC", fontSize: 26, lineHeight: 1 }}>↓</span></div>;

function WatchItWork() {
  return (
    <section style={{ maxWidth: MAX, margin: "0 auto", padding: "36px 28px 52px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto 40px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><Eyebrow dot={false} onDark>watch it work</Eyebrow></div>
        <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 16 }}>One email in. A connected brain out.</h2>
        <p style={{ fontSize: 17, color: "#57534A" }}>Follow a single email through datamodo — received and forwarded, linked and structured, then dropped exactly where it belongs.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 900, margin: "0 auto" }}>

        {/* step 1: email */}
        <div style={stepCard}>
          <div style={stepLeft}>
            <StepHead n="1" title="Received & forwarded" />
            <p style={stepP}>An email lands in your inbox — you just forward it to your datamodo address. That's the only step you ever do by hand.</p>
          </div>
          <div style={stepRight}>
            <MacWindow title="Inbox — Sarah Chen" floaty>
              <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "9px 16px", borderBottom: "1px solid #EFEBE2", background: "#FBFAF7", fontSize: 12, color: "#B4AE9F" }}>
                <span>Archive</span><span>Reply</span>
                <span style={{ color: "var(--dm-accent)", fontWeight: 600 }}>Forward ▸</span>
                <span style={{ marginLeft: "auto", fontFamily: mono }}>just now</span>
              </div>
              <div style={{ padding: "16px 18px 4px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                  <h4 style={{ fontFamily: display, fontWeight: 600, fontSize: 18, letterSpacing: "-0.02em", lineHeight: 1.25, color: "#1E1B16" }}>Re: Q3 retainer — invoice attached</h4>
                  <span style={{ fontSize: 18, color: "#E4B93F", lineHeight: 1, flexShrink: 0 }}>★</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--dm-accent)", color: "#FFF8F4", fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>S</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 14, flexWrap: "wrap" }}><b style={{ fontWeight: 600, color: "#1E1B16" }}>Sarah Chen</b><span style={{ color: "#9C9687", fontSize: 12.5, fontFamily: mono }}>sarah@acme.com</span></div>
                    <div style={{ fontSize: 12.5, color: "#9C9687" }}>to me</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: "12px 18px 18px", fontSize: 14.5, color: "#3F3B33", lineHeight: 1.62 }}>
                <p style={{ marginBottom: 10 }}>Hi — approving invoice <b style={{ color: "#1E1B16" }}>#A-204</b> for <b style={{ color: "#1E1B16" }}>$12,000</b> for the Q3 retainer.</p>
                <p style={{ marginBottom: 10 }}>Please send the final copy to <span style={{ fontFamily: mono, fontSize: 13, color: "#1E1B16" }}>accounts@acme.com</span>. Excited for phase two!</p>
                <p style={{ color: "#7B7568" }}>— Sarah, Acme Inc</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", borderTop: "1px solid #F0ECE3", background: "#FCFAF3", fontFamily: mono, fontSize: 11.5, color: "var(--dm-accent)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent)", animation: "dm-pulse 2.4s ease-out infinite" }} />forwarded to finance@u8x2.datamodo.in
              </div>
            </MacWindow>
          </div>
        </div>

        <Arrow />

        {/* step 2: graph */}
        <div style={stepCard}>
          <div style={stepLeft}>
            <StepHead n="2" title="Linked & structured" />
            <p style={stepP}>datamodo reads the message and maps out the people, companies, amounts and dates inside it — and works out exactly how they relate.</p>
          </div>
          <div style={stepRight}><KnowledgeGraph style={{ width: "100%" }} /></div>
        </div>

        <Arrow />

        {/* step 3: table */}
        <div style={stepCard}>
          <div style={stepLeft}>
            <StepHead n="3" title="Added where it belongs" />
            <p style={stepP}>Each concept becomes a row in the right sheet of your database. When no sheet fits yet, datamodo creates one automatically.</p>
          </div>
          <div style={stepRight}>
            <MacWindow title="datamodo — Invoices">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid #EFEBE2", background: "#FBFAF7" }}>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: "var(--dm-text-muted)" }}>▦ Invoices</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: "var(--dm-accent)", background: "var(--dm-accent-tint-3)", padding: "3px 9px", borderRadius: 999 }}>+ 1 row added</span>
              </div>
              <DataTable
                columns={[
                  { key: "client", label: "Client", flex: "1.3fr" },
                  { key: "invoice", label: "Invoice", mono: true, flex: "0.85fr" },
                  { key: "amount", label: "Amount", mono: true, accent: true, flex: "0.85fr" },
                  { key: "due", label: "Due", flex: "0.7fr" },
                  { key: "status", label: "Status", flex: "0.85fr" },
                ]}
                rows={[
                  { cells: { client: "Northwind", invoice: "#A-198", amount: "$3,400", due: "Jul 20", status: { badge: "success", text: "Paid" } } },
                  { cells: { client: "Globex", invoice: "#A-201", amount: "$8,750", due: "Jul 28", status: { badge: "warning", text: "Sent" } } },
                  { cells: { client: "Acme Inc", invoice: "#A-204", amount: "$12,000", due: "Aug 1", status: { badge: "accent", text: "Approved" } }, highlight: true },
                ]}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderTop: "1px solid #EFEBE2", background: "#F2F0EA" }}>
                {["Contacts", "Companies"].map((t) => <span key={t} style={{ fontFamily: mono, fontSize: 10.5, color: "var(--dm-text-muted)", background: "#FBFAF7", border: "1px solid #E4DDCE", padding: "3px 10px", borderRadius: 7 }}>{t}</span>)}
                <span style={{ fontFamily: mono, fontSize: 10.5, color: "var(--dm-accent)", fontWeight: 600, background: "var(--dm-accent-tint-2)", border: "1px solid var(--dm-accent-tint-border)", padding: "3px 10px", borderRadius: 7 }}>Invoices</span>
                <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, color: "var(--dm-success)", background: "var(--dm-success-bg)", padding: "3px 9px", borderRadius: 999 }}>Companies · new sheet</span>
              </div>
            </MacWindow>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- channels */
const CHANNELS = [
  ["google-gmail", "Gmail"], ["microsoft-outlook", "Outlook"], ["whatsapp-icon", "WhatsApp"],
  ["slack-icon", "Slack"], ["telegram", "Telegram"], ["imessage", "iMessage"], ["discord-icon", "Discord"],
];
function Channels() {
  return (
    <section style={{ maxWidth: MAX, margin: "0 auto", padding: "26px 28px 70px" }}>
      <p style={{ textAlign: "center", fontFamily: mono, fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--dm-text-muted)", marginBottom: 24 }}>works with everything you already use</p>
      <Marquee duration={34}>
        {CHANNELS.map(([f, l]) => <ChannelPill key={l} src={`../../assets/logos/${f}.svg`} label={l} />)}
      </Marquee>
    </section>
  );
}

/* -------------------------------------------------------------- how it works */
function How() {
  const cards = [
    ["1", "Forward it", "Send an email to your datamodo address, or drop the bot into a group chat. That's your only job.", true],
    ["2", "We make sense of it", "Everything is stored, read, categorized and linked — names, amounts, dates, people, topics all connected.", false],
    ["3", "Use the tables", "datamodo builds spreadsheets out of your stuff on its own, and answers questions with the receipts attached.", false],
  ];
  return (
    <section id="how" style={{ background: "var(--dm-ink)", color: "var(--dm-text-on-ink)" }}>
      <div style={{ maxWidth: MAX, margin: "0 auto", padding: "88px 28px" }}>
        <div style={{ maxWidth: 640, marginBottom: 52 }}>
          <div style={{ marginBottom: 16 }}><Eyebrow onDark>how it works</Eyebrow></div>
          <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 16 }}>Three steps. That's the whole thing.</h2>
          <p style={{ fontSize: 17, color: "var(--dm-text-on-ink-muted)", maxWidth: "52ch" }}>You do one — forwarding. datamodo does the other two, quietly, in the background, every time something new comes in.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 20 }}>
          {cards.map(([n, t, d, accent]) => (
            <SpotlightCard key={n} tone="ink" padding={28} radius={18} style={{ border: "1px solid var(--dm-ink-border)" }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: accent ? "var(--dm-accent)" : "var(--dm-ink-border)", color: accent ? "#FFF8F4" : "var(--dm-text-on-ink)", fontFamily: display, fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>{n}</div>
              <h3 style={{ fontFamily: display, fontWeight: 600, fontSize: 21, letterSpacing: "-0.02em", marginBottom: 9 }}>{t}</h3>
              <p style={{ fontSize: 15, color: "var(--dm-text-on-ink-muted)" }}>{d}</p>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------- everything links (constellation) */
const linkMono = { fontFamily: mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--dm-text-faint)", marginBottom: 6 };
/* pointer-following 3D tilt + coral gradient wrapper around a LinkedCard */
function GraphCard({ id, tone, gridColumn, children }) {
  const { LinkedCard } = DS;
  const [p, setP] = React.useState({ x: 0.5, y: 0.5, on: false });
  const move = (e) => { const r = e.currentTarget.getBoundingClientRect(); setP({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, on: true }); };
  const leave = () => setP((s) => ({ ...s, on: false }));
  return (
    <div onMouseMove={move} onMouseLeave={leave} style={{
      gridColumn, position: "relative", transformStyle: "preserve-3d",
      transform: p.on ? `perspective(720px) rotateX(${((0.5 - p.y) * 11).toFixed(2)}deg) rotateY(${((p.x - 0.5) * 13).toFixed(2)}deg) translateZ(6px)` : "perspective(720px) rotateX(0deg) rotateY(0deg)",
      transition: p.on ? "transform .12s ease-out" : "transform .45s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <LinkedCard id={id} tone={tone} lift={false} style={{ position: "relative", zIndex: 1 }}>{children}</LinkedCard>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, borderRadius: 16, pointerEvents: "none", zIndex: 2,
        background: `radial-gradient(circle at ${(p.x * 100).toFixed(1)}% ${(p.y * 100).toFixed(1)}%, rgba(228,89,59,0.32), rgba(228,89,59,0.07) 45%, rgba(228,89,59,0) 70%)`,
        opacity: p.on ? 1 : 0, transition: "opacity .2s ease",
      }} />
    </div>
  );
}
function EverythingLinks() {
  const { LinkedCards } = DS;
  return (
    <section style={{ background: "var(--dm-ink)", color: "var(--dm-text-on-ink)" }}>
      <div style={{ maxWidth: MAX, margin: "0 auto", padding: "88px 28px" }}>
        <div style={{ maxWidth: 640, marginBottom: 8 }}>
          <div style={{ marginBottom: 16 }}><Eyebrow onDark>everything connects</Eyebrow></div>
          <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 16 }}>One message. A dozen quiet connections.</h2>
          <p style={{ fontSize: 17, color: "var(--dm-text-on-ink-muted)", maxWidth: "52ch" }}>Every card is a real record datamodo pulled from a single forwarded email — and every line is a link it drew on its own. Hover any card to trace what it touches.</p>
        </div>
        <LinkedCards
          links={[["email","sarah"],["email","acme"],["email","inv"],["acme","sarah"],["acme","addr"],["inv","amt"],["inv","due"],["acme","inv"]]}
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "56px 40px", alignItems: "center", padding: "40px 4px 8px" }}
        >
          <GraphCard id="email" tone="accent" gridColumn="2 / 4">
            <div style={{ ...linkMono, color: "var(--dm-accent)" }}>forwarded email</div>
            <b style={{ fontFamily: display, fontSize: 16, letterSpacing: "-0.01em" }}>Re: Q3 retainer — invoice attached</b>
          </GraphCard>
          <GraphCard id="sarah" tone="ink"><div style={{ ...linkMono, color: "var(--dm-text-on-ink-faint)" }}>person</div><b style={{ fontSize: 14 }}>Sarah Chen</b></GraphCard>
          <GraphCard id="acme" tone="ink"><div style={{ ...linkMono, color: "var(--dm-text-on-ink-faint)" }}>company</div><b style={{ fontSize: 14 }}>Acme Inc</b></GraphCard>
          <GraphCard id="inv" tone="ink"><div style={{ ...linkMono, color: "var(--dm-text-on-ink-faint)" }}>invoice</div><b style={{ fontFamily: mono, fontSize: 13 }}>#A-204</b></GraphCard>
          <GraphCard id="addr" tone="ink"><div style={{ ...linkMono, color: "var(--dm-text-on-ink-faint)" }}>email</div><b style={{ fontFamily: mono, fontSize: 12.5 }}>accounts@acme.com</b></GraphCard>
          <GraphCard id="amt" tone="accent"><div style={{ ...linkMono, color: "var(--dm-accent)" }}>amount</div><b style={{ fontFamily: mono, fontSize: 14, color: "var(--dm-accent)" }}>$12,000</b></GraphCard>
          <GraphCard id="due" tone="ink"><div style={{ ...linkMono, color: "var(--dm-text-on-ink-faint)" }}>due date</div><b style={{ fontFamily: mono, fontSize: 13 }}>Aug 1</b></GraphCard>
        </LinkedCards>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- hidden value story */
/* One message is dense with data. Most of it is thrown away. datamodo lifts
   each fact out, keeps its meaning, and merges it into what you already have. */
function HiddenValue() {
  const hl = { background: "var(--dm-accent-tint-2)", color: "var(--dm-accent)", fontWeight: 600, padding: "0 3px", borderRadius: 4, fontFamily: mono, fontSize: "0.92em" };
  const dests = [
    { name: "Companies", exist: ["Northwind", "Globex"], add: "Acme Inc", d: 0.6 },
    { name: "Invoices", exist: ["#A-198 · $3,400"], add: "#A-204 · $12,000", d: 1.3, accent: true },
    { name: "Contacts", exist: ["Dana Okafor"], add: "Sarah Chen", d: 2.0 },
  ];
  return (
    <section style={{ maxWidth: MAX, margin: "0 auto", padding: "64px 28px 48px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto 44px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><Eyebrow>the cost of a full inbox</Eyebrow></div>
        <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 16 }}>Every message is data you're leaving on the table.</h2>
        <p style={{ fontSize: 17, color: "#57534A", textWrap: "pretty" }}>One email holds a company, a contact, an amount, a due date, a decision — often an attachment too. Multiply that by the hundreds sitting unread in your inbox and it's a whole business you can't search, sort or add up. datamodo lifts each fact out, keeps what it means, and files it next to everything related you already have — as rows in your tables <b style={{ color: "var(--dm-ink)", fontWeight: 600 }}>and</b> as documents in the right folders.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) 44px minmax(300px,1.05fr)", gap: 0, alignItems: "center", maxWidth: 940, margin: "0 auto" }}>
        {/* the message, with its data highlighted */}
        <MacWindow title="Inbox — one ordinary email">
          <div style={{ padding: "16px 18px", fontSize: 14.5, color: "#3F3B33", lineHeight: 1.7 }}>
            <p style={{ marginBottom: 10 }}>Hi — approving invoice <span style={hl}>#A-204</span> for <span style={hl}>$12,000</span>, due <span style={hl}>Aug 1</span>.</p>
            <p style={{ marginBottom: 10 }}>It's for the Q3 retainer with <span style={hl}>Acme Inc</span>. Send the final copy to <span style={hl}>accounts@acme.com</span> — thanks!</p>
            <p style={{ color: "#7B7568" }}>— <span style={hl}>Sarah Chen</span>, Acme Inc</p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12, background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 8, padding: "6px 10px", fontFamily: mono, fontSize: 12, color: "var(--dm-text-body-2)" }}>
              <span style={{ color: "var(--dm-accent)" }}>▤</span> Acme_retainer_Q3.pdf
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderTop: "1px solid #F0ECE3", background: "#FCFAF3", fontFamily: mono, fontSize: 11, color: "var(--dm-text-muted)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent)" }} />6 facts + 1 file · 0 typed by you
          </div>
        </MacWindow>

        {/* flow */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent)", opacity: 0.35, animation: `dm-pulse 1.8s ease-out ${i * 0.28}s infinite` }} />)}
        </div>

        {/* merged into what you already have */}
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {dests.map((t) => (
            <div key={t.name} style={{ background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 13, padding: "11px 13px", boxShadow: "var(--dm-shadow-card)" }}>
              <div style={{ fontFamily: mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--dm-text-faint)", marginBottom: 8 }}>▦ {t.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {t.exist.map((e) => <span key={e} style={{ fontFamily: mono, fontSize: 11.5, background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 7, padding: "3px 8px", color: "var(--dm-text-body-2)" }}>{e}</span>)}
                <span style={{ fontFamily: mono, fontSize: 11.5, background: t.accent ? "var(--dm-accent-tint-2)" : "var(--dm-accent-tint)", border: "1px solid var(--dm-accent-tint-border)", borderRadius: 7, padding: "3px 8px", color: "var(--dm-accent)", fontWeight: 600, animation: `dm-dropin 8s ease-in-out ${t.d}s infinite` }}>+ {t.add}</span>
              </div>
            </div>
          ))}
          {/* files → folders, grouped by client */}
          <div style={{ background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 13, padding: "11px 13px", boxShadow: "var(--dm-shadow-card)" }}>
            <div style={{ fontFamily: mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--dm-text-faint)", marginBottom: 8 }}>🗀 Files · Acme Inc</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["MSA_2025.pdf", "Q2_invoice.pdf"].map((e) => <span key={e} style={{ fontFamily: mono, fontSize: 11.5, background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 7, padding: "3px 8px", color: "var(--dm-text-body-2)" }}>▤ {e}</span>)}
              <span style={{ fontFamily: mono, fontSize: 11.5, background: "var(--dm-accent-tint)", border: "1px solid var(--dm-accent-tint-border)", borderRadius: 7, padding: "3px 8px", color: "var(--dm-accent)", fontWeight: 600, animation: "dm-dropin 8s ease-in-out 2.6s infinite" }}>▤ Acme_retainer_Q3.pdf</span>
            </div>
          </div>
          <p style={{ fontFamily: mono, fontSize: 11, color: "var(--dm-text-faint)", marginTop: 2 }}>↳ rows in your tables, files in the right folders — context kept</p>
        </div>
      </div>

      {/* the contrast */}
      <div style={{ maxWidth: 640, margin: "40px auto 0", textAlign: "center", fontSize: 15.5, color: "var(--dm-text-body-2)" }}>
        Left in your inbox, that same email is <span style={{ textDecoration: "line-through", textDecorationColor: "var(--dm-mac-red)", color: "var(--dm-text-faint)" }}>unsearchable, unaddable, invisible in every report</span> — value you paid to receive and never got to use.
      </div>
    </section>
  );
}

window.LandingParts1 = { Nav, Hero, HeroDemo, HiddenValue, WatchItWork, Channels, How, EverythingLinks };
