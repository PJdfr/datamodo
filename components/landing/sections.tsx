/**
 * Static landing sections (no client state) — nav, hero, use cases,
 * ask-anything, trust, final CTA, footer. Ported from
 * design/system/templates/landing/landing-parts1.jsx + landing-parts2.jsx.
 */
import type { CSSProperties } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button, Eyebrow } from "./ui";

const mono = "var(--dm-font-mono)";
const display = "var(--dm-font-display)";
const MAX = 1160;

/* --------------------------------------------------------------------- nav */
export function Nav() {
  const link: CSSProperties = { fontSize: 15 };
  return (
    <nav style={{ maxWidth: MAX, margin: "0 auto", padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo />
      <div style={{ display: "flex", alignItems: "center", gap: 26, color: "var(--dm-text-body)" }}>
        <span className="lp-nav-links" style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <a className="lp-quiet" href="#how" style={link}>How it works</a>
          <a className="lp-quiet" href="#control" style={link}>Stay in control</a>
          <a className="lp-quiet" href="#uses" style={link}>Use cases</a>
          <a className="lp-quiet" href="#brain" style={link}>Ask anything</a>
          <Link className="lp-quiet" href="/login" style={link}>Log in</Link>
        </span>
        <Button variant="dark" size="sm" href="/register">Get started</Button>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------- hero */
export function Hero() {
  return (
    <header style={{ maxWidth: MAX, margin: "0 auto", padding: "84px 28px 40px", textAlign: "center" }}>
      <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(40px,5.8vw,66px)", lineHeight: 1.02, letterSpacing: "-0.035em", margin: "0 auto 24px", maxWidth: "15ch", textWrap: "balance" }}>
        Forward the mess. Get back a spreadsheet.
      </h1>
      <p style={{ fontSize: 18.5, color: "var(--dm-text-body)", maxWidth: "58ch", margin: "0 auto 34px", textWrap: "pretty" }}>
        The invoices, contacts, deal terms, files and to-dos that run your work are scattered across email, WhatsApp and Slack. Forward them to datamodo and get them back as clean tables and neatly filed folders — no assistant, no data entry, no formulas.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <Button size="lg" href="/register">Get your inbox — free</Button>
        <Button variant="outline" size="lg" href="#how">See how it works</Button>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- use cases */
const caseRow = (rev: boolean): CSSProperties => ({ display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap", marginBottom: 84, flexDirection: rev ? "row-reverse" : "row" });
const caseText: CSSProperties = { flex: "1 1 340px", minWidth: 280 };
const caseVisual: CSSProperties = { flex: "1 1 380px", minWidth: 300 };
const kicker: CSSProperties = { fontFamily: mono, fontSize: 12, color: "var(--dm-text-faint)", marginBottom: 12 };
const caseH: CSSProperties = { fontFamily: display, fontWeight: 600, fontSize: 29, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 14 };
const caseP: CSSProperties = { fontSize: 16.5, color: "#57534A", maxWidth: "44ch" };
const softCard: CSSProperties = { background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 18, boxShadow: "var(--dm-shadow-card)" };
const tile: CSSProperties = { background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 11, padding: 12 };
const tileLbl: CSSProperties = { fontFamily: mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--dm-text-faint)", marginBottom: 5 };

export function UseCases() {
  return (
    <section id="uses" style={{ maxWidth: MAX, margin: "0 auto", padding: "96px 28px 40px" }}>
      <div style={{ maxWidth: 640, marginBottom: 56 }}>
        <div style={{ marginBottom: 16 }}>
          <Eyebrow>use cases</Eyebrow>
        </div>
        <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 16 }}>
          The same trick, everywhere your work hides.
        </h2>
        <p style={{ fontSize: 17, color: "#57534A", maxWidth: "50ch" }}>
          Freelancer, consultant, founder, dealmaker — if you run on messages instead of a back office, datamodo is the back office.
        </p>
      </div>

      {/* 01 receipt */}
      <div style={caseRow(false)}>
        <div style={caseText}>
          <p style={kicker}>01 — forward an email</p>
          <h3 style={caseH}>One receipt in, one clean row out.</h3>
          <p style={caseP}>
            Forward the confirmation, the invoice, the booking. datamodo pulls the vendor, the amount, the date and the category — and files it in the right table without you lifting a finger.
          </p>
        </div>
        <div style={caseVisual}>
          <div style={{ ...softCard, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: mono, fontSize: 12, color: "var(--dm-text-muted)", marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--dm-accent)" }} />
              Fwd: Order confirmed — Delta #DL2291
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(
                [
                  ["Airline", "Delta", false, 0],
                  ["Route", "JFK → SFO", false, 0.4],
                  ["Depart", "Sep 14", false, 0.8],
                  ["Fare", "$389.00", true, 1.2],
                ] as [string, string, boolean, number][]
              ).map(([l, v, acc, d]) => (
                <div key={l} style={{ ...tile, ...(acc ? { background: "var(--dm-accent-tint-2)", borderColor: "var(--dm-accent-tint-border)" } : {}), animation: `lp-loop-pop 8s ease-in-out ${d}s infinite` }}>
                  <div style={tileLbl}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: acc ? "var(--dm-accent)" : "inherit" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 02 group chat */}
      <div style={caseRow(true)}>
        <div style={caseText}>
          <p style={kicker}>02 — add the bot to a group chat</p>
          <h3 style={caseH}>It listens so nobody has to take notes.</h3>
          <p style={caseP}>
            Drop @datamodo into your family, team or trip group chat. It quietly catches every decision, address, amount and to-do buried in the scroll — and hands it back structured.
          </p>
        </div>
        <div style={caseVisual}>
          <div style={{ ...softCard, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 11.5, color: "var(--dm-text-muted)", marginBottom: 14 }}>Ski trip 🏔 · 6 members</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {["Booked the cabin — $1,450 total, split 6 ways", "I'll grab lift passes, drop off Fri 3pm", "@datamodo track who paid"].map((t, i) => (
                <div key={i} style={{ alignSelf: "flex-start", maxWidth: "76%", background: "#F1ECE2", borderRadius: "14px 14px 14px 4px", padding: "9px 13px", fontSize: 13.5, animation: `lp-loop-pop 9s ease-in-out ${i}s infinite` }}>
                  {t}
                </div>
              ))}
              <div style={{ alignSelf: "flex-end", maxWidth: "82%", background: "var(--dm-ink)", color: "var(--dm-text-on-ink)", borderRadius: "14px 14px 4px 14px", padding: "11px 13px", animation: "lp-loop-pop 9s ease-in-out 3s infinite" }}>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: "var(--dm-accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>datamodo · payments</div>
                {(
                  [
                    ["Cabin", "$1,450 · ÷6", false],
                    ["Per person", "$241.67", true],
                    ["Passes", "Fri 3pm · Mia", true],
                  ] as [string, string, boolean][]
                ).map(([a, b, brd]) => (
                  <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", borderTop: brd ? "1px solid var(--dm-ink-border)" : "none" }}>
                    <span>{a}</span>
                    <span style={{ fontFamily: mono }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 03 sorted buckets */}
      <div style={caseRow(false)}>
        <div style={caseText}>
          <p style={kicker}>03 — dump anything, in any order</p>
          <h3 style={caseH}>A junk drawer that sorts itself.</h3>
          <p style={caseP}>
            Screenshots, links, voice notes, half-thoughts — throw it all in. datamodo reads each one, figures out what it is, and drops it into the right pile automatically.
          </p>
        </div>
        <div style={caseVisual}>
          <div style={{ ...softCard, padding: 20, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {(
              [
                ["Receipts", [["Uber $18", 0], ["Cafe $6.40", 1.6]]],
                ["Contacts", [["Dr. Lee", 0.8], ["Plumber", 2.4]]],
                ["To read", [["Link · AI", 1.2], ["Book note", 3]]],
              ] as [string, [string, number][]][]
            ).map(([cat, items]) => (
              <div key={cat} style={{ background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 13, padding: 13 }}>
                <div style={{ fontFamily: mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--dm-accent)", marginBottom: 10 }}>{cat}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {items.map(([txt, d]) => (
                    <div key={txt} style={{ fontSize: 12.5, background: "#fff", border: "1px solid var(--dm-border-soft)", borderRadius: 8, padding: "6px 9px", animation: `lp-dropin 8s ease-in-out ${d}s infinite` }}>
                      {txt}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 04 second brain */}
      <div style={caseRow(true)}>
        <div style={caseText}>
          <p style={kicker}>04 — your second brain</p>
          <h3 style={caseH}>It builds the dataset you didn&apos;t ask for — but needed.</h3>
          <p style={caseP}>
            datamodo notices patterns across everything you&apos;ve fed it and quietly assembles a table. One day you open it up and your whole year of travel, spending or clients is already there.
          </p>
        </div>
        <div style={caseVisual}>
          <div style={{ ...softCard, padding: 20, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 20, right: 20, top: 64, height: 2, background: "linear-gradient(90deg,transparent,var(--dm-accent),transparent)", animation: "lp-loop-scan 6s ease-in-out infinite" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontFamily: display, fontWeight: 600, fontSize: 15 }}>Trips 2026 · auto-built</span>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: "var(--dm-accent)", background: "var(--dm-accent-tint)", padding: "4px 9px", borderRadius: 999 }}>live</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.8fr", fontFamily: mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--dm-text-faint)", padding: "8px 0", borderBottom: "1px solid var(--dm-border-soft)" }}>
              <span>Trip</span>
              <span>Spend</span>
              <span>Nights</span>
            </div>
            {(
              [
                ["Lisbon", "$1,120", "4", false, 0],
                ["Tahoe", "$690", "3", false, 1.4],
                ["Tokyo", "$3,240", "9", true, 2.8],
              ] as [string, string, string, boolean, number][]
            ).map(([t, s, n, acc, d]) => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.8fr", fontSize: 13.5, padding: "9px 0", borderBottom: "1px solid #F3EEE3", animation: `lp-dropin 7s ease-in-out ${d}s infinite` }}>
                <span>{t}</span>
                <span style={{ fontFamily: mono, color: acc ? "var(--dm-accent)" : "inherit" }}>{s}</span>
                <span>{n}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, padding: "11px 0 2px" }}>
              <span>Total</span>
              <span style={{ fontFamily: mono }}>$5,050 · 16 nights</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- ask anything */
export function AskAnything() {
  return (
    <section id="brain" style={{ maxWidth: MAX, margin: "0 auto", padding: "40px 28px 96px" }}>
      <div style={{ background: "var(--dm-ink)", color: "var(--dm-text-on-ink)", borderRadius: 26, padding: "clamp(32px,5vw,64px)", display: "flex", gap: 52, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 360px", minWidth: 280 }}>
          <div style={{ marginBottom: 16 }}>
            <Eyebrow bare>ask anything</Eyebrow>
          </div>
          <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(28px,3.6vw,40px)", lineHeight: 1.06, letterSpacing: "-0.03em", marginBottom: 16 }}>
            Ask in plain words. Get answers with receipts.
          </h2>
          <p style={{ fontSize: 16.5, color: "var(--dm-text-on-ink-muted)", maxWidth: "46ch" }}>
            Because everything is linked, you can just ask. datamodo answers from your own content and always shows you exactly where it got each number.
          </p>
        </div>
        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          <div style={{ background: "var(--dm-ink-surface)", border: "1px solid var(--dm-ink-border)", borderRadius: 18, padding: 20 }}>
            <div style={{ background: "var(--dm-ink)", border: "1px solid var(--dm-ink-border)", borderRadius: 12, padding: "13px 15px", fontSize: 14.5, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#7C766B" }}>›</span>How much did I spend on flights this year?
              <span style={{ width: 8, height: 16, background: "var(--dm-accent)", display: "inline-block", animation: "lp-caret 1.1s step-end infinite" }} />
            </div>
            <div style={{ animation: "lp-loop-pop 7s ease-in-out infinite" }}>
              <div style={{ fontSize: 26, fontFamily: display, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>
                $2,847.00 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--dm-text-on-ink-muted)" }}>across 6 flights</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(
                  [
                    ["Delta · JFK→SFO", "$389.00"],
                    ["ANA · SFO→HND", "$1,290.00"],
                    ["United · HND→SFO", "$1,168.00"],
                  ] as [string, string][]
                ).map(([a, b]) => (
                  <div key={a} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, background: "var(--dm-ink)", border: "1px solid var(--dm-ink-border)", borderRadius: 9, padding: "8px 11px" }}>
                    <span style={{ color: "var(--dm-text-on-ink-muted)" }}>{a}</span>
                    <span style={{ fontFamily: mono }}>{b}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontFamily: mono, fontSize: 11, color: "var(--dm-text-on-ink-faint)", marginTop: 12 }}>↳ sourced from 6 forwarded confirmations</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- trust */
export function Trust() {
  const cols: [string, string, boolean][] = [
    ["Yours and private", "Your data is encrypted and never sold, never trained on. Export or delete it whenever you want.", true],
    ["Zero setup", "No formulas, no templates, no onboarding call. Forward one thing and you're already using it.", false],
    ["Export anywhere", "Every table drops straight into Excel or a live sheet — datamodo is a starting point, never a lock-in.", false],
  ];
  return (
    <section style={{ maxWidth: MAX, margin: "0 auto", padding: "0 28px 40px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 28 }}>
        {cols.map(([t, d, strong]) => (
          <div key={t} style={{ paddingTop: 22, borderTop: strong ? "2px solid var(--dm-ink)" : "1px solid var(--dm-border-2)" }}>
            <h4 style={{ fontFamily: display, fontWeight: 600, fontSize: 19, letterSpacing: "-0.02em", marginBottom: 9 }}>{t}</h4>
            <p style={{ fontSize: 15, color: "#57534A", lineHeight: 1.55 }}>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- final CTA */
export function FinalCTA() {
  return (
    <section id="cta" style={{ maxWidth: MAX, margin: "0 auto", padding: "56px 28px 96px" }}>
      <div style={{ background: "linear-gradient(135deg,var(--dm-accent-tint-2),#F9E7DE)", border: "1px solid var(--dm-accent-tint-border)", borderRadius: 26, padding: "clamp(40px,6vw,72px) 28px", textAlign: "center" }}>
        <h2 style={{ fontFamily: display, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 auto 22px", maxWidth: "18ch", textWrap: "balance" }}>
          Give your inbox a memory that organizes itself.
        </h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
          <Button size="lg" href="/register">Get your inbox — free</Button>
          <Button variant="outline" size="lg" href="mailto:hello@datamodo.in">Talk to us</Button>
        </div>
        <p style={{ fontFamily: mono, fontSize: 12.5, color: "var(--dm-text-muted)", marginTop: 20 }}>no card · your first tables in minutes</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- footer */
export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--dm-border-2)" }}>
      <div style={{ maxWidth: MAX, margin: "0 auto", padding: "34px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <Logo dataSize={26} modoSize={19} />
        <div style={{ display: "flex", gap: 22, fontSize: 14, color: "var(--dm-text-body)" }}>
          <a className="lp-quiet" href="#how">How it works</a>
          <a className="lp-quiet" href="#uses">Use cases</a>
          <Link className="lp-quiet" href="/login">Log in</Link>
          <a className="lp-quiet" href="mailto:hello@datamodo.in">Contact</a>
        </div>
        <p style={{ fontFamily: mono, fontSize: 12, color: "var(--dm-text-muted)" }}>© 2026 datamodo</p>
      </div>
    </footer>
  );
}
