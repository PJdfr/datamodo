import type { CSSProperties } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = {
  title: "datamodo — Forward the mess. Get back a spreadsheet.",
  description:
    "Emails, group chats, receipts, screenshots — forward any of it to datamodo and watch it turn itself into clean, organized tables you can actually use. No formulas. No setup.",
};

/* ---- shared bits ---------------------------------------------------- */

const trafficLight: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  boxShadow: "inset 0 0 0 .5px rgba(0,0,0,.14)",
};

const macTitleBar: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 14px",
  background: "linear-gradient(#F7F5F1,#EBE9E2)",
  borderBottom: "1px solid #DCD8CE",
};

const macTitle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  textAlign: "center",
  fontSize: 12.5,
  fontWeight: 600,
  color: "#8F897B",
  pointerEvents: "none",
};

const eyebrow: CSSProperties = {
  fontSize: 12.5,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--accent)",
  marginBottom: 16,
};

const stepBadge: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 9,
  background: "#211E18",
  color: "#F6F2E9",
  fontWeight: 700,
  fontSize: 15,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const cardCol: CSSProperties = { flex: "1 1 220px", minWidth: 210 };
const visualCol: CSSProperties = { flex: "1.6 1 380px", minWidth: 290 };

const flowCard: CSSProperties = {
  background: "#FFFDF8",
  border: "1px solid #E7E0D2",
  borderRadius: 20,
  padding: 30,
  display: "flex",
  flexWrap: "wrap",
  gap: 32,
  alignItems: "center",
};

const stepTitle: CSSProperties = {
  fontWeight: 600,
  fontSize: 20,
  letterSpacing: "-0.02em",
};

const stepDesc: CSSProperties = {
  fontSize: 15,
  color: "#57534A",
  lineHeight: 1.6,
};

function DownArrow() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
      <span style={{ color: "#C9BFAC", fontSize: 26, lineHeight: 1 }}>↓</span>
    </div>
  );
}

const th: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "#A39B8B",
};

const invoiceGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "26px 1.3fr 0.85fr 0.85fr 0.7fr 0.85fr",
  minWidth: 340,
};

const channels: { src: string; label: string }[] = [
  { src: "/logos/google-gmail.svg", label: "Gmail" },
  { src: "/logos/microsoft-outlook.svg", label: "Outlook" },
  { src: "/logos/whatsapp-icon.svg", label: "WhatsApp" },
  { src: "/logos/slack-icon.svg", label: "Slack" },
  { src: "/logos/telegram.svg", label: "Telegram" },
  { src: "/logos/imessage.svg", label: "iMessage" },
  { src: "/logos/discord-icon.svg", label: "Discord" },
];

const channelPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  fontSize: 14,
  fontWeight: 500,
  color: "#57534A",
  background: "#FFFDF8",
  border: "1px solid #E7E0D2",
  padding: "9px 16px",
  borderRadius: 999,
};

const darkCard: CSSProperties = {
  background: "#2B2720",
  border: "1px solid #3A352C",
  borderRadius: 18,
  padding: 28,
};

const sectionEyebrow: CSSProperties = {
  fontSize: 12.5,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--accent)",
  marginBottom: 16,
};

const h2: CSSProperties = {
  fontWeight: 700,
  fontSize: "clamp(30px,4vw,44px)",
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  marginBottom: 16,
};

const useCaseRow = (reverse = false): CSSProperties => ({
  display: "flex",
  gap: 48,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 84,
  ...(reverse ? { flexDirection: "row-reverse" } : {}),
});

const useCaseKicker: CSSProperties = {
  fontSize: 12,
  color: "#A39B8B",
  marginBottom: 12,
};

const useCaseH3: CSSProperties = {
  fontWeight: 600,
  fontSize: 29,
  letterSpacing: "-0.025em",
  lineHeight: 1.1,
  marginBottom: 14,
};

const useCaseBody: CSSProperties = {
  fontSize: 16.5,
  color: "#57534A",
  maxWidth: "44ch",
};

const demoCard: CSSProperties = {
  background: "#FFFDF8",
  border: "1px solid #E7E0D2",
  borderRadius: 18,
  boxShadow: "0 18px 44px -30px rgba(33,30,24,.35)",
};

const fieldTile = (accent = false): CSSProperties => ({
  background: accent ? "#FDF1EC" : "#FAF6EE",
  border: `1px solid ${accent ? "#F3D6CB" : "#EFE9DC"}`,
  borderRadius: 11,
  padding: 12,
});

const fieldLabel: CSSProperties = {
  fontSize: 10.5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#A39B8B",
  marginBottom: 5,
};

const chatBubble: CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: "76%",
  background: "#F1ECE2",
  borderRadius: "14px 14px 14px 4px",
  padding: "9px 13px",
  fontSize: 13.5,
};

/* ---- page ----------------------------------------------------------- */

export default function Home() {
  return (
    <main className="dm-landing">
      {/* NAV */}
      <nav
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          padding: "22px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Logo />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 26,
            fontSize: 15,
            color: "#514C43",
          }}
        >
          <span className="dm-nav-secondary" style={{ display: "contents" }}>
            <a href="#how" className="dm-link">
              How it works
            </a>
            <a href="#uses" className="dm-link">
              Use cases
            </a>
            <a href="#brain" className="dm-link">
              Ask anything
            </a>
          </span>
          <Link href="/login" className="dm-link">
            Log in
          </Link>
          <Link
            href="/register"
            className="dm-btn dm-btn-dark"
            style={{ fontSize: 14, padding: "10px 18px", borderRadius: 11 }}
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <header
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          padding: "64px 28px 8px",
          textAlign: "center",
        }}
      >
        <div
          className="dm-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--accent)",
            background: "#FBEAE3",
            border: "1px solid #F3D6CB",
            padding: "6px 12px",
            borderRadius: 999,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
          messy in, organized out — with zero effort
        </div>
        <h1
          className="dm-display"
          style={{
            fontWeight: 700,
            fontSize: "clamp(38px,5.6vw,64px)",
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            margin: "0 auto 22px",
            maxWidth: "15ch",
            textWrap: "balance",
          }}
        >
          Forward the mess. Get back a spreadsheet.
        </h1>
        <p
          style={{
            fontSize: 18.5,
            color: "#514C43",
            maxWidth: "56ch",
            margin: "0 auto 32px",
            textWrap: "pretty",
          }}
        >
          Emails, group chats, receipts, screenshots — send any of it to datamodo
          and watch it turn itself into clean, organized tables you can actually
          use. No formulas. No setup.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Link
            href="/register"
            className="dm-btn dm-btn-accent"
            style={{
              fontSize: 16,
              padding: "15px 26px",
              borderRadius: 13,
              boxShadow: "0 6px 18px rgba(228,89,59,.28)",
            }}
          >
            Get your inbox — free
          </Link>
          <a
            href="#uses"
            className="dm-btn dm-btn-outline"
            style={{ fontSize: 16, padding: "15px 22px", borderRadius: 13 }}
          >
            See it in action
          </a>
        </div>
        <p
          className="dm-mono"
          style={{ fontSize: 12.5, color: "#8A8477", marginTop: 20 }}
        >
          no card · works with the apps you already use
        </p>
      </header>

      {/* WATCH IT WORK */}
      <section
        style={{ maxWidth: 1160, margin: "0 auto", padding: "36px 28px 52px" }}
      >
        <div style={{ maxWidth: 620, margin: "0 auto 40px", textAlign: "center" }}>
          <p className="dm-mono" style={{ ...eyebrow }}>
            watch it work
          </p>
          <h2 className="dm-display" style={h2}>
            One email in. A connected brain out.
          </h2>
          <p style={{ fontSize: 17, color: "#57534A" }}>
            Follow a single email through datamodo — received and forwarded,
            linked and structured, then dropped exactly where it belongs.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 900,
            margin: "0 auto",
          }}
        >
          {/* STEP 1 — macOS Mail window */}
          <div className="dm-flow-card" style={flowCard}>
            <div className="dm-fluid" style={cardCol}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  marginBottom: 12,
                }}
              >
                <span className="dm-display" style={stepBadge}>
                  1
                </span>
                <span className="dm-display" style={stepTitle}>
                  Received &amp; forwarded
                </span>
              </div>
              <p style={stepDesc}>
                An email lands in your inbox — you just forward it to your
                datamodo address. That&apos;s the only step you ever do by hand.
              </p>
            </div>
            <div className="dm-fluid" style={visualCol}>
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid #DEDAD0",
                  background: "#fff",
                  boxShadow:
                    "0 30px 60px -28px rgba(33,30,24,.5),0 6px 16px -8px rgba(33,30,24,.22)",
                  animation: "dm-floaty 6s ease-in-out infinite",
                }}
              >
                <div style={macTitleBar}>
                  <span style={{ ...trafficLight, background: "#FF5F57" }} />
                  <span style={{ ...trafficLight, background: "#FEBC2E" }} />
                  <span style={{ ...trafficLight, background: "#28C840" }} />
                  <span style={macTitle}>Inbox — Sarah Chen</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    padding: "9px 16px",
                    borderBottom: "1px solid #EFEBE2",
                    background: "#FBFAF7",
                    fontSize: 12,
                    color: "#B4AE9F",
                  }}
                >
                  <span>Archive</span>
                  <span>Reply</span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                    Forward ▸
                  </span>
                  <span className="dm-mono" style={{ marginLeft: "auto" }}>
                    just now
                  </span>
                </div>
                <div style={{ padding: "16px 18px 4px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <h4
                      className="dm-display"
                      style={{
                        fontWeight: 600,
                        fontSize: 18,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.25,
                        color: "#1E1B16",
                      }}
                    >
                      Re: Q3 retainer — invoice attached
                    </h4>
                    <span
                      style={{ fontSize: 18, color: "#E4B93F", lineHeight: 1, flexShrink: 0 }}
                    >
                      ★
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        color: "#FFF8F4",
                        fontWeight: 600,
                        fontSize: 15,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      S
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 6,
                          fontSize: 14,
                          flexWrap: "wrap",
                        }}
                      >
                        <b style={{ fontWeight: 600, color: "#1E1B16" }}>Sarah Chen</b>
                        <span
                          className="dm-mono"
                          style={{ color: "#9C9687", fontSize: 12.5 }}
                        >
                          sarah@acme.com
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#9C9687" }}>to me</div>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px 18px 18px",
                    fontSize: 14.5,
                    color: "#3F3B33",
                    lineHeight: 1.62,
                  }}
                >
                  <p style={{ marginBottom: 10 }}>
                    Hi — approving invoice{" "}
                    <b style={{ color: "#1E1B16" }}>#A-204</b> for{" "}
                    <b style={{ color: "#1E1B16" }}>$12,000</b> for the Q3 retainer.
                  </p>
                  <p style={{ marginBottom: 10 }}>
                    Please send the final copy to{" "}
                    <span
                      className="dm-mono"
                      style={{ fontSize: 13, color: "#1E1B16" }}
                    >
                      accounts@acme.com
                    </span>
                    . Excited for phase two!
                  </p>
                  <p style={{ color: "#7B7568" }}>— Sarah, Acme Inc</p>
                </div>
                <div
                  className="dm-mono"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "11px 18px",
                    borderTop: "1px solid #F0ECE3",
                    background: "#FCFAF3",
                    fontSize: 11.5,
                    color: "var(--accent)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      animation: "dm-pulse 2.4s ease-out infinite",
                    }}
                  />
                  forwarded to finance@u8x2.datamodo.in
                </div>
              </div>
            </div>
          </div>

          <DownArrow />

          {/* STEP 2 — concept graph */}
          <div className="dm-flow-card" style={flowCard}>
            <div className="dm-fluid" style={cardCol}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  marginBottom: 12,
                }}
              >
                <span className="dm-display" style={stepBadge}>
                  2
                </span>
                <span className="dm-display" style={stepTitle}>
                  Linked &amp; structured
                </span>
              </div>
              <p style={stepDesc}>
                datamodo reads the message and maps out the people, companies,
                amounts and dates inside it — and works out exactly how they
                relate.
              </p>
            </div>
            <div className="dm-fluid" style={visualCol}>
              <div
                className="dm-graph"
                style={{
                  position: "relative",
                  width: "100%",
                  height: 280,
                  background: "#FFFFFF",
                  border: "1px solid #EFE9DC",
                  borderRadius: 14,
                }}
              >
                <svg
                  viewBox="0 0 300 250"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    overflow: "visible",
                  }}
                >
                  <g
                    fill="none"
                    stroke="#D8CDB9"
                    strokeWidth="1.5"
                    strokeDasharray="320"
                  >
                    <path
                      d="M58,48 L150,125"
                      style={{ animation: "dm-draw 10s ease-in-out .2s infinite" }}
                    />
                    <path
                      d="M245,58 L150,125"
                      style={{ animation: "dm-draw 10s ease-in-out .9s infinite" }}
                    />
                    <path
                      d="M58,200 L150,125"
                      style={{ animation: "dm-draw 10s ease-in-out 1.5s infinite" }}
                    />
                    <path
                      d="M58,200 L245,196"
                      style={{ animation: "dm-draw 10s ease-in-out 2.1s infinite" }}
                    />
                  </g>
                </svg>
                {[
                  { left: "33%", top: "26%", text: "works at" },
                  { left: "68%", top: "30%", text: "billing" },
                  { left: "31%", top: "70%", text: "billed to" },
                  { left: "50%", top: "88%", text: "amount" },
                ].map((e) => (
                  <span
                    key={e.text}
                    className="dm-mono dm-edge"
                    style={{
                      position: "absolute",
                      left: e.left,
                      top: e.top,
                      transform: "translate(-50%,-50%)",
                      fontSize: 9,
                      color: "#A39B8B",
                      background: "#FFFFFF",
                      padding: "0 3px",
                    }}
                  >
                    {e.text}
                  </span>
                ))}
                {/* nodes */}
                <span
                  className="dm-node"
                  style={{
                    position: "absolute",
                    left: "19%",
                    top: "19%",
                    transform: "translate(-50%,-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "#FFFFFF",
                    border: "1px solid #E7E0D2",
                    borderRadius: 999,
                    padding: "5px 10px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px -6px rgba(33,30,24,.3)",
                    animation: "dm-nodein 10s ease-in-out .1s infinite",
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "#3F8F5B" }}
                  />
                  Sarah Chen
                </span>
                <span
                  className="dm-node"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%,-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "#FDF1EC",
                    border: "1px solid #F3D6CB",
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    boxShadow: "0 6px 16px -6px rgba(228,89,59,.4)",
                    animation: "dm-nodein 10s ease-in-out .5s infinite",
                  }}
                >
                  <span
                    style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }}
                  />
                  Acme Inc
                </span>
                <span
                  className="dm-mono dm-node dm-node-r"
                  style={{
                    position: "absolute",
                    left: "82%",
                    top: "23%",
                    transform: "translate(-50%,-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "#FFFFFF",
                    border: "1px solid #E7E0D2",
                    borderRadius: 999,
                    padding: "5px 10px",
                    fontSize: 10.5,
                    whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px -6px rgba(33,30,24,.3)",
                    animation: "dm-nodein 10s ease-in-out .9s infinite",
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "#8A8477" }}
                  />
                  accounts@acme.com
                </span>
                <span
                  className="dm-mono dm-node"
                  style={{
                    position: "absolute",
                    left: "19%",
                    top: "80%",
                    transform: "translate(-50%,-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "#FFFFFF",
                    border: "1px solid #E7E0D2",
                    borderRadius: 999,
                    padding: "5px 10px",
                    fontSize: 11,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px -6px rgba(33,30,24,.3)",
                    animation: "dm-nodein 10s ease-in-out 1.3s infinite",
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "#3F8F5B" }}
                  />
                  #A-204
                </span>
                <span
                  className="dm-mono dm-node dm-node-r"
                  style={{
                    position: "absolute",
                    left: "82%",
                    top: "78%",
                    transform: "translate(-50%,-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "#FFFFFF",
                    border: "1px solid #E7E0D2",
                    borderRadius: 999,
                    padding: "5px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--accent)",
                    whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px -6px rgba(33,30,24,.3)",
                    animation: "dm-nodein 10s ease-in-out 1.7s infinite",
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }}
                  />
                  $12,000
                </span>
              </div>
            </div>
          </div>

          <DownArrow />

          {/* STEP 3 — spreadsheet / DB */}
          <div className="dm-flow-card" style={flowCard}>
            <div className="dm-fluid" style={cardCol}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  marginBottom: 12,
                }}
              >
                <span className="dm-display" style={stepBadge}>
                  3
                </span>
                <span className="dm-display" style={stepTitle}>
                  Added where it belongs
                </span>
              </div>
              <p style={stepDesc}>
                Each concept becomes a row in the right sheet of your database.
                When no sheet fits yet, datamodo creates one automatically.
              </p>
            </div>
            <div className="dm-fluid" style={visualCol}>
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid #DEDAD0",
                  background: "#fff",
                  boxShadow:
                    "0 30px 60px -28px rgba(33,30,24,.5),0 6px 16px -8px rgba(33,30,24,.22)",
                }}
              >
                <div style={macTitleBar}>
                  <span style={{ ...trafficLight, background: "#FF5F57" }} />
                  <span style={{ ...trafficLight, background: "#FEBC2E" }} />
                  <span style={{ ...trafficLight, background: "#28C840" }} />
                  <span style={macTitle}>datamodo — Invoices</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 14px",
                    borderBottom: "1px solid #EFEBE2",
                    background: "#FBFAF7",
                  }}
                >
                  <span className="dm-mono" style={{ fontSize: 11.5, color: "#8A8477" }}>
                    ▦ Invoices
                  </span>
                  <span
                    className="dm-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--accent)",
                      background: "#FBE0D6",
                      padding: "3px 9px",
                      borderRadius: 999,
                    }}
                  >
                    + 1 row added
                  </span>
                </div>
                <div style={{ fontSize: 12.5, overflowX: "auto" }}>
                  <div
                    className="dm-mono"
                    style={{ ...invoiceGrid, background: "#F6F4EF", ...th }}
                  >
                    <span
                      style={{ padding: "7px 8px", borderRight: "1px solid #EFE9DC", textAlign: "center" }}
                    >
                      #
                    </span>
                    <span style={{ padding: "7px 10px", borderRight: "1px solid #EFE9DC" }}>
                      Client
                    </span>
                    <span style={{ padding: "7px 10px", borderRight: "1px solid #EFE9DC" }}>
                      Invoice
                    </span>
                    <span style={{ padding: "7px 10px", borderRight: "1px solid #EFE9DC" }}>
                      Amount
                    </span>
                    <span style={{ padding: "7px 10px", borderRight: "1px solid #EFE9DC" }}>
                      Due
                    </span>
                    <span style={{ padding: "7px 10px" }}>Status</span>
                  </div>
                  {/* row 1 */}
                  <div style={{ ...invoiceGrid, borderTop: "1px solid #F1EDE4", color: "#8A8477" }}>
                    <span
                      style={{ padding: "9px 8px", borderRight: "1px solid #F1EDE4", textAlign: "center", background: "#FBFAF7" }}
                    >
                      1
                    </span>
                    <span style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}>
                      Northwind
                    </span>
                    <span
                      className="dm-mono"
                      style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}
                    >
                      #A-198
                    </span>
                    <span
                      className="dm-mono"
                      style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}
                    >
                      $3,400
                    </span>
                    <span style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}>
                      Jul 20
                    </span>
                    <span style={{ padding: "9px 10px", color: "#3F8F5B" }}>Paid</span>
                  </div>
                  {/* row 2 */}
                  <div style={{ ...invoiceGrid, borderTop: "1px solid #F1EDE4", color: "#8A8477" }}>
                    <span
                      style={{ padding: "9px 8px", borderRight: "1px solid #F1EDE4", textAlign: "center", background: "#FBFAF7" }}
                    >
                      2
                    </span>
                    <span style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}>
                      Globex
                    </span>
                    <span
                      className="dm-mono"
                      style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}
                    >
                      #A-201
                    </span>
                    <span
                      className="dm-mono"
                      style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}
                    >
                      $8,750
                    </span>
                    <span style={{ padding: "9px 10px", borderRight: "1px solid #F1EDE4" }}>
                      Jul 28
                    </span>
                    <span style={{ padding: "9px 10px", color: "#B08A2E" }}>Sent</span>
                  </div>
                  {/* row 3 — new highlighted */}
                  <div
                    style={{
                      ...invoiceGrid,
                      borderTop: "1px solid #F3D6CB",
                      fontWeight: 600,
                      color: "#211E18",
                      boxShadow: "inset 3px 0 0 var(--accent)",
                      animation:
                        "dm-dropin 10s ease-in-out .4s infinite, dm-flash 10s ease-in-out .4s infinite",
                    }}
                  >
                    <span
                      style={{ padding: "10px 8px", borderRight: "1px solid #F3D6CB", textAlign: "center", fontWeight: 500, color: "var(--accent)" }}
                    >
                      3
                    </span>
                    <span style={{ padding: "10px 10px", borderRight: "1px solid #F3D6CB" }}>
                      Acme Inc
                    </span>
                    <span
                      className="dm-mono"
                      style={{ padding: "10px 10px", borderRight: "1px solid #F3D6CB" }}
                    >
                      #A-204
                    </span>
                    <span
                      className="dm-mono"
                      style={{ padding: "10px 10px", borderRight: "1px solid #F3D6CB", color: "var(--accent)" }}
                    >
                      $12,000
                    </span>
                    <span style={{ padding: "10px 10px", borderRight: "1px solid #F3D6CB" }}>
                      Aug 1
                    </span>
                    <span style={{ padding: "10px 10px", color: "var(--accent)" }}>
                      Approved
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderTop: "1px solid #EFEBE2",
                    background: "#F2F0EA",
                  }}
                >
                  {["Contacts", "Companies"].map((t) => (
                    <span
                      key={t}
                      className="dm-mono"
                      style={{
                        fontSize: 10.5,
                        color: "#8A8477",
                        background: "#FBFAF7",
                        border: "1px solid #E4DDCE",
                        padding: "3px 10px",
                        borderRadius: 7,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                  <span
                    className="dm-mono"
                    style={{
                      fontSize: 10.5,
                      color: "var(--accent)",
                      fontWeight: 600,
                      background: "#FDF1EC",
                      border: "1px solid #F3D6CB",
                      padding: "3px 10px",
                      borderRadius: 7,
                    }}
                  >
                    Invoices
                  </span>
                  <span
                    className="dm-mono"
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: "#3F8F5B",
                      background: "#E4F0E8",
                      padding: "3px 9px",
                      borderRadius: 999,
                    }}
                  >
                    Companies · new sheet
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHANNELS STRIP */}
      <section style={{ maxWidth: 1160, margin: "0 auto", padding: "26px 28px 70px" }}>
        <p
          className="dm-mono"
          style={{
            textAlign: "center",
            fontSize: 12.5,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#8A8477",
            marginBottom: 20,
          }}
        >
          works with everything you already use
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {channels.map((c) => (
            <span key={c.label} style={channelPill}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.src}
                alt={c.label}
                style={{ height: 18, width: "auto", display: "block" }}
              />
              {c.label}
            </span>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ background: "#211E18", color: "#F1ECE1" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "88px 28px" }}>
          <div style={{ maxWidth: 640, marginBottom: 52 }}>
            <p className="dm-mono" style={sectionEyebrow}>
              how it works
            </p>
            <h2 className="dm-display" style={h2}>
              Three steps. That&apos;s the whole thing.
            </h2>
            <p style={{ fontSize: 17, color: "#B7AF9F", maxWidth: "52ch" }}>
              You do one — forwarding. datamodo does the other two, quietly, in
              the background, every time something new comes in.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
              gap: 20,
            }}
          >
            {[
              {
                n: "1",
                accent: true,
                title: "Forward it",
                body:
                  "Send an email to your datamodo address, or drop the bot into a group chat. That's your only job.",
              },
              {
                n: "2",
                accent: false,
                title: "We make sense of it",
                body:
                  "Everything is stored, read, categorized and linked — names, amounts, dates, people, topics all connected.",
              },
              {
                n: "3",
                accent: false,
                title: "Use the tables",
                body:
                  "datamodo builds spreadsheets out of your stuff on its own, and answers questions with the receipts attached.",
              },
            ].map((c) => (
              <div key={c.n} style={darkCard}>
                <div
                  className="dm-display"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: c.accent ? "var(--accent)" : "#3A352C",
                    color: c.accent ? "#FFF8F4" : "#F1ECE1",
                    fontWeight: 700,
                    fontSize: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                  }}
                >
                  {c.n}
                </div>
                <h3
                  className="dm-display"
                  style={{
                    fontWeight: 600,
                    fontSize: 21,
                    letterSpacing: "-0.02em",
                    marginBottom: 9,
                  }}
                >
                  {c.title}
                </h3>
                <p style={{ fontSize: 15, color: "#B7AF9F" }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section id="uses" style={{ maxWidth: 1160, margin: "0 auto", padding: "96px 28px 40px" }}>
        <div style={{ maxWidth: 640, marginBottom: 56 }}>
          <p className="dm-mono" style={sectionEyebrow}>
            use cases
          </p>
          <h2 className="dm-display" style={{ ...h2, marginBottom: 0 }}>
            The same trick, everywhere your data hides.
          </h2>
        </div>

        {/* CASE 1 */}
        <div style={useCaseRow(false)}>
          <div className="dm-fluid" style={{ flex: "1 1 340px", minWidth: 280 }}>
            <p className="dm-mono" style={useCaseKicker}>
              01 — forward an email
            </p>
            <h3 className="dm-display" style={useCaseH3}>
              One receipt in, one clean row out.
            </h3>
            <p style={useCaseBody}>
              Forward the confirmation, the invoice, the booking. datamodo pulls
              the vendor, the amount, the date and the category — and files it in
              the right table without you lifting a finger.
            </p>
          </div>
          <div className="dm-fluid" style={{ flex: "1 1 380px", minWidth: 300 }}>
            <div style={{ ...demoCard, padding: 20 }}>
              <div
                className="dm-mono"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 12,
                  color: "#8A8477",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }}
                />
                Fwd: Order confirmed — Delta #DL2291
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Airline", value: "Delta", delay: "0s", accent: false },
                  { label: "Route", value: "JFK → SFO", delay: ".4s", accent: false },
                  { label: "Depart", value: "Sep 14", delay: ".8s", accent: false },
                  { label: "Fare", value: "$389.00", delay: "1.2s", accent: true },
                ].map((f) => (
                  <div
                    key={f.label}
                    style={{
                      ...fieldTile(f.accent),
                      animation: `dm-pop 8s ease-in-out ${f.delay} infinite`,
                    }}
                  >
                    <div className="dm-mono" style={fieldLabel}>
                      {f.label}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        ...(f.accent ? { color: "var(--accent)" } : {}),
                      }}
                    >
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CASE 2 */}
        <div style={useCaseRow(true)}>
          <div className="dm-fluid" style={{ flex: "1 1 340px", minWidth: 280 }}>
            <p className="dm-mono" style={useCaseKicker}>
              02 — add the bot to a group chat
            </p>
            <h3 className="dm-display" style={useCaseH3}>
              It listens so nobody has to take notes.
            </h3>
            <p style={useCaseBody}>
              Drop @datamodo into your family, team or trip group chat. It quietly
              catches every decision, address, amount and to-do buried in the
              scroll — and hands it back structured.
            </p>
          </div>
          <div className="dm-fluid" style={{ flex: "1 1 380px", minWidth: 300 }}>
            <div style={{ ...demoCard, padding: 18 }}>
              <div
                className="dm-mono"
                style={{ fontSize: 11.5, color: "#8A8477", marginBottom: 14 }}
              >
                Ski trip 🏔 · 6 members
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ ...chatBubble, animation: "dm-pop 9s ease-in-out infinite" }}>
                  Booked the cabin — $1,450 total, split 6 ways
                </div>
                <div style={{ ...chatBubble, animation: "dm-pop 9s ease-in-out 1s infinite" }}>
                  I&apos;ll grab lift passes, drop off Fri 3pm
                </div>
                <div style={{ ...chatBubble, animation: "dm-pop 9s ease-in-out 2s infinite" }}>
                  @datamodo track who paid
                </div>
                <div
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "82%",
                    background: "#211E18",
                    color: "#F1ECE1",
                    borderRadius: "14px 14px 4px 14px",
                    padding: "11px 13px",
                    animation: "dm-pop 9s ease-in-out 3s infinite",
                  }}
                >
                  <div
                    className="dm-mono"
                    style={{
                      fontSize: 10.5,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 7,
                    }}
                  >
                    datamodo · payments
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      padding: "3px 0",
                    }}
                  >
                    <span>Cabin</span>
                    <span className="dm-mono">$1,450 · ÷6</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      padding: "3px 0",
                      borderTop: "1px solid #3A352C",
                    }}
                  >
                    <span>Per person</span>
                    <span className="dm-mono" style={{ color: "#F1ECE1" }}>
                      $241.67
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      padding: "3px 0",
                      borderTop: "1px solid #3A352C",
                    }}
                  >
                    <span>Passes</span>
                    <span className="dm-mono">Fri 3pm · Mia</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CASE 3 */}
        <div style={useCaseRow(false)}>
          <div className="dm-fluid" style={{ flex: "1 1 340px", minWidth: 280 }}>
            <p className="dm-mono" style={useCaseKicker}>
              03 — dump anything, in any order
            </p>
            <h3 className="dm-display" style={useCaseH3}>
              A junk drawer that sorts itself.
            </h3>
            <p style={useCaseBody}>
              Screenshots, links, voice notes, half-thoughts — throw it all in.
              datamodo reads each one, figures out what it is, and drops it into
              the right pile automatically.
            </p>
          </div>
          <div className="dm-fluid" style={{ flex: "1 1 380px", minWidth: 300 }}>
            <div
              style={{
                ...demoCard,
                padding: 20,
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 12,
              }}
            >
              {[
                {
                  label: "Receipts",
                  items: [
                    { t: "Uber $18", delay: "0s" },
                    { t: "Cafe $6.40", delay: "1.6s" },
                  ],
                },
                {
                  label: "Contacts",
                  items: [
                    { t: "Dr. Lee", delay: ".8s" },
                    { t: "Plumber", delay: "2.4s" },
                  ],
                },
                {
                  label: "To read",
                  items: [
                    { t: "Link · AI", delay: "1.2s" },
                    { t: "Book note", delay: "3s" },
                  ],
                },
              ].map((bucket) => (
                <div
                  key={bucket.label}
                  style={{
                    background: "#FAF6EE",
                    border: "1px solid #EFE9DC",
                    borderRadius: 13,
                    padding: 13,
                  }}
                >
                  <div
                    className="dm-mono"
                    style={{
                      fontSize: 10.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "var(--accent)",
                      marginBottom: 10,
                    }}
                  >
                    {bucket.label}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {bucket.items.map((it) => (
                      <div
                        key={it.t}
                        style={{
                          fontSize: 12.5,
                          background: "#FFF",
                          border: "1px solid #EFE9DC",
                          borderRadius: 8,
                          padding: "6px 9px",
                          animation: `dm-dropin 8s ease-in-out ${it.delay} infinite`,
                        }}
                      >
                        {it.t}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CASE 4 */}
        <div style={{ ...useCaseRow(true), marginBottom: 0 }}>
          <div className="dm-fluid" style={{ flex: "1 1 340px", minWidth: 280 }}>
            <p className="dm-mono" style={useCaseKicker}>
              04 — your second brain
            </p>
            <h3 className="dm-display" style={useCaseH3}>
              It builds the dataset you didn&apos;t ask for — but needed.
            </h3>
            <p style={useCaseBody}>
              datamodo notices patterns across everything you&apos;ve fed it and
              quietly assembles a table. One day you open it up and your whole
              year of travel, spending or clients is already there.
            </p>
          </div>
          <div className="dm-fluid" style={{ flex: "1 1 380px", minWidth: 300 }}>
            <div
              style={{
                ...demoCard,
                position: "relative",
                padding: 20,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 20,
                  right: 20,
                  top: 64,
                  height: 2,
                  background:
                    "linear-gradient(90deg,transparent,var(--accent),transparent)",
                  animation: "dm-scan 6s ease-in-out infinite",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <span className="dm-display" style={{ fontWeight: 600, fontSize: 15 }}>
                  Trips 2026 · auto-built
                </span>
                <span
                  className="dm-mono"
                  style={{
                    fontSize: 10.5,
                    color: "var(--accent)",
                    background: "#FBEAE3",
                    padding: "4px 9px",
                    borderRadius: 999,
                  }}
                >
                  live
                </span>
              </div>
              <div
                className="dm-mono"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.1fr 0.9fr 0.8fr",
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#A39B8B",
                  padding: "8px 0",
                  borderBottom: "1px solid #EFE9DC",
                }}
              >
                <span>Trip</span>
                <span>Spend</span>
                <span>Nights</span>
              </div>
              {[
                { trip: "Lisbon", spend: "$1,120", nights: "4", delay: "0s", accent: false },
                { trip: "Tahoe", spend: "$690", nights: "3", delay: "1.4s", accent: false },
                { trip: "Tokyo", spend: "$3,240", nights: "9", delay: "2.8s", accent: true },
              ].map((r) => (
                <div
                  key={r.trip}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.1fr 0.9fr 0.8fr",
                    fontSize: 13.5,
                    padding: "9px 0",
                    borderBottom: "1px solid #F3EEE3",
                    animation: `dm-dropin 7s ease-in-out ${r.delay} infinite`,
                  }}
                >
                  <span>{r.trip}</span>
                  <span
                    className="dm-mono"
                    style={r.accent ? { color: "var(--accent)" } : undefined}
                  >
                    {r.spend}
                  </span>
                  <span>{r.nights}</span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "11px 0 2px",
                }}
              >
                <span>Total</span>
                <span className="dm-mono">$5,050 · 16 nights</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ASK ANYTHING */}
      <section id="brain" style={{ maxWidth: 1160, margin: "0 auto", padding: "40px 28px 96px" }}>
        <div
          style={{
            background: "#211E18",
            color: "#F1ECE1",
            borderRadius: 26,
            padding: "clamp(32px,5vw,64px)",
            display: "flex",
            gap: 52,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div className="dm-fluid" style={{ flex: "1 1 360px", minWidth: 280 }}>
            <p className="dm-mono" style={sectionEyebrow}>
              ask anything
            </p>
            <h2
              className="dm-display"
              style={{
                fontWeight: 700,
                fontSize: "clamp(28px,3.6vw,40px)",
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                marginBottom: 16,
              }}
            >
              Ask in plain words. Get answers with receipts.
            </h2>
            <p style={{ fontSize: 16.5, color: "#B7AF9F", maxWidth: "46ch" }}>
              Because everything is linked, you can just ask. datamodo answers from
              your own content and always shows you exactly where it got each
              number.
            </p>
          </div>
          <div className="dm-fluid" style={{ flex: "1 1 380px", minWidth: 300 }}>
            <div
              style={{
                background: "#2B2720",
                border: "1px solid #3A352C",
                borderRadius: 18,
                padding: 20,
              }}
            >
              <div
                style={{
                  background: "#211E18",
                  border: "1px solid #3A352C",
                  borderRadius: 12,
                  padding: "13px 15px",
                  fontSize: 14.5,
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ color: "#7C766B" }}>›</span>
                How much did I spend on flights this year?
                <span
                  style={{
                    width: 8,
                    height: 16,
                    background: "var(--accent)",
                    display: "inline-block",
                    animation: "dm-caret 1.1s step-end infinite",
                  }}
                />
              </div>
              <div style={{ animation: "dm-pop 7s ease-in-out infinite" }}>
                <div
                  className="dm-display"
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    marginBottom: 12,
                  }}
                >
                  $2,847.00{" "}
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#B7AF9F" }}>
                    across 6 flights
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {[
                    { label: "Delta · JFK→SFO", amt: "$389.00" },
                    { label: "ANA · SFO→HND", amt: "$1,240.00" },
                  ].map((r) => (
                    <div
                      key={r.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                        background: "#211E18",
                        border: "1px solid #3A352C",
                        borderRadius: 9,
                        padding: "8px 11px",
                      }}
                    >
                      <span style={{ color: "#B7AF9F" }}>{r.label}</span>
                      <span className="dm-mono">{r.amt}</span>
                    </div>
                  ))}
                  <div
                    className="dm-mono"
                    style={{ fontSize: 11, color: "#7C766B", paddingTop: 3 }}
                  >
                    ↳ sourced from 6 forwarded confirmations
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST ROW */}
      <section style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px 90px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
            gap: 20,
          }}
        >
          {[
            {
              title: "Yours, and private",
              body:
                "Your data is encrypted and never sold or used to train anyone else's model.",
              strong: true,
            },
            {
              title: "Zero setup",
              body:
                "No fields to define, no templates to pick. The structure appears on its own.",
              strong: false,
            },
            {
              title: "Export anywhere",
              body:
                "Every table drops straight into a spreadsheet, CSV or your other tools.",
              strong: false,
            },
          ].map((t) => (
            <div
              key={t.title}
              style={{
                borderTop: `2px solid ${t.strong ? "#211E18" : "#DCD3C2"}`,
                paddingTop: 18,
              }}
            >
              <h4
                className="dm-display"
                style={{ fontWeight: 600, fontSize: 18, marginBottom: 7 }}
              >
                {t.title}
              </h4>
              <p style={{ fontSize: 14.5, color: "#57534A" }}>{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="cta" style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px 100px" }}>
        <div
          style={{
            textAlign: "center",
            background: "linear-gradient(180deg,#FDF1EC,#F9E7DE)",
            border: "1px solid #F3D6CB",
            borderRadius: 26,
            padding: "clamp(44px,6vw,80px) 28px",
          }}
        >
          <h2
            className="dm-display"
            style={{
              fontWeight: 700,
              fontSize: "clamp(30px,4.6vw,52px)",
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              marginBottom: 16,
              maxWidth: "16ch",
              marginLeft: "auto",
              marginRight: "auto",
              textWrap: "balance",
            }}
          >
            Give your inbox a memory that organizes itself.
          </h2>
          <p
            style={{
              fontSize: 18,
              color: "#7B5F54",
              maxWidth: "44ch",
              margin: "0 auto 30px",
            }}
          >
            Get your personal datamodo address and start forwarding today. Free to
            try.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/register"
              className="dm-btn dm-btn-accent"
              style={{
                fontSize: 17,
                padding: "16px 30px",
                borderRadius: 14,
                boxShadow: "0 8px 22px rgba(228,89,59,.3)",
              }}
            >
              Create your free inbox
            </Link>
            <a
              href="mailto:hello@datamodo.in"
              className="dm-btn dm-btn-outline"
              style={{
                fontSize: 17,
                padding: "16px 26px",
                borderRadius: 14,
                border: "1px solid #DDB8A8",
              }}
            >
              Talk to us
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid #E7E0D2" }}>
        <div
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            padding: "32px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <Logo dataSize={24} modoSize={17} />
          <div
            style={{
              display: "flex",
              gap: 22,
              fontSize: 14,
              color: "#8A8477",
              flexWrap: "wrap",
            }}
          >
            <a href="#" className="dm-footer-link">
              Privacy
            </a>
            <a href="#" className="dm-footer-link">
              Security
            </a>
            <a href="#" className="dm-footer-link">
              Docs
            </a>
            <a href="mailto:hello@datamodo.in" className="dm-footer-link">
              Contact
            </a>
          </div>
          <span className="dm-mono" style={{ fontSize: 12, color: "#A39B8B" }}>
            © 2026 datamodo
          </span>
        </div>
      </footer>
    </main>
  );
}
