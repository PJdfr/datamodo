/* global React */
const DSr = window.DatamodoDesignSystem_07247b;
const monoR = "var(--dm-font-mono, monospace)";
const bodyR = "var(--dm-font-body)";
const dispR = "var(--dm-font-display, sans-serif)";
const MAXr = 1160;

/* changes proposed to the graph, grouped by the view they touch (like files in a PR) */
const GROUPS = [
  { key: "Companies", changes: [
    { id: "dom", kind: "~", text: 'Acme Inc · domain  "acme.io" → "acme.co"', src: "Gmail" },
    { id: "merge", kind: "-", text: 'merge  "ACME Incorporated"  into  "Acme Inc"', src: "Slack" },
  ] },
  { key: "Invoices", changes: [
    { id: "inv", kind: "+", text: "#A-204   Acme Inc   $12,000   due Aug 1", src: "Gmail" },
  ] },
  { key: "Contacts", changes: [
    { id: "sarah", kind: "+", text: "Sarah Chen   ·   works at Acme Inc", src: "Gmail" },
  ] },
  { key: "Files", changes: [
    { id: "file", kind: "+", text: 'Acme_retainer_Q3.pdf  →  folder "Acme Inc"', src: "Gmail" },
  ] },
];
const ALL = GROUPS.flatMap((g) => g.changes.map((c) => c.id));
const KIND = {
  "+": ["var(--dm-success,#3F8F5B)", "var(--dm-success-bg,#E4F0E8)"],
  "~": ["var(--dm-accent,#E4593B)", "var(--dm-accent-tint-2,#FDF1EC)"],
  "-": ["var(--dm-mac-red,#C7362C)", "#FBE9E7"],
};

function ReviewFlow() {
  const [status, setStatus] = React.useState({});
  const [flash, setFlash] = React.useState([]);
  const [hover, setHover] = React.useState(null);
  const timer = React.useRef(0);
  const inGraph = (id) => status[id] !== "no";
  const fl = (k) => flash.includes(k) || hover === k;

  const pulse = (panels) => { setFlash(panels); clearTimeout(timer.current); timer.current = setTimeout(() => setFlash([]), 950); };
  const set = (id, v, panel) => { setStatus((s) => ({ ...s, [id]: s[id] === v ? undefined : v })); pulse([panel]); };
  const mergeAll = () => { const n = {}; ALL.forEach((id) => (n[id] = "ok")); setStatus(n); pulse(["Companies", "Invoices", "Contacts", "Files"]); };
  const reset = () => { setStatus({}); pulse([]); };

  const approved = ALL.filter((id) => status[id] === "ok").length;
  const rejected = ALL.filter((id) => status[id] === "no").length;
  const merges = ALL.filter((id) => inGraph(id)).length;

  const companies = [
    { name: "Northwind", domain: "northwind.io", n: "3" },
    { name: "Globex", domain: "globex.com", n: "1" },
    { name: "Acme Inc", domain: inGraph("dom") ? "acme.co" : "acme.io", n: inGraph("inv") ? "2" : "1", hot: inGraph("dom") || inGraph("merge") },
  ];
  const invoices = [{ inv: "#A-198", client: "Northwind", amt: "$3,400" }];
  if (inGraph("inv")) invoices.push({ inv: "#A-204", client: "Acme Inc", amt: "$12,000", hot: true });
  const contacts = [{ name: "Dana Okafor", co: "Acme Inc" }];
  if (inGraph("sarah")) contacts.push({ name: "Sarah Chen", co: "Acme Inc", hot: true });

  return (
    <section id="control" style={{ maxWidth: MAXr, margin: "0 auto", padding: "40px 28px 24px" }}>
      <div style={{ maxWidth: 660, marginBottom: 26 }}>
        <div style={{ marginBottom: 16 }}><DSr.Eyebrow>you stay in charge</DSr.Eyebrow></div>
        <h2 style={{ fontFamily: dispR, fontWeight: 700, fontSize: "clamp(28px,3.8vw,42px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 16 }}>Review the changes. Merge when it's right.</h2>
        <p style={{ fontSize: 16.5, color: "#57534A", maxWidth: "56ch" }}>datamodo opens every batch of new facts as a request against your knowledge graph — like a pull request. Approve or reject each change and watch the merged result build itself on the right.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,1.05fr) minmax(300px,1fr)", gap: 24, alignItems: "start" }}>
        {/* LEFT — the "pull request" */}
        <div style={{ background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--dm-shadow-card, 0 1px 2px rgba(33,30,24,.05))" }}>
          {/* PR header */}
          <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--dm-border-soft,#EFE9DC)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: monoR, fontSize: 10, fontWeight: 600, letterSpacing: ".04em", color: rejected && !approved ? "var(--dm-text-muted)" : "var(--dm-success,#3F8F5B)", background: "var(--dm-success-bg,#E4F0E8)", padding: "3px 9px", borderRadius: 999 }}>
                <GitGlyph /> {merges === 0 ? "CLOSED" : "OPEN"}
              </span>
              <span style={{ fontFamily: dispR, fontWeight: 700, fontSize: 15.5, color: "var(--dm-ink)" }}>New facts from your inbox</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: monoR, fontSize: 11, color: "var(--dm-text-muted)", flexWrap: "wrap" }}>
              <span style={{ background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-2,#E1D9C8)", borderRadius: 6, padding: "2px 8px" }}>graph:main</span>
              <span>←</span>
              <span style={{ background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-2,#E1D9C8)", borderRadius: 6, padding: "2px 8px" }}>inbox/new-facts</span>
              <span style={{ marginLeft: 4, color: "var(--dm-success,#3F8F5B)" }}>+{GROUPS.flatMap((g) => g.changes).filter((c) => c.kind === "+").length}</span>
              <span style={{ color: "var(--dm-accent,#E4593B)" }}>~1</span>
              <span style={{ color: "var(--dm-mac-red,#C7362C)" }}>−1</span>
            </div>
          </div>

          {/* changed views (grouped diff hunks) */}
          <div style={{ padding: "6px 0" }}>
            {GROUPS.map((g) => (
              <div key={g.key} style={{ borderBottom: "1px solid var(--dm-border-soft,#EFE9DC)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", background: fl(g.key) ? "var(--dm-accent-tint-2,#FDF1EC)" : "transparent", transition: "background .3s ease" }}>
                  <span style={{ fontFamily: monoR, fontSize: 11, color: "var(--dm-text-faint)" }}>▦</span>
                  <span style={{ fontFamily: monoR, fontSize: 12, fontWeight: 600, color: fl(g.key) ? "var(--dm-accent)" : "var(--dm-ink)" }}>{g.key}</span>
                  <span style={{ fontFamily: monoR, fontSize: 10, color: "var(--dm-text-faint)" }}>{g.changes.length} change{g.changes.length > 1 ? "s" : ""}</span>
                </div>
                {g.changes.map((c) => {
                  const [col, bg] = KIND[c.kind];
                  const rej = status[c.id] === "no";
                  const ok = status[c.id] === "ok";
                  return (
                    <div key={c.id} onMouseEnter={() => setHover(g.key)} onMouseLeave={() => setHover(null)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px 8px 14px", background: rej ? "repeating-linear-gradient(45deg,transparent,transparent 6px,rgba(199,54,44,0.05) 6px,rgba(199,54,44,0.05) 12px)" : ok ? bg : hover === g.key ? "var(--dm-surface-sunk,#FAF6EE)" : "transparent", opacity: rej ? 0.7 : 1, cursor: "default", transition: "background .2s ease, opacity .2s ease" }}>
                      <span style={{ width: 16, textAlign: "center", fontFamily: monoR, fontWeight: 700, fontSize: 13, color: col }}>{c.kind}</span>
                      <span style={{ flex: 1, fontFamily: monoR, fontSize: 11.5, color: rej ? "var(--dm-text-faint)" : "var(--dm-text-body)", textDecoration: rej ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis" }}>{c.text}</span>
                      <span style={{ display: "flex", gap: 4 }}>
                        <PillBtn title="Approve" on={ok} color="var(--dm-success,#3F8F5B)" onClick={() => set(c.id, "ok", g.key)}>✓</PillBtn>
                        <PillBtn title="Reject" on={rej} color="var(--dm-mac-red,#C7362C)" onClick={() => set(c.id, "no", g.key)}>✕</PillBtn>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* merge bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "var(--dm-surface-sunk,#FAF6EE)" }}>
            <span style={{ fontFamily: monoR, fontSize: 10.5, color: "var(--dm-text-muted)", flex: 1 }}>
              {approved} approved · {rejected} rejected · <b style={{ color: "var(--dm-ink)", fontWeight: 600 }}>{merges} will merge</b>
            </span>
            <button onClick={reset} style={{ border: "1px solid var(--dm-border-2,#E1D9C8)", background: "transparent", color: "var(--dm-text-muted)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: bodyR, cursor: "pointer" }}>Reset</button>
            <button onClick={mergeAll} style={{ border: "none", background: "var(--dm-success,#3F8F5B)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, fontFamily: bodyR, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}><GitGlyph light /> Approve all &amp; merge</button>
          </div>
        </div>

        {/* RIGHT — merged result */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontFamily: monoR, fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--dm-accent)" }}>merged result</span>
            <span style={{ flex: 1, height: 1, background: "var(--dm-border-soft,#EFE9DC)" }} />
            <span style={{ fontFamily: monoR, fontSize: 10.5, color: "var(--dm-text-faint)" }}>your tables & folders</span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <PreviewTable title="Companies" flash={fl("Companies")} cols={["Company", "Domain", "Open"]} rows={companies.map((r) => [r.name, r.domain, r.n, r.hot])} />
            <PreviewTable title="Invoices" flash={fl("Invoices")} cols={["Invoice", "Client", "Amount"]} rows={invoices.map((r) => [r.inv, r.client, r.amt, r.hot])} mono0 />
            <PreviewTable title="Contacts" flash={fl("Contacts")} cols={["Name", "Company", ""]} rows={contacts.map((r) => [r.name, r.co, "", r.hot])} />
            <PreviewFolder show={inGraph("file")} flash={fl("Files")} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PillBtn({ on, color, onClick, title, children }) {
  const [h, setH] = React.useState(false);
  return (
    <button title={title} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      width: 27, height: 27, borderRadius: 7, cursor: "pointer", fontSize: 12, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: "1px solid " + (on || h ? color : "var(--dm-border-2,#E1D9C8)"),
      background: on ? color : h ? "var(--dm-surface-sunk,#FAF6EE)" : "transparent",
      color: on ? "#fff" : h ? color : "var(--dm-text-muted)",
      transform: h ? "scale(1.12)" : "scale(1)",
      boxShadow: h && !on ? "0 2px 6px rgba(33,30,24,.12)" : "none",
      transition: "all .14s ease",
    }}>{children}</button>
  );
}

function GitGlyph({ light }) {
  const s = light ? "#fff" : "currentColor";
  return <svg width="12" height="12" viewBox="0 0 16 16" style={{ display: "block" }}><circle cx="4" cy="4" r="2" fill="none" stroke={s} strokeWidth="1.6" /><circle cx="4" cy="12" r="2" fill="none" stroke={s} strokeWidth="1.6" /><circle cx="12" cy="12" r="2" fill="none" stroke={s} strokeWidth="1.6" /><path d="M4 6v4M6 12h4M12 6v4" fill="none" stroke={s} strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

const ringStyle = (flash) => ({
  outline: flash ? "2px solid var(--dm-accent)" : "2px solid transparent", outlineOffset: 2,
  boxShadow: flash ? "0 0 0 6px rgba(228,89,59,0.10), var(--dm-shadow-card, 0 1px 2px rgba(33,30,24,.05))" : "var(--dm-shadow-card, 0 1px 2px rgba(33,30,24,.05))",
  transform: flash ? "translateY(-2px)" : "translateY(0)",
  transition: "outline-color .25s ease, box-shadow .25s ease, transform .25s ease",
});

function PreviewTable({ title, cols, rows, mono0, flash }) {
  const T = "1.1fr 1fr 0.6fr";
  const cell = { padding: "8px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <div style={{ background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 12, overflow: "hidden", ...ringStyle(flash) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: monoR, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: flash ? "var(--dm-accent)" : "var(--dm-text-faint)", padding: "8px 12px", background: "var(--dm-surface-sunk)", borderBottom: "1px solid var(--dm-border-soft)", transition: "color .25s ease" }}>
        <span>▦ {title}</span>
        {flash && <span style={{ fontSize: 9, animation: "dm-dropin .4s ease" }}>updating…</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: T, fontFamily: monoR, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--dm-text-faint)", background: "var(--dm-surface-sunk)" }}>
        {cols.map((c, i) => <span key={i} style={{ ...cell, padding: "6px 12px", textAlign: i === 2 ? "right" : "left" }}>{c}</span>)}
      </div>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: T, alignItems: "center", fontSize: 12, borderTop: "1px solid #F1EDE4", background: r[3] ? "var(--dm-accent-tint-2)" : "transparent", boxShadow: r[3] ? "inset 3px 0 0 var(--dm-accent)" : "none", animation: r[3] ? "dm-dropin .4s ease" : "none" }}>
          <span style={{ ...cell, fontWeight: 600, fontFamily: mono0 ? monoR : "inherit", fontSize: mono0 ? 11.5 : 12, color: "var(--dm-ink)" }}>{r[0]}</span>
          <span style={{ ...cell, color: "var(--dm-text-body-2)", fontFamily: monoR, fontSize: 11 }}>{r[1]}</span>
          <span style={{ ...cell, textAlign: "right", fontFamily: monoR, fontSize: 11, color: r[3] ? "var(--dm-accent)" : "var(--dm-text-muted)", fontWeight: r[3] ? 600 : 400 }}>{r[2]}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewFolder({ show, flash }) {
  return (
    <div style={{ background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 12, overflow: "hidden", ...ringStyle(flash) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: monoR, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: flash ? "var(--dm-accent)" : "var(--dm-text-faint)", padding: "8px 12px", background: "var(--dm-surface-sunk)", borderBottom: "1px solid var(--dm-border-soft)", transition: "color .25s ease" }}>
        <span>🗀 Files → folder · Acme Inc</span>
        {show && <span style={{ fontSize: 9, color: "var(--dm-accent)" }}>+1 filed</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "11px 12px" }}>
        {["MSA_2025.pdf", "Q2_invoice.pdf"].map((f) => <span key={f} style={{ fontFamily: monoR, fontSize: 11, background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 7, padding: "3px 8px", color: "var(--dm-text-body-2)" }}>▤ {f}</span>)}
        {show && <span style={{ fontFamily: monoR, fontSize: 11, background: "var(--dm-accent-tint)", border: "1px solid var(--dm-accent-tint-border)", borderRadius: 7, padding: "3px 8px", color: "var(--dm-accent)", fontWeight: 600, animation: "dm-dropin .45s ease" }}>▤ Acme_retainer_Q3.pdf</span>}
      </div>
    </div>
  );
}

window.LandingReview = { ReviewFlow };
