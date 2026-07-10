import React from "react";

/**
 * datamodo Marquee — an infinite horizontal strip that streams its children
 * past, with soft cream fade masks at both edges. Pauses on hover so a viewer
 * can read a passing item. Used for the "works with the apps you already use"
 * channel row and streaming entity chips — motion that fills width without
 * another stacked card. Freezes under prefers-reduced-motion.
 *
 * Children are duplicated once internally so the loop is seamless; the track
 * translates -50% over `duration`.
 */
export function Marquee({
  children,
  duration = 32,
  direction = "left",
  gap = 20,
  pauseOnHover = true,
  fade = true,
  style = {},
  ...rest
}) {
  const items = React.Children.toArray(children);
  const [paused, setPaused] = React.useState(false);

  const track = (
    <div
      style={{
        display: "flex",
        gap,
        paddingLeft: gap / 2,
        alignItems: "center",
        flexShrink: 0,
        minWidth: "100%",
        justifyContent: "space-around",
        animation: `dm-marquee ${duration}s linear infinite`,
        animationDirection: direction === "right" ? "reverse" : "normal",
        animationPlayState: paused ? "paused" : "running",
        willChange: "transform",
      }}
      aria-hidden="false"
    >
      {items.map((c, i) => (
        <span key={i} style={{ display: "inline-flex", flexShrink: 0 }}>
          {c}
        </span>
      ))}
    </div>
  );

  return (
    <div
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        width: "100%",
        WebkitMaskImage: fade
          ? "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)"
          : "none",
        maskImage: fade
          ? "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)"
          : "none",
        ...style,
      }}
      {...rest}
    >
      {track}
      {/* seamless duplicate */}
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          gap,
          paddingLeft: gap / 2,
          alignItems: "center",
          flexShrink: 0,
          minWidth: "100%",
          justifyContent: "space-around",
          animation: `dm-marquee ${duration}s linear infinite`,
          animationDirection: direction === "right" ? "reverse" : "normal",
          animationPlayState: paused ? "paused" : "running",
          willChange: "transform",
        }}
      >
        {items.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", flexShrink: 0 }}>
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
