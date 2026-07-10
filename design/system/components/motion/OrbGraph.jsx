import React from "react";

/**
 * datamodo OrbGraph — an abstract 3D knowledge-graph orb. A sphere of points,
 * each wired to a central coral hub by a radial spoke; a handful of "concept"
 * points and their spokes glow coral (the facts datamodo just detected).
 * Static at rest — rotates and tilts toward the pointer on hover, and the
 * points flee the cursor (repel). Light points on a dark surface.
 * Canvas-rendered for many points. Honors prefers-reduced-motion.
 *
 * concepts: string[] of labels to highlight (defaults to the sample email's facts).
 */
const DEFAULT_CONCEPTS = ["Acme Inc", "Sarah Chen", "#A-204", "$12,000", "Aug 1", "accounts@acme.com"];

export function OrbGraph({ concepts = DEFAULT_CONCEPTS, height = 360, count = 78, style = {} }) {
  const wrapRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const S = React.useRef({ points: [], edges: [], rot: -0.35, tilt: 0.16, rotT: -0.35, tiltT: 0.16, mouse: { x: -9999, y: -9999, active: false }, raf: 0, w: 0, h: 0, reduce: false });

  React.useEffect(() => {
    const st = S.current;
    st.reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    // fibonacci sphere
    const pts = [];
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      pts.push({ x: Math.cos(phi) * r, y, z: Math.sin(phi) * r, hi: null });
    }
    // evenly spread the highlighted concepts across the cloud
    concepts.forEach((label, k) => {
      const idx = Math.floor((k + 0.5) * count / concepts.length);
      pts[idx].hi = label;
    });
    const hiIdx = pts.map((p, i) => (p.hi ? i : -1)).filter((i) => i >= 0);
    st.points = pts;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let dpr = 1;
    const resize = () => {
      const rect = wrapRef.current.getBoundingClientRect();
      st.w = rect.width || 400; st.h = height; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = st.w * dpr; canvas.height = st.h * dpr;
      canvas.style.width = st.w + "px"; canvas.style.height = st.h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

    const draw = () => {
      const w = st.w, h = st.h;
      ctx.clearRect(0, 0, w, h);
      // static by default; rotate/tilt only toward the pointer, ease back to rest when idle
      if (st.mouse.active && !st.reduce) {
        st.rotT = -0.35 + (st.mouse.x / w - 0.5) * 1.5;
        st.tiltT = 0.16 + (st.mouse.y / h - 0.5) * 0.9;
      } else { st.rotT = -0.35; st.tiltT = 0.16; }
      st.rot += (st.rotT - st.rot) * 0.08;
      st.tilt += (st.tiltT - st.tilt) * 0.08;
      const cx = w / 2, cy = h / 2, scale = Math.min(w, h) * 0.42, persp = 1.85;
      const cR = Math.cos(st.rot), sR = Math.sin(st.rot);
      const cT = Math.cos(st.tilt), sT = Math.sin(st.tilt);

      const proj = st.points.map((p) => {
        const x = p.x * cR - p.z * sR, z1 = p.x * sR + p.z * cR, y = p.y;
        const y2 = y * cT - z1 * sT, z2 = y * sT + z1 * cT;
        const f = persp / (persp - z2);
        return { sx: cx + x * scale * f, sy: cy + y2 * scale * f, z: z2, f, p };
      });

      if (st.mouse.active) {
        const R = 95;
        proj.forEach((q) => {
          const dx = q.sx - st.mouse.x, dy = q.sy - st.mouse.y, d = Math.hypot(dx, dy);
          if (d < R && d > 0.01) { const push = (1 - d / R) * 30; q.sx += (dx / d) * push; q.sy += (dy / d) * push; }
        });
      }

      // radial spokes: every point wired to the centre; facts glow coral
      st.points.forEach((_, i) => {
        const q = proj[i];
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(q.sx, q.sy);
        const front = (q.z + 1) / 2; // 0 back … 1 front
        if (q.p.hi) { ctx.strokeStyle = `rgba(233,110,80,${(0.55 + front * 0.4).toFixed(2)})`; ctx.lineWidth = 1.8; }
        else { ctx.strokeStyle = `rgba(255,253,248,${(0.14 + front * 0.22).toFixed(2)})`; ctx.lineWidth = 1; }
        ctx.stroke();
      });

      proj.sort((a, b) => a.z - b.z);
      proj.forEach((q) => {
        const front = 0.4 + (q.z + 1) / 2 * 0.6;
        if (q.p.hi) {
          const s = 5 * q.f;
          ctx.beginPath(); ctx.arc(q.sx, q.sy, s + 7, 0, 7); ctx.fillStyle = "rgba(233,110,80,0.22)"; ctx.fill();
          ctx.beginPath(); ctx.arc(q.sx, q.sy, s, 0, 7); ctx.fillStyle = "#F0714E"; ctx.fill();
          ctx.beginPath(); ctx.arc(q.sx - s * 0.3, q.sy - s * 0.3, s * 0.4, 0, 7); ctx.fillStyle = "rgba(255,235,225,0.9)"; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(q.sx, q.sy, 2.1 * q.f, 0, 7);
          ctx.fillStyle = "rgba(255,253,248," + (0.5 + (q.z + 1) / 2 * 0.45).toFixed(2) + ")"; ctx.fill();
        }
      });

      // centre hub
      ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 7); ctx.fillStyle = "rgba(233,110,80,0.16)"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 7); ctx.fillStyle = "#F0714E"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 7); ctx.strokeStyle = "rgba(255,253,248,0.85)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 2.4, cy - 2.4, 3, 0, 7); ctx.fillStyle = "rgba(255,235,225,0.95)"; ctx.fill();

      ctx.font = "500 11px ui-monospace, 'Geist Mono', monospace";
      proj.forEach((q) => {
        if (q.p.hi && q.z > -0.25) {
          const tw = ctx.measureText(q.p.hi).width, lx = q.sx + 9, ly = q.sy - 9;
          ctx.fillStyle = "rgba(255,253,248,0.94)"; rr(lx - 5, ly - 12, tw + 10, 18, 5); ctx.fill();
          ctx.strokeStyle = "rgba(228,89,59,0.28)"; ctx.lineWidth = 1; rr(lx - 5, ly - 12, tw + 10, 18, 5); ctx.stroke();
          ctx.fillStyle = "#E4593B"; ctx.fillText(q.p.hi, lx, ly + 1.5);
        }
      });

      st.raf = requestAnimationFrame(draw);
    };
    st.raf = requestAnimationFrame(draw);

    const onMove = (e) => { const r = canvas.getBoundingClientRect(); st.mouse.x = e.clientX - r.left; st.mouse.y = e.clientY - r.top; st.mouse.active = true; };
    const onLeave = () => { st.mouse.active = false; st.mouse.x = -9999; st.mouse.y = -9999; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(st.raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [concepts, count, height]);

  return (
    <div ref={wrapRef} style={{ width: "100%", ...style }}>
      <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair" }} />
    </div>
  );
}
