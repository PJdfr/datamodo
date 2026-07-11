"use client";

/**
 * "⟳ processing N items" — the extraction queue's live depth in the topbar.
 * Invisible when the queue is empty (the common case; the chrome stays clean —
 * simplicity rule); while anything is queued or reprocessing (e.g. after an
 * extraction-version requeue) it shows the backlog and polls it down. Stuck
 * items (failed past the retry cap) surface honestly instead of vanishing.
 */

import { useEffect, useRef, useState } from "react";
import { C } from "./ui";

interface QueueStatus {
  queued: number;
  analyzing: number;
  stuck: number;
}

const IDLE_POLL_MS = 60_000;
const BUSY_POLL_MS = 8_000;

export function QueuePill() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    let latest: QueueStatus | null = null;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const res = await fetch("/api/jobs/queue-status");
          if (res.ok) {
            latest = (await res.json()) as QueueStatus;
            if (alive) setStatus(latest);
          }
        } catch {
          /* transient — keep the last reading */
        }
      }
      if (!alive) return;
      // Poll fast while draining, slow when idle.
      const busy = (latest?.queued ?? 0) + (latest?.analyzing ?? 0) > 0;
      timer.current = setTimeout(tick, busy ? BUSY_POLL_MS : IDLE_POLL_MS);
    };
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!status) return null;
  const active = status.queued + status.analyzing;
  if (active === 0 && status.stuck === 0) return null;

  return (
    <span
      className="dm-mono"
      title={
        active > 0
          ? `${status.queued} waiting · ${status.analyzing} being read now${status.stuck ? ` · ${status.stuck} gave up after retries` : ""}`
          : `${status.stuck} item${status.stuck === 1 ? "" : "s"} failed extraction after retries`
      }
      style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: active > 0 ? "#6B665B" : "#A0522D", background: "#fff", border: "1px solid #E1D9C8", borderRadius: 10, padding: "8px 12px" }}
    >
      {active > 0 ? (
        <>
          <span className="dm-spin" style={{ display: "inline-block", color: C.accent }}>⟳</span>
          processing {active} item{active === 1 ? "" : "s"}
        </>
      ) : (
        <>⚠ {status.stuck} stuck</>
      )}
    </span>
  );
}
