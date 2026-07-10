import React from "react";

/**
 * datamodo RevealOnScroll — wraps content and fades + rises it into view the
 * first time it enters the viewport (IntersectionObserver). Children can be
 * revealed together or staggered one-by-one. Adds gentle fluidity to long
 * pages so sections arrive rather than snap. Under prefers-reduced-motion the
 * content is simply visible from the start.
 *
 *  - stagger: when true, direct children animate in sequence
 *  - delay/step: ms before the first child / between staggered children
 */
export function RevealOnScroll({
  children,
  stagger = false,
  delay = 0,
  step = 90,
  y = 16,
  once = true,
  style = {},
  ...rest
}) {
  const ref = React.useRef(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            if (once) io.disconnect();
          } else if (!once) {
            setShown(false);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  const base = (extraDelay) => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : `translateY(${y}px)`,
    transition:
      "opacity var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)) " +
      extraDelay +
      "ms, transform var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)) " +
      extraDelay +
      "ms",
  });

  if (stagger) {
    const items = React.Children.toArray(children);
    return (
      <div ref={ref} style={style} {...rest}>
        {items.map((c, i) => (
          <div key={i} style={base(delay + i * step)}>
            {c}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ ...base(delay), ...style }} {...rest}>
      {children}
    </div>
  );
}
