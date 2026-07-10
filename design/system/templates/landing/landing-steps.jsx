/* global React */
const DS3 = window.DatamodoDesignSystem_07247b;
const { Eyebrow: Eyebrow3, MacWindow: MacWindow3 } = DS3;
const mono3 = "var(--dm-font-mono, monospace)";
const display3 = "var(--dm-font-display, sans-serif)";
const MAX3 = 1180;
const STEP_H = 452;
const LOOP = 11000;

const hlOn = { background: "var(--dm-accent-tint-2)", color: "var(--dm-accent)", fontWeight: 600, padding: "0 3px", borderRadius: 4, fontFamily: mono3, fontSize: "0.92em", transition: "background .35s ease, color .35s ease" };
const hlOff = { color: "#3F3B33", fontWeight: 400, padding: "0 3px", fontFamily: mono3, fontSize: "0.92em", transition: "background .35s ease, color .35s ease" };
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

function Fact({ on, children }) { return <span style={on ? hlOn : hlOff}>{children}</span>; }

function StepBadge({ n, label, live }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, background: live ? "var(--dm-accent)" : "var(--dm-ink)", color: live ? "var(--dm-accent-on)" : "var(--dm-canvas)", fontFamily: display3, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .3s ease" }}>{n}</span>
      <span style={{ fontFamily: mono3, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: live ? "var(--dm-accent)" : "var(--dm-text-muted)", transition: "color .3s ease" }}>{label}</span>
    </div>
  );
}

function FlowDots({ active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 40px", alignSelf: "center", paddingTop: 44 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--dm-accent)", opacity: active ? 1 : 0, transform: active ? "scale(1.25)" : "scale(0.6)", transition: `opacity .25s ease ${i * 0.12}s, transform .25s ease ${i * 0.12}s` }} />)}
      </div>
    </div>
  );
}

function Typewriter({ text, play }) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!play) { setN(0); return; }
    let i = 0; const id = setInterval(() => { i++; setN(i); if (i >= text.length) clearInterval(id); }, 24);
    return () => clearInterval(id);
  }, [play, text]);
  return <span>{text.slice(0, n)}<span style={{ opacity: n < text.length ? 1 : 0, color: "var(--dm-accent)", fontWeight: 700 }}>|</span></span>;
}

function FileGlyph({ c = "var(--dm-accent)" }) {
  return <svg width="12" height="14" viewBox="0 0 12 14" style={{ display: "block" }}><path d="M1 1.5 A1 1 0 0 1 2 0.5 H7 L11 4.5 V12.5 A1 1 0 0 1 10 13.5 H2 A1 1 0 0 1 1 12.5 Z" fill="none" stroke={c} strokeWidth="1.1" /><path d="M7 0.5 V4.5 H11" fill="none" stroke={c} strokeWidth="1.1" /></svg>;
}

/* -------- step 1: email, facts highlight one-by-one ( n = revealed count ) -------- */
function StepEmail({ n }) {
  return (
    <MacWindow3 title="Inbox — Sarah Chen" floaty style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "15px 17px 4px" }}>
        <h4 style={{ fontFamily: display3, fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em", lineHeight: 1.25, color: "#1E1B16", marginBottom: 12 }}>Re: Q3 retainer — invoice attached</h4>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--dm-accent)", color: "#FFF8F4", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>S</div>
          <div style={{ fontSize: 13 }}><b style={{ fontWeight: 600, color: "#1E1B16" }}>Sarah Chen</b> <span style={{ fontFamily: mono3, fontSize: 11.5, color: "#9C9687" }}>sarah@acme.com</span></div>
        </div>
      </div>
      <div style={{ padding: "0 17px 14px", fontSize: 14, color: "#3F3B33", lineHeight: 1.75, flex: 1 }}>
        <p style={{ marginBottom: 9 }}>Hi — approving invoice <Fact on={n > 0}>#A-204</Fact> for <Fact on={n > 1}>$12,000</Fact>, due <Fact on={n > 2}>Aug 1</Fact>, for the Q3 retainer with <Fact on={n > 3}>Acme Inc</Fact>.</p>
        <p style={{ marginBottom: 12 }}>Send the final copy to <Fact on={n > 4}>accounts@acme.com</Fact> — thanks!</p>
        <p style={{ color: "#7B7568", marginBottom: 12 }}>— <Fact on={n > 5}>Sarah Chen</Fact></p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 8, padding: "6px 10px", fontFamily: mono3, fontSize: 12, color: "var(--dm-text-body-2)" }}><FileGlyph /> Acme_retainer_Q3.pdf</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 17px", borderTop: "1px solid #F0ECE3", background: "#FCFAF3", fontFamily: mono3, fontSize: 11, color: "var(--dm-accent)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent)" }} />{Math.min(n, 6)} of 6 facts + 1 file found
      </div>
    </MacWindow3>
  );
}

/* -------- step 2: SVG sphere, spokes to centre, coral facts reveal one-by-one -------- */
const CW = 330, CH = 300, CX = CW / 2, CY = CH / 2, RAD = 112;
function buildSphere(count, factCount) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    pts.push({ x: Math.cos(phi) * r, y, z: Math.sin(phi) * r, fact: -1 });
  }
  const labels = ["Acme Inc", "#A-204", "$12,000", "Aug 1", "Sarah Chen", "accounts@…"];
  for (let k = 0; k < factCount; k++) { const idx = Math.floor((k + 0.5) * count / factCount); pts[idx].fact = k; pts[idx].label = labels[k]; }
  return pts;
}
function AnimatedOrb({ reveal, appear }) {
  const pts = React.useMemo(() => buildSphere(58, 6), []);
  const [m, setM] = React.useState({ rx: 0, ry: 0, mx: -999, my: -999, on: false });
  const ry = -0.35 + m.ry, rx = 0.16 + m.rx, persp = 1.85;
  const proj = pts.map((p) => {
    const x1 = p.x * Math.cos(ry) - p.z * Math.sin(ry), z1 = p.x * Math.sin(ry) + p.z * Math.cos(ry);
    const y1 = p.y * Math.cos(rx) - z1 * Math.sin(rx), z2 = p.y * Math.sin(rx) + z1 * Math.cos(rx);
    const f = persp / (persp - z2);
    let sx = CX + x1 * RAD * f, sy = CY + y1 * RAD * f;
    if (m.on) { const dx = sx - m.mx, dy = sy - m.my, d = Math.hypot(dx, dy), R = 62; if (d < R && d > 0.01) { const push = (1 - d / R) * 26; sx += (dx / d) * push; sy += (dy / d) * push; } }
    return { sx, sy, z: z2, f, p };
  });
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); setM({ ry: (e.clientX - r.left) / r.width - 0.5, rx: ((e.clientY - r.top) / r.height - 0.5) * 0.7, mx: (e.clientX - r.left) / r.width * CW, my: (e.clientY - r.top) / r.height * CH, on: true }); };
  const front = (z) => (z + 1) / 2;
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" onMouseMove={onMove} onMouseLeave={() => setM({ rx: 0, ry: 0, mx: -999, my: -999, on: false })}
      style={{ display: "block", cursor: "crosshair", opacity: appear ? 1 : 0, transition: "opacity .5s ease" }}>
      {proj.map((q, i) => {
        const isFact = q.p.fact >= 0, shown = isFact && q.p.fact < reveal;
        return <line key={"l" + i} x1={CX} y1={CY} x2={q.sx} y2={q.sy}
          stroke={isFact ? "#F0714E" : "rgba(255,253,248,1)"}
          strokeWidth={isFact ? 1.8 : 1}
          opacity={isFact ? (shown ? 0.45 + front(q.z) * 0.4 : 0) : 0.12 + front(q.z) * 0.2}
          style={{ transition: "opacity .4s ease" }} />;
      })}
      {proj.slice().sort((a, b) => a.z - b.z).map((q, i) => {
        const isFact = q.p.fact >= 0, shown = isFact && q.p.fact < reveal;
        if (isFact) return <g key={"p" + i} opacity={shown ? 1 : 0} style={{ transition: "opacity .4s ease" }}>
          <circle cx={q.sx} cy={q.sy} r={5 * q.f + 6} fill="rgba(240,113,78,0.22)" />
          <circle cx={q.sx} cy={q.sy} r={5 * q.f} fill="#F0714E" />
        </g>;
        return <circle key={"p" + i} cx={q.sx} cy={q.sy} r={2.1 * q.f} fill={`rgba(255,253,248,${(0.5 + front(q.z) * 0.45).toFixed(2)})`} />;
      })}
      {/* centre hub */}
      <circle cx={CX} cy={CY} r={20} fill="rgba(240,113,78,0.16)" />
      <circle cx={CX} cy={CY} r={8} fill="#F0714E" stroke="rgba(255,253,248,0.85)" strokeWidth="1.5" />
      {/* fact labels */}
      {proj.map((q, i) => {
        if (q.p.fact < 0 || q.p.fact >= reveal || q.z < -0.3) return null;
        return <text key={"t" + i} x={q.sx + 9} y={q.sy - 8} fontFamily="var(--dm-font-mono,monospace)" fontSize="10.5" fill="#F0714E" style={{ opacity: 0.95 }}>{q.p.label}</text>;
      })}
    </svg>
  );
}
function StepGraph({ reveal, appear }) {
  const { Logo } = DS3;
  return (
    <div style={{ height: "100%", background: "var(--dm-ink)", borderRadius: 16, border: "1px solid var(--dm-ink-border)", overflow: "hidden", boxShadow: "0 26px 56px -20px rgba(33,30,24,.5)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 15px", borderBottom: "1px solid var(--dm-ink-border)", display: "flex", alignItems: "center" }}>
        <Logo onDark dataSize={24} modoSize={17} />
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}><AnimatedOrb reveal={reveal} appear={appear} /></div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 15px", borderTop: "1px solid var(--dm-ink-border)", fontFamily: mono3, fontSize: 10.5, color: "var(--dm-text-on-ink-faint)" }}>
        <span>1,204 facts in your graph</span>
        <span style={{ color: "var(--dm-accent)", background: "rgba(228,89,59,0.14)", padding: "3px 8px", borderRadius: 999 }}>+{Math.min(reveal, 6)} linked</span>
      </div>
    </div>
  );
}

/* -------- macOS folder icon -------- */
function MacFolderIcon({ size = 54 }) {
  const id = React.useId();
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 200 164" style={{ display: "block", filter: "drop-shadow(0 3px 4px rgba(30,80,150,.32))" }}>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6FBAFB" /><stop offset="1" stopColor="#2E86EE" /></linearGradient>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9AD2FE" /><stop offset="0.5" stopColor="#5CACF8" /><stop offset="1" stopColor="#3892F2" /></linearGradient>
      </defs>
      <path d="M12 44 q0-16 16-16 h40 q8 0 12 6 l8 11 q4 6 12 6 h60 q16 0 16 16 v74 q0 16-16 16 H28 q-16 0-16-16 Z" fill={`url(#b${id})`} />
      <path d="M12 70 q0-13 15-13 h146 q15 0 15 13 v48 q0 16-16 16 H28 q-16 0-16-16 Z" fill={`url(#f${id})`} />
      <path d="M12 70 q0-13 15-13 h146 q15 0 15 13 v9 q-88 -13 -176 0 Z" fill="rgba(255,255,255,.28)" />
    </svg>
  );
}
function SideGlyph({ kind }) {
  const s = { width: 14, height: 14, display: "block", flexShrink: 0 }, stroke = "#4C90E8";
  if (kind === "clock") return <svg viewBox="0 0 16 16" style={s}><circle cx="8" cy="8" r="6.4" fill="none" stroke={stroke} strokeWidth="1.3" /><path d="M8 4.5V8l2.4 1.6" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" /></svg>;
  if (kind === "doc") return <svg viewBox="0 0 16 16" style={s}><path d="M4 2h5l3 3v9H4Z" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" /><path d="M9 2v3h3" fill="none" stroke={stroke} strokeWidth="1.3" /></svg>;
  if (kind === "money") return <svg viewBox="0 0 16 16" style={s}><rect x="2" y="4" width="12" height="8" rx="1.4" fill="none" stroke={stroke} strokeWidth="1.3" /><circle cx="8" cy="8" r="1.8" fill="none" stroke={stroke} strokeWidth="1.3" /></svg>;
  return <svg viewBox="0 0 16 16" style={s}><path d="M2 5q0-1.4 1.4-1.4h3q.8 0 1.2.7l.5.9h5.5Q15 5.2 15 6.6V11q0 1.4-1.4 1.4H3.4Q2 12.4 2 11Z" fill={stroke} /></svg>;
}
function MacFolder({ selected }) {
  const folders = [["Acme Inc", "5 items", true], ["Northwind", "3 items", false], ["Globex", "2 items", false]];
  const side = [["Recents", "clock", false], ["Documents", "doc", false], ["Clients", "folder", true], ["Invoices", "money", false]];
  return (
    <div style={{ borderRadius: 11, overflow: "hidden", border: "1px solid #CFC9BC", boxShadow: "0 14px 30px rgba(33,30,24,.16)", background: "#fff", fontFamily: "-apple-system, var(--dm-font-body)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#ECEAE6", borderBottom: "1px solid #DAD6CE" }}>
        <span style={{ display: "flex", gap: 6 }}>{["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />)}</span>
        <span style={{ margin: "0 auto", fontSize: 12.5, fontWeight: 600, color: "#4B4640", transform: "translateX(-14px)" }}>Clients</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "116px 1fr", minHeight: 150 }}>
        <div style={{ background: "#EEECE7", borderRight: "1px solid #E2DED6", padding: "10px 8px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#A9A296", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 6px 6px" }}>Favorites</div>
          {side.map(([l, k, on]) => <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 7px", borderRadius: 6, background: on ? "#D6D2C9" : "transparent", fontSize: 12, color: "#3C382F", marginBottom: 1 }}><SideGlyph kind={k} />{l}</div>)}
        </div>
        <div style={{ padding: "16px 14px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px 4px", alignContent: "start", background: "#fff" }}>
          {folders.map(([name, items, sel], i) => {
            const active = sel && selected;
            return <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "6px 2px", borderRadius: 7, background: active ? "#E3EEFB" : "transparent", transform: active ? "scale(1.04)" : "scale(1)", transition: "background .3s ease, transform .3s ease", opacity: 1, animationDelay: `${i * 0.12}s` }}>
              <MacFolderIcon />
              <span style={{ fontSize: 11.5, padding: active ? "1px 6px" : "1px 0", borderRadius: 4, background: active ? "#3E8EF0" : "transparent", color: active ? "#fff" : "#3C382F", fontWeight: active ? 500 : 400, textAlign: "center", transition: "background .3s ease, color .3s ease" }}>{name}</span>
              <span style={{ fontSize: 9.5, color: "#A9A296", fontFamily: mono3 }}>{items}</span>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

/* -------- step 3: aligned table + folder -------- */
const T_COLS = "26px 1.15fr 0.8fr 1fr";
function MiniTable({ rowIn }) {
  const [hover, setHover] = React.useState(-1);
  const rows = [["#A-198", "Northwind", "$3,400", false], ["#A-204", "Acme Inc", "$12,000", true], ["#A-201", "Globex", "$8,750", false], ["#A-205", "Acme Inc", "$6,200", false]];
  const cell = { padding: "9px 12px", display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <MacWindow3 title="datamodo — invoices">
      <div style={{ display: "grid", gridTemplateColumns: T_COLS, fontFamily: mono3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--dm-text-faint)", background: "var(--dm-surface-sunk)" }}>
        <span style={{ ...cell, padding: "8px 0", justifyContent: "center" }}>#</span>
        <span style={{ ...cell, padding: "8px 12px" }}>Invoice</span>
        <span style={{ ...cell, padding: "8px 12px" }}>Client</span>
        <span style={{ ...cell, padding: "8px 12px", justifyContent: "flex-end" }}>Amount</span>
      </div>
      {rows.map(([inv, client, amt, acc], i) => {
        const bg = acc ? "var(--dm-accent-tint-2)" : hover === i ? "var(--dm-surface-sunk)" : "transparent";
        return (
        <div key={inv} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} style={{ display: "grid", gridTemplateColumns: T_COLS, alignItems: "center", fontSize: 12.5, borderTop: "1px solid #F1EDE4", color: acc ? "var(--dm-ink)" : "var(--dm-text-body-2)", background: bg, boxShadow: acc ? "inset 3px 0 0 var(--dm-accent)" : "none", cursor: "default", opacity: i < rowIn ? 1 : 0, transform: i < rowIn ? "none" : "translateY(-6px)", transition: "opacity .35s ease, transform .35s ease, background .15s ease" }}>
          <span style={{ ...cell, padding: "10px 0", justifyContent: "center", fontFamily: mono3, fontSize: 11, color: acc ? "var(--dm-accent)" : "var(--dm-text-faint)" }}>{i + 1}</span>
          <span style={{ ...cell, fontWeight: 600, fontFamily: mono3, fontSize: 12, color: "var(--dm-ink)" }}>{inv}</span>
          <span style={{ ...cell, fontSize: 12.5, color: "var(--dm-text-body)" }}>{client}</span>
          <span style={{ ...cell, justifyContent: "flex-end", fontFamily: mono3, fontSize: 11.5, color: acc ? "var(--dm-accent)" : "var(--dm-text-body-2)", fontWeight: acc ? 600 : 400 }}>{amt}</span>
        </div>
      );})}
    </MacWindow3>
  );
}
function StepStore({ tableRows, folderIn, folderSel }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <MiniTable rowIn={tableRows} />
      <div style={{ marginTop: "auto", opacity: folderIn ? 1 : 0, transform: folderIn ? "none" : "translateY(10px)", transition: "opacity .45s ease, transform .45s ease", boxShadow: "0 22px 48px -18px rgba(33,30,24,.34)", borderRadius: 11 }}>
        <MacFolder selected={folderSel} />
      </div>
    </div>
  );
}

/* -------- timeline driver — runs ONCE, then freezes (everything stays + interactive) -------- */
const END = 9400;
function ThreeSteps() {
  const reduce = React.useRef(!!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  const [t, setT] = React.useState(reduce.current ? END : 0);
  const [started, setStarted] = React.useState(reduce.current);
  const secRef = React.useRef(null);

  React.useEffect(() => {
    if (started) return;
    const el = secRef.current;
    const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) { setStarted(true); io.disconnect(); } }, { threshold: 0.25 });
    if (el) io.observe(el);
    return () => io.disconnect();
  }, [started]);

  React.useEffect(() => {
    if (!started || reduce.current) return;
    let raf, start = null;
    const tick = (ts) => {
      if (start == null) start = ts;
      const el = ts - start;
      if (el >= END) { setT(END); return; }
      setT(el); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  const step1In = t > 300;
  const step2In = t > 3500;
  const step3In = t > 6800;
  const facts = Math.max(0, Math.min(6, Math.floor((t - 900) / 300)));
  const dots1 = t > 2900 && t < 3600;
  const orbReveal = Math.max(0, Math.min(6, Math.floor((t - 3950) / 340)));
  const dots2 = t > 6200 && t < 6900;
  const tableRows = t < 7000 ? 0 : Math.min(4, 1 + Math.floor((t - 7000) / 220));
  const folderIn = t > 7900;
  const folderSel = t > 8500;

  const done = t >= END;
  const liveStep = done ? 0 : t < 3500 ? 1 : t < 6800 ? 2 : 3;
  const colStyle = (inn) => ({ flex: "1 1 300px", minWidth: 288, maxWidth: 376, display: "flex", flexDirection: "column", background: "var(--dm-surface)", border: "1px solid var(--dm-border)", borderRadius: 20, padding: "18px 18px 20px", boxShadow: "var(--dm-shadow-card, 0 1px 2px rgba(33,30,24,.05))", opacity: inn ? 1 : 0, transform: inn ? "none" : "translateY(20px)", transition: "opacity .55s ease, transform .55s cubic-bezier(0.16,1,0.3,1)" });
  const desc = { fontSize: 13, lineHeight: 1.5, color: "var(--dm-text-body)", minHeight: 40, margin: "0 0 14px" };
  const viz = { height: STEP_H };
  return (
    <section id="how" ref={secRef} style={{ maxWidth: MAX3, margin: "0 auto", padding: "20px 28px 64px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto 44px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><Eyebrow3>how it works</Eyebrow3></div>
        <h2 style={{ fontFamily: display3, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 14 }}>One email in. A connected brain out.</h2>
        <p style={{ fontSize: 17, color: "#57534A" }}>Forward a message. Watch datamodo pull out the facts, weave them into what you already know, and file everything where it belongs.</p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "center", gap: 8 }}>
        <div style={colStyle(step1In)}>
          <StepBadge n="1" label="forward it" live={liveStep === 1} />
          <p style={desc}><Typewriter text="Forward any message — datamodo reads it and pulls out the facts for you." play={step1In} /></p>
          <div style={viz}><StepEmail n={facts} /></div>
        </div>
        <FlowDots active={dots1} />
        <div style={colStyle(step2In)}>
          <StepBadge n="2" label="linked in" live={liveStep === 2} />
          <p style={desc}><Typewriter text="Each fact links into your knowledge graph, next to what you already knew." play={step2In} /></p>
          <div style={viz}><StepGraph reveal={orbReveal} appear={step2In} /></div>
        </div>
        <FlowDots active={dots2} />
        <div style={colStyle(step3In)}>
          <StepBadge n="3" label="filed away" live={liveStep === 3} />
          <p style={desc}><Typewriter text="Clean rows land in your tables — and files sort into the right folders." play={step3In} /></p>
          <div style={viz}><StepStore tableRows={tableRows} folderIn={folderIn} folderSel={folderSel} /></div>
        </div>
      </div>
    </section>
  );
}

window.LandingSteps = { ThreeSteps };
