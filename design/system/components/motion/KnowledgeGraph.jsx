import React from "react";

/**
 * datamodo KnowledgeGraph — the animated, INTERACTIVE node-link graph that
 * visualizes how datamodo links the people, companies, invoices and messages
 * it extracts. datamodo's signature "break from the card pile" element.
 *
 * Interactivity:
 *  - On mount, edges DRAW in and nodes POP in, staggered.
 *  - HOVER a node → light its connections in coral, dim the rest.
 *  - DRAG a node (pointer down + move) → hold and rearrange it; edges follow
 *    live. Cursor becomes grab / grabbing.
 *  - CLICK a node → pin it open in the inspector panel (connections + facts).
 *    Click empty canvas or the ✕ to close.
 * All motion respects prefers-reduced-motion.
 *
 * Nodes:  [{ id, label, x, y, type, facts? }]
 *         type: hub|company|person|invoice|amount|message
 * Edges:  [{ from, to }]
 * Coordinates are in the 500×340 viewBox; a sensible datamodo graph is built in.
 */

const DEFAULT_NODES = [
  { id: "inbox",   label: "your inbox",  x: 250, y: 172, type: "hub",     facts: ["6 sources connected", "1,204 messages parsed"] },
  { id: "acme",    label: "Acme Inc",    x: 116, y: 74,  type: "company", facts: ["Domain · acme.co", "2 open invoices", "Primary contact · Dana Okafor"] },
  { id: "north",   label: "Northwind",   x: 402, y: 78,  type: "company", facts: ["Domain · northwind.io", "Renewal · Aug 2026"] },
  { id: "globex",  label: "Globex",      x: 418, y: 262, type: "company", facts: ["Domain · globex.com", "1 open invoice"] },
  { id: "dana",    label: "Dana Okafor", x: 256, y: 44,  type: "person",  facts: ["dana@acme.co", "Role · Finance lead", "Last seen · 2h ago"] },
  { id: "priya",   label: "Priya S.",    x: 452, y: 172, type: "person",  facts: ["priya@northwind.io", "Role · Founder"] },
  { id: "inv204",  label: "#A-204",      x: 92,  y: 178, type: "invoice", facts: ["Issued · Mar 3, 2026", "Due · Mar 31, 2026", "Status · Unpaid"] },
  { id: "amt",     label: "$12,000",     x: 128, y: 278, type: "amount",  facts: ["Currency · USD", "On invoice #A-204"] },
  { id: "inv201",  label: "#A-201",      x: 300, y: 300, type: "invoice", facts: ["Issued · Feb 12, 2026", "Status · Paid"] },
  { id: "msg",     label: "Ski trip 🏔",  x: 470, y: 306, type: "message", facts: ["Thread · 8 messages", "From · Globex"] },
];

const DEFAULT_EDGES = [
  { from: "inbox", to: "acme" }, { from: "inbox", to: "north" }, { from: "inbox", to: "globex" },
  { from: "inbox", to: "dana" }, { from: "inbox", to: "priya" }, { from: "inbox", to: "inv204" },
  { from: "inbox", to: "inv201" }, { from: "acme", to: "inv204" }, { from: "acme", to: "dana" },
  { from: "inv204", to: "amt" }, { from: "north", to: "priya" }, { from: "globex", to: "inv201" },
  { from: "globex", to: "msg" },
];

const TYPE_STYLES = {
  hub:     { fill: "var(--dm-accent, #E4593B)",        text: "var(--dm-accent-on, #FFF8F4)",  border: "none",                              weight: 700, font: "var(--dm-font-display, sans-serif)" },
  company: { fill: "var(--dm-ink, #211E18)",           text: "var(--dm-text-on-ink, #F1ECE1)",border: "none",                              weight: 600, font: "var(--dm-font-body, sans-serif)" },
  person:  { fill: "var(--dm-surface, #FFFDF8)",       text: "var(--dm-ink, #211E18)",        border: "var(--dm-border, #E7E0D2)",         weight: 500, font: "var(--dm-font-body, sans-serif)" },
  invoice: { fill: "var(--dm-surface-sunk, #FAF6EE)",  text: "var(--dm-text-body, #514C43)",  border: "var(--dm-border-2, #E1D9C8)",       weight: 500, font: "var(--dm-font-mono, monospace)" },
  amount:  { fill: "var(--dm-accent-tint-2, #FDF1EC)", text: "var(--dm-accent, #E4593B)",     border: "var(--dm-accent-tint-border, #F3D6CB)", weight: 600, font: "var(--dm-font-mono, monospace)" },
  message: { fill: "var(--dm-surface, #FFFDF8)",       text: "var(--dm-text-body-2, #57534A)",border: "var(--dm-border, #E7E0D2)",         weight: 500, font: "var(--dm-font-body, sans-serif)" },
};

const TYPE_LABEL = { hub: "hub", company: "company", person: "person", invoice: "invoice", amount: "amount", message: "message" };

export function KnowledgeGraph({
  nodes = DEFAULT_NODES,
  edges = DEFAULT_EDGES,
  width = "100%",
  play = true,
  draggable = true,
  onSelect,
  style = {},
  ...rest
}) {
  const [mounted, setMounted] = React.useState(!play);
  const [hover, setHover] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [pos, setPos] = React.useState(() => {
    const m = {}; nodes.forEach((n) => (m[n.id] = { x: n.x, y: n.y })); return m;
  });
  const svgRef = React.useRef(null);
  const drag = React.useRef({ id: null, dx: 0, dy: 0, moved: false });
  const [dragId, setDragId] = React.useState(null);

  React.useEffect(() => {
    const m = {}; nodes.forEach((n) => (m[n.id] = { x: n.x, y: n.y })); setPos(m);
  }, [nodes]);

  React.useEffect(() => {
    if (!play) return;
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [play]);

  const byId = React.useMemo(() => { const m = {}; nodes.forEach((n) => (m[n.id] = n)); return m; }, [nodes]);

  const neighbors = React.useMemo(() => {
    const m = {}; nodes.forEach((n) => (m[n.id] = new Set([n.id])));
    edges.forEach((e) => { (m[e.from] ||= new Set()).add(e.to); (m[e.to] ||= new Set()).add(e.from); });
    return m;
  }, [nodes, edges]);

  const focus = hover || selected;
  const isEdgeActive = (e) => focus && (e.from === focus || e.to === focus);
  const isNodeActive = (n) => !focus || neighbors[focus]?.has(n.id);

  const CHIP_H = 30;
  const chipW = (n) => Math.max(n.type === "hub" ? 92 : 58, n.label.length * 7.2 + (n.type === "hub" ? 22 : 18));

  const toSVG = (clientX, clientY) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };

  const onNodeDown = (e, id) => {
    if (!draggable) return;
    e.stopPropagation();
    const p = toSVG(e.clientX, e.clientY);
    drag.current = { id, dx: pos[id].x - p.x, dy: pos[id].y - p.y, moved: false };
    setDragId(id);
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onSvgMove = (e) => {
    const d = drag.current; if (!d.id) return;
    const p = toSVG(e.clientX, e.clientY);
    const nx = Math.max(8, Math.min(492, p.x + d.dx));
    const ny = Math.max(20, Math.min(320, p.y + d.dy));
    d.moved = true;
    setPos((prev) => ({ ...prev, [d.id]: { x: nx, y: ny } }));
  };
  const onSvgUp = (e) => {
    const d = drag.current;
    if (d.id && !d.moved) {
      const next = selected === d.id ? null : d.id;
      setSelected(next); onSelect && onSelect(next ? byId[next] : null);
    }
    drag.current = { id: null, dx: 0, dy: 0, moved: false };
    setDragId(null);
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  const sel = selected ? byId[selected] : null;
  const selConns = selected ? nodes.filter((n) => n.id !== selected && neighbors[selected]?.has(n.id)) : [];

  return (
    <div style={{ position: "relative", width, ...style }}>
      <svg
        ref={svgRef}
        viewBox="0 0 500 340"
        width="100%"
        role="img"
        aria-label="datamodo knowledge graph — drag nodes to rearrange, click to inspect"
        style={{ display: "block", overflow: "visible", fontSize: 12, touchAction: "none", cursor: dragId ? "grabbing" : "default" }}
        onMouseLeave={() => setHover(null)}
        onPointerMove={onSvgMove}
        onPointerUp={onSvgUp}
        onPointerDown={() => { if (selected) { setSelected(null); onSelect && onSelect(null); } }}
        {...rest}
      >
        <g>
          {edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            if (!a || !b) return null;
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            const active = isEdgeActive(e);
            const dim = focus && !active;
            const live = dragId === e.from || dragId === e.to;
            return (
              <line
                key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={active ? "var(--dm-accent, #E4593B)" : "var(--dm-border-3, #DDD5C5)"}
                strokeWidth={active ? 2 : 1.25} strokeLinecap="round"
                style={{
                  strokeDasharray: live ? "none" : len,
                  strokeDashoffset: mounted || live ? 0 : len,
                  opacity: mounted ? (dim ? 0.26 : 1) : 0,
                  transition: live ? "stroke 120ms ease, stroke-width 120ms ease" :
                    "stroke-dashoffset var(--dm-dur-slower,720ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)) " + i * 45 + "ms, stroke var(--dm-dur,220ms) ease, stroke-width var(--dm-dur,220ms) ease, opacity var(--dm-dur,220ms) ease",
                }}
              />
            );
          })}
        </g>

        <g>
          {nodes.map((n, i) => {
            const st = TYPE_STYLES[n.type] || TYPE_STYLES.person;
            const w = chipW(n);
            const p = pos[n.id] || { x: n.x, y: n.y };
            const active = isNodeActive(n);
            const focused = focus === n.id;
            const isDragging = dragId === n.id;
            const isSel = selected === n.id;
            const delay = 260 + i * 60;
            return (
              <g
                key={n.id}
                tabIndex={0}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onPointerDown={(e) => onNodeDown(e, n.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const nx = isSel ? null : n.id; setSelected(nx); onSelect && onSelect(nx ? n : null); } }}
                style={{
                  cursor: draggable ? (isDragging ? "grabbing" : "grab") : "pointer",
                  outline: "none",
                  opacity: mounted ? (active ? 1 : 0.32) : 0,
                  transform: `translate(${p.x}px, ${p.y}px) scale(${mounted ? (isDragging ? 1.12 : focused ? 1.08 : 1) : 0.4})`,
                  transformBox: "fill-box", transformOrigin: "center",
                  transition: isDragging ? "none" :
                    "opacity var(--dm-dur,220ms) ease, transform var(--dm-dur-slow,420ms) var(--dm-ease-spring,cubic-bezier(0.34,1.32,0.5,1)) " + (mounted ? "0ms" : delay + "ms"),
                }}
              >
                {(n.type === "hub" || isSel) && (
                  <rect
                    x={-w / 2} y={-CHIP_H / 2} width={w} height={CHIP_H} rx={CHIP_H / 2}
                    fill="none" stroke="var(--dm-accent, #E4593B)" strokeWidth={1.5}
                    style={{ transformBox: "fill-box", transformOrigin: "center", animation: play && !isSel ? "dm-pulse-ring var(--dm-dur-float,6000ms) var(--dm-ease-bob,ease) infinite" : "none", opacity: isSel ? 1 : undefined }}
                  />
                )}
                <rect
                  x={-w / 2} y={-CHIP_H / 2} width={w} height={CHIP_H} rx={CHIP_H / 2}
                  fill={st.fill} stroke={st.border === "none" ? "none" : st.border} strokeWidth={st.border === "none" ? 0 : 1}
                  style={{
                    filter: isDragging ? "drop-shadow(0 16px 30px rgba(33,30,24,.30))" : focused ? "drop-shadow(0 8px 18px rgba(228,89,59,.32))" : "drop-shadow(0 8px 20px rgba(33,30,24,.14))",
                    transition: "filter var(--dm-dur,220ms) ease",
                  }}
                />
                <text
                  x={0} y={1} textAnchor="middle" dominantBaseline="middle" fill={st.text}
                  style={{ fontFamily: st.font, fontWeight: st.weight, fontSize: n.type === "hub" ? 14 : 12, letterSpacing: st.font.includes("mono") ? "0.02em" : "-0.01em", pointerEvents: "none" }}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* inspector panel — opens when a node is clicked */}
      {sel && (
        <div
          style={{
            position: "absolute", top: 10, right: 10, width: 208,
            background: "var(--dm-surface, #FFFDF8)", border: "1px solid var(--dm-border, #E7E0D2)",
            borderRadius: 14, boxShadow: "0 18px 40px rgba(33,30,24,.16)", padding: "13px 14px 14px",
            animation: "dm-drop-in var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--dm-font-mono, monospace)", fontSize: 9.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--dm-accent, #E4593B)" }}>{TYPE_LABEL[sel.type]}</span>
            <button
              onClick={() => { setSelected(null); onSelect && onSelect(null); }}
              aria-label="Close inspector"
              style={{ border: "none", background: "transparent", color: "var(--dm-text-faint, #A39B8B)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2 }}
            >×</button>
          </div>
          <div style={{ fontFamily: "var(--dm-font-display, sans-serif)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: "var(--dm-ink, #211E18)", lineHeight: 1.15 }}>{sel.label}</div>
          {sel.facts && sel.facts.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 5 }}>
              {sel.facts.map((f, i) => (
                <div key={i} style={{ fontSize: 11.5, color: "var(--dm-text-body-2, #57534A)", lineHeight: 1.4, display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--dm-accent, #E4593B)", fontWeight: 700 }}>·</span>{f}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid var(--dm-border-soft, #EFE9DC)" }}>
            <div style={{ fontFamily: "var(--dm-font-mono, monospace)", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--dm-text-faint, #A39B8B)", marginBottom: 7 }}>
              {selConns.length} link{selConns.length === 1 ? "" : "s"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {selConns.map((c) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
                  onClick={() => { setSelected(c.id); onSelect && onSelect(c); }}
                  style={{
                    border: "1px solid var(--dm-border-2, #E1D9C8)", background: "var(--dm-surface-sunk, #FAF6EE)",
                    borderRadius: 999, padding: "3px 9px", fontSize: 11, color: "var(--dm-text-body, #514C43)",
                    cursor: "pointer", fontFamily: c.type === "invoice" || c.type === "amount" ? "var(--dm-font-mono, monospace)" : "inherit",
                    transition: "background var(--dm-dur,220ms) ease, border-color var(--dm-dur,220ms) ease",
                  }}
                >{c.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* hint */}
      <div style={{ position: "absolute", left: 12, bottom: 4, fontFamily: "var(--dm-font-mono, monospace)", fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dm-text-faint, #A39B8B)", pointerEvents: "none", opacity: 0.85 }}>
        {draggable ? "Drag to rearrange · click to inspect" : "Click to inspect"}
      </div>
    </div>
  );
}
