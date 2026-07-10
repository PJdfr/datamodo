import React from "react";

/**
 * datamodo SpotlightCard — a warm surface card that comes alive on hover:
 * a soft coral spotlight follows the cursor, the card lifts and tilts a few
 * degrees toward the pointer, and the shadow deepens. Built to break the
 * flat "pile of cards" feel — use it for feature tiles and interactive lists.
 *
 * All motion is transform/opacity only and settles instantly under
 * prefers-reduced-motion (the base state is a normal resting card).
 *
 *  - tone "cream" (default) | "ink"
 *  - tilt: max degrees of pointer tilt (0 disables tilt, keeps spotlight+lift)
 */
export function SpotlightCard({
  children,
  tone = "cream",
  tilt = 6,
  radius = 18,
  padding = 24,
  style = {},
  ...rest
}) {
  const ref = React.useRef(null);
  const [hovering, setHovering] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 50, y: 50, rx: 0, ry: 0 });

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setPos({
      x: px * 100,
      y: py * 100,
      ry: (px - 0.5) * 2 * tilt,      // rotateY toward cursor X
      rx: -(py - 0.5) * 2 * tilt,     // rotateX toward cursor Y
    });
  };

  const isInk = tone === "ink";
  const glow = isInk
    ? "rgba(228,89,59,0.30)"
    : "rgba(228,89,59,0.16)";

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        setPos((p) => ({ ...p, rx: 0, ry: 0 }));
      }}
      onMouseMove={onMove}
      style={{
        position: "relative",
        borderRadius: radius,
        padding,
        background: isInk ? "var(--dm-ink-surface, #2B2720)" : "var(--dm-surface, #FFFDF8)",
        border: isInk ? "1px solid var(--dm-ink-border, #3A352C)" : "1px solid var(--dm-border, #E7E0D2)",
        color: isInk ? "var(--dm-text-on-ink, #F1ECE1)" : "var(--dm-ink, #211E18)",
        boxShadow: hovering
          ? "var(--dm-shadow-window, 0 30px 60px -28px rgba(33,30,24,.5),0 6px 16px -8px rgba(33,30,24,.22))"
          : "var(--dm-shadow-card, 0 18px 44px -30px rgba(33,30,24,.35))",
        transform: hovering
          ? `perspective(900px) rotateX(${pos.rx}deg) rotateY(${pos.ry}deg) translateY(var(--dm-lift, -4px))`
          : "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)",
        transformStyle: "preserve-3d",
        transition:
          "transform var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)), box-shadow var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1))",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {/* cursor-following spotlight */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          pointerEvents: "none",
          background: `radial-gradient(240px circle at ${pos.x}% ${pos.y}%, ${glow}, transparent 60%)`,
          opacity: hovering ? 1 : 0,
          transition: "opacity var(--dm-dur,220ms) ease",
        }}
      />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
