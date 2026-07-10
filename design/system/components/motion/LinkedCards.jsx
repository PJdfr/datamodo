import React from "react";

/**
 * datamodo LinkedCards — the signature "break the card pile" primitive.
 *
 * Lay out real content cards anywhere (grid, flex, free) and declare the
 * relationships between them; LinkedCards draws smooth animated connectors
 * between the actual DOM positions of the cards. On mount / scroll-in the
 * connectors DRAW themselves, a dashed pulse "flows" along each edge to
 * suggest data moving, and hovering (or focusing) any card lights the edges
 * and cards it touches while dimming the rest — so a stack of boxes reads as
 * one living, connected graph instead of a monotonous pile.
 *
 * Positions are measured from the live DOM (ResizeObserver + window resize),
 * so it stays correct when cards reflow. Everything settles to the finished,
 * fully-connected state under prefers-reduced-motion.
 *
 * Usage:
 *   <LinkedCards links={[["a","b"],["b","c"]]} style={{ ... layout ... }}>
 *     <LinkedCard id="a"> ... </LinkedCard>
 *     <LinkedCard id="b"> ... </LinkedCard>
 *     <LinkedCard id="c"> ... </LinkedCard>
 *   </LinkedCards>
 */

const LinkCtx = React.createContext(null);

function edgePoint(r, tx, ty) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function pathBetween(a, b) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p1 = edgePoint(a, bc.x, bc.y);
  const p2 = edgePoint(b, ac.x, ac.y);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let c1, c2;
  if (Math.abs(dy) >= Math.abs(dx)) {
    c1 = { x: p1.x, y: p1.y + dy * 0.5 };
    c2 = { x: p2.x, y: p2.y - dy * 0.5 };
  } else {
    c1 = { x: p1.x + dx * 0.5, y: p1.y };
    c2 = { x: p2.x - dx * 0.5, y: p2.y };
  }
  return {
    d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`,
    p1,
    p2,
  };
}

export function LinkedCards({
  children,
  links = [],
  animate = true,
  flow = true,
  style = {},
  ...rest
}) {
  const wrapRef = React.useRef(null);
  const nodes = React.useRef(new Map());
  const [rects, setRects] = React.useState({});
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [hover, setHover] = React.useState(null);
  const [drawn, setDrawn] = React.useState(!animate);

  const measure = React.useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    const next = {};
    nodes.current.forEach((el, id) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      next[id] = {
        x: r.left - base.left,
        y: r.top - base.top,
        w: r.width,
        h: r.height,
      };
    });
    setRects(next);
    setSize({ w: base.width, h: base.height });
  }, []);

  const register = React.useCallback((id, el) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  }, []);

  // measure on layout changes
  React.useEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(wrap);
      nodes.current.forEach((el) => el && ro.observe(el));
    }
    window.addEventListener("resize", schedule);
    // fonts can shift layout after load
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    const t = setTimeout(measure, 240);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro && ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
    // re-run when the set of children changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, React.Children.count(children)]);

  // draw-in when scrolled into view
  React.useEffect(() => {
    if (!animate) return;
    const wrap = wrapRef.current;
    if (!wrap || typeof IntersectionObserver === "undefined") {
      setDrawn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setDrawn(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, [animate]);

  const neighbors = React.useMemo(() => {
    const m = {};
    links.forEach(([a, b]) => {
      (m[a] ||= new Set()).add(b);
      (m[b] ||= new Set()).add(a);
    });
    return m;
  }, [links]);

  const ctx = React.useMemo(
    () => ({ register, measure, hover, setHover, neighbors, dimOthers: !!hover }),
    [register, measure, hover, neighbors]
  );

  return (
    <LinkCtx.Provider value={ctx}>
      <div ref={wrapRef} style={{ position: "relative", ...style }} {...rest}>
        <svg
          aria-hidden="true"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 0 }}
        >
          {links.map(([from, to], i) => {
            const a = rects[from];
            const b = rects[to];
            if (!a || !b) return null;
            const { d, p1, p2 } = pathBetween(a, b);
            const active = hover === from || hover === to;
            const dim = hover && !active;
            const delay = 120 + i * 130;
            return (
              <g key={from + "~" + to} style={{ opacity: dim ? 0.22 : 1, transition: "opacity var(--dm-dur,220ms) ease" }}>
                <path
                  d={d}
                  fill="none"
                  stroke={active ? "var(--dm-accent, #E4593B)" : "var(--dm-border-3, #DDD5C5)"}
                  strokeWidth={active ? 2 : 1.5}
                  strokeLinecap="round"
                  pathLength="1"
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: drawn ? 0 : 1,
                    transition:
                      "stroke-dashoffset var(--dm-dur-slower,720ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)) " +
                      delay +
                      "ms, stroke var(--dm-dur,220ms) ease, stroke-width var(--dm-dur,220ms) ease",
                  }}
                />
                {/* flowing dashed pulse along the edge */}
                {flow && drawn && (
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--dm-accent, #E4593B)"
                    strokeWidth={active ? 2.5 : 1.75}
                    strokeLinecap="round"
                    strokeDasharray="3 26"
                    style={{
                      opacity: active ? 0.95 : 0.5,
                      animation: "dm-flow 2.6s linear infinite",
                      transition: "opacity var(--dm-dur,220ms) ease",
                    }}
                  />
                )}
                {[p1, p2].map((p, k) => (
                  <circle
                    key={k}
                    cx={p.x}
                    cy={p.y}
                    r={active ? 3.4 : 2.6}
                    fill={active ? "var(--dm-accent, #E4593B)" : "var(--dm-border-3, #DDD5C5)"}
                    style={{
                      opacity: drawn ? 1 : 0,
                      transition: "opacity var(--dm-dur,220ms) ease " + (delay + 220) + "ms, fill var(--dm-dur,220ms) ease, r var(--dm-dur,220ms) ease",
                    }}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        <div style={{ position: "relative", display: "contents", zIndex: 1 }}>{children}</div>
      </div>
    </LinkCtx.Provider>
  );
}

/**
 * A single card inside a LinkedCards graph. `id` must match the ids used in
 * the parent's `links`. Registers its live position, dims when another card's
 * neighborhood is focused, and lifts on hover.
 */
export function LinkedCard({
  id,
  children,
  tone = "cream",
  radius = 16,
  padding = 18,
  lift = true,
  tilt = false,
  glow = false,
  style = {},
  ...rest
}) {
  const ctx = React.useContext(LinkCtx);
  const ref = React.useRef(null);
  const [pt, setPt] = React.useState({ x: 0.5, y: 0.5, on: false });

  React.useEffect(() => {
    if (!ctx) return;
    ctx.register(id, ref.current);
    ctx.measure();
    return () => ctx.register(id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hover = ctx?.hover;
  const active = !hover || hover === id || ctx?.neighbors[hover]?.has(id);
  const focused = hover === id;
  const useMotion = (tilt || glow) && focused && pt.on;

  const onMove = (e) => {
    if (!tilt && !glow) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPt({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, on: true });
  };

  const tones = {
    cream: {
      background: "var(--dm-surface, #FFFDF8)",
      border: "1px solid var(--dm-border, #E7E0D2)",
      color: "var(--dm-ink, #211E18)",
    },
    ink: {
      background: "var(--dm-ink-surface, #2B2720)",
      border: "1px solid var(--dm-ink-border, #3A352C)",
      color: "var(--dm-text-on-ink, #F1ECE1)",
    },
    accent: {
      background: "var(--dm-accent-tint-2, #FDF1EC)",
      border: "1px solid var(--dm-accent-tint-border, #F3D6CB)",
      color: "var(--dm-ink, #211E18)",
    },
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      onMouseEnter={() => ctx?.setHover(id)}
      onMouseLeave={() => { ctx?.setHover(null); setPt((p) => ({ ...p, on: false })); }}
      onMouseMove={onMove}
      onFocus={() => ctx?.setHover(id)}
      onBlur={() => { ctx?.setHover(null); setPt((p) => ({ ...p, on: false })); }}
      style={{
        position: "relative",
        borderRadius: radius,
        padding,
        outline: "none",
        ...tones[tone],
        boxShadow: focused
          ? "var(--dm-shadow-window, 0 30px 60px -28px rgba(33,30,24,.5),0 6px 16px -8px rgba(33,30,24,.22))"
          : "var(--dm-shadow-card, 0 18px 44px -30px rgba(33,30,24,.35))",
        opacity: active ? 1 : 0.4,
        transformStyle: "preserve-3d",
        transform: tilt && useMotion
          ? `perspective(720px) rotateX(${((0.5 - pt.y) * 11).toFixed(2)}deg) rotateY(${((pt.x - 0.5) * 13).toFixed(2)}deg) translateY(-5px)`
          : lift && focused ? "translateY(var(--dm-lift, -4px))" : "translateY(0)",
        transition: (tilt && useMotion)
          ? "transform .12s ease-out, box-shadow var(--dm-dur-slow,420ms) ease, opacity var(--dm-dur,220ms) ease"
          : "transform var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)), box-shadow var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)), opacity var(--dm-dur,220ms) ease",
        ...style,
      }}
      {...rest}
    >
      {children}
      {glow && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, borderRadius: radius, pointerEvents: "none",
            background: `radial-gradient(circle at ${(pt.x * 100).toFixed(1)}% ${(pt.y * 100).toFixed(1)}%, rgba(228,89,59,0.30), rgba(228,89,59,0.06) 45%, rgba(228,89,59,0) 70%)`,
            opacity: useMotion ? 1 : 0,
            transition: "opacity var(--dm-dur,220ms) ease",
          }}
        />
      )}
    </div>
  );
}
