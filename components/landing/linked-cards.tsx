"use client";

/**
 * LinkedCards / LinkedCard (design/system/components/motion) — lays out real
 * content cards and draws animated connectors between their live DOM
 * positions: edges draw in on scroll, a dashed pulse flows along each edge,
 * and hovering/focusing a card lights its neighborhood while dimming the
 * rest. Positions re-measure on resize/reflow.
 */
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

type Rect = { x: number; y: number; w: number; h: number };
type Ctx = {
  register: (id: string, el: HTMLElement | null) => void;
  measure: () => void;
  hover: string | null;
  setHover: (id: string | null) => void;
  neighbors: Record<string, Set<string>>;
};

const LinkCtx = createContext<Ctx | null>(null);

function edgePoint(r: Rect, tx: number, ty: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function pathBetween(a: Rect, b: Rect) {
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
  style = {},
  className,
}: {
  children: ReactNode;
  links?: [string, string][];
  style?: CSSProperties;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    const next: Record<string, Rect> = {};
    nodes.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      next[id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    });
    setRects(next);
    setSize({ w: base.width, h: base.height });
  }, []);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  }, []);

  const childCount = Children.count(children);
  useEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(wrap);
      nodes.current.forEach((el) => ro!.observe(el));
    }
    window.addEventListener("resize", schedule);
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    const t = setTimeout(measure, 240);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [measure, childCount]);

  useEffect(() => {
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
      { threshold: 0.2 },
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, []);

  const neighbors = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    links.forEach(([a, b]) => {
      (m[a] ??= new Set()).add(b);
      (m[b] ??= new Set()).add(a);
    });
    return m;
  }, [links]);

  const ctx = useMemo(
    () => ({ register, measure, hover, setHover, neighbors }),
    [register, measure, hover, neighbors],
  );

  return (
    <LinkCtx.Provider value={ctx}>
      <div ref={wrapRef} className={className} style={{ position: "relative", ...style }}>
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
              <g
                key={`${from}~${to}`}
                style={{ opacity: dim ? 0.22 : 1, transition: "opacity var(--dm-dur) ease" }}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={active ? "var(--dm-accent)" : "var(--dm-border-3)"}
                  strokeWidth={active ? 2 : 1.5}
                  strokeLinecap="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: drawn ? 0 : 1,
                    transition: `stroke-dashoffset var(--dm-dur-slower) var(--dm-ease-out) ${delay}ms, stroke var(--dm-dur) ease, stroke-width var(--dm-dur) ease`,
                  }}
                />
                {drawn && (
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--dm-accent)"
                    strokeWidth={active ? 2.5 : 1.75}
                    strokeLinecap="round"
                    strokeDasharray="3 26"
                    style={{
                      opacity: active ? 0.95 : 0.5,
                      animation: "lp-flow 2.6s linear infinite",
                      transition: "opacity var(--dm-dur) ease",
                    }}
                  />
                )}
                {[p1, p2].map((p, k) => (
                  <circle
                    key={k}
                    cx={p.x}
                    cy={p.y}
                    r={active ? 3.4 : 2.6}
                    fill={active ? "var(--dm-accent)" : "var(--dm-border-3)"}
                    style={{
                      opacity: drawn ? 1 : 0,
                      transition: `opacity var(--dm-dur) ease ${delay + 220}ms, fill var(--dm-dur) ease`,
                    }}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        <div style={{ display: "contents" }}>{children}</div>
      </div>
    </LinkCtx.Provider>
  );
}

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
}: {
  id: string;
  children: ReactNode;
  tone?: "cream" | "ink" | "accent";
  radius?: number;
  padding?: number;
  lift?: boolean;
  tilt?: boolean;
  glow?: boolean;
  style?: CSSProperties;
}) {
  const ctx = useContext(LinkCtx);
  const ref = useRef<HTMLDivElement>(null);
  const [pt, setPt] = useState({ x: 0.5, y: 0.5, on: false });

  useEffect(() => {
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

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!tilt && !glow) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPt({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, on: true });
  };

  const tones: Record<string, CSSProperties> = {
    cream: {
      background: "var(--dm-surface)",
      border: "1px solid var(--dm-border)",
      color: "var(--dm-ink)",
    },
    ink: {
      background: "var(--dm-ink-surface)",
      border: "1px solid var(--dm-ink-border)",
      color: "var(--dm-text-on-ink)",
    },
    accent: {
      background: "var(--dm-accent-tint-2)",
      border: "1px solid var(--dm-accent-tint-border)",
      color: "var(--dm-ink)",
    },
  };

  return (
    <div
      ref={ref}
      data-cell=""
      tabIndex={0}
      onMouseEnter={() => ctx?.setHover(id)}
      onMouseLeave={() => {
        ctx?.setHover(null);
        setPt((p) => ({ ...p, on: false }));
      }}
      onMouseMove={onMove}
      onFocus={() => ctx?.setHover(id)}
      onBlur={() => {
        ctx?.setHover(null);
        setPt((p) => ({ ...p, on: false }));
      }}
      style={{
        position: "relative",
        zIndex: 1,
        borderRadius: radius,
        padding,
        outline: "none",
        ...tones[tone],
        boxShadow: focused ? "var(--dm-shadow-window)" : "var(--dm-shadow-card)",
        opacity: active ? 1 : 0.4,
        transformStyle: "preserve-3d",
        transform:
          tilt && useMotion
            ? `perspective(720px) rotateX(${((0.5 - pt.y) * 11).toFixed(2)}deg) rotateY(${((pt.x - 0.5) * 13).toFixed(2)}deg) translateY(-5px)`
            : lift && focused
              ? "translateY(var(--dm-lift))"
              : "translateY(0)",
        transition:
          tilt && useMotion
            ? "transform .12s ease-out, box-shadow var(--dm-dur-slow) ease, opacity var(--dm-dur) ease"
            : "transform var(--dm-dur-slow) var(--dm-ease-out), box-shadow var(--dm-dur-slow) var(--dm-ease-out), opacity var(--dm-dur) ease",
        ...style,
      }}
    >
      {children}
      {glow && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius,
            pointerEvents: "none",
            background: `radial-gradient(circle at ${(pt.x * 100).toFixed(1)}% ${(pt.y * 100).toFixed(1)}%, rgba(228,89,59,0.30), rgba(228,89,59,0.06) 45%, rgba(228,89,59,0) 70%)`,
            opacity: useMotion ? 1 : 0,
            transition: "opacity var(--dm-dur) ease",
          }}
        />
      )}
    </div>
  );
}
