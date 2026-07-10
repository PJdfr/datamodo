"use client";

/**
 * RevealOnScroll (design/system/components/motion) — fades + rises content
 * into view the first time it enters the viewport. Reduced motion / no-JS
 * environments simply see the content (base state is the end state after
 * the transition, and the transition is killed by the .lp-landing guard).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  y = 16,
  style = {},
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
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
            io.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity var(--dm-dur-slow) var(--dm-ease-out) ${delay}ms, transform var(--dm-dur-slow) var(--dm-ease-out) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
