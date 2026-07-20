import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTracer, NOOP_TRACER, type Tracer, type TraceJson } from "./trace-core.ts";

// DEV TRACE shell — the env gate and the persistence leg (the pure collector
// lives in trace-core.ts). When dev mode is on, every extraction run records
// its full pipeline story (prompts, context, LLM replies, storage outcomes)
// to items.meta.dev_trace AND mirrors compact lines to the server log; the
// chat UI surfaces it as a "⌁ trace" pill per message.

export type { Tracer, TraceJson };

/** Dev mode: DEV_TRACE env wins ("1"/"true" on, "0"/"false" off even in dev);
 *  unset = on outside production (local `next dev`, tests), off in prod. */
export function devTraceEnabled(): boolean {
  const v = process.env.DEV_TRACE?.trim().toLowerCase();
  if (v) return !["0", "false", "off", "no"].includes(v);
  return process.env.NODE_ENV !== "production";
}

/** A tracer for one item's extraction run — real when dev mode is on, the
 *  free no-op otherwise (callers never branch). */
export function startItemTrace(itemId: string): Tracer {
  if (!devTraceEnabled()) return NOOP_TRACER;
  const short = itemId.slice(0, 8);
  return createTracer({
    startedAt: new Date().toISOString(),
    log: (line) => console.log(line.replace("[trace]", `[trace ${short}]`)),
  });
}

/** Persist the finished trace onto the item (meta.dev_trace). Reads meta
 *  fresh so parse_reply / routed_agent stamps written mid-run are kept.
 *  Fail-soft: a lost trace never fails the item. */
export async function persistItemTrace(itemId: string, tracer: Tracer): Promise<void> {
  const json = tracer.toJSON();
  if (!json) return;
  try {
    const fresh = await prisma.items.findUnique({ where: { id: itemId }, select: { meta: true } });
    await prisma.items.update({
      where: { id: itemId },
      data: {
        // TraceJson is plain JSON by construction; Prisma's InputJsonValue
        // just can't see that through the interface.
        meta: {
          ...((fresh?.meta as Record<string, unknown> | null) ?? {}),
          dev_trace: json,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error(`[trace] persist failed for item ${itemId}`, e);
  }
}
