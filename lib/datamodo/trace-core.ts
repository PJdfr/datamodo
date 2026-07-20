// DEV TRACE core (pure, import-free — node:test loadable). The transparency
// layer for "what exactly happened when this message went through the pipe":
// a per-item collector that records every stage — gate, routing, context
// assembly (priming/kinds/business), each LLM call with its FULL system+user
// prompt and raw response, storage outcomes, replies — as timestamped steps.
//
// Shell (env gate + persistence to items.meta.dev_trace) lives in trace.ts.
// Design rules:
//   - ZERO cost when disabled: callers get NOOP_TRACER (every method a no-op).
//   - Bounded when enabled: single strings cap at MAX_STRING chars, the whole
//     trace at MAX_TOTAL serialized chars — a 600k-char document prompt must
//     never balloon an items.meta row past sanity. Truncation is always
//     MARKED, never silent.
//   - LLM capture is a DECORATOR (wrapLlm), so every call site — message
//     extract, escalation, doc classify/distill, vision, merge adjudication —
//     is captured at the one chokepoint without touching its code.

export interface TraceStep {
  /** ms since the trace started. */
  t: number;
  /** Duration of a timed step (LLM calls), ms. */
  ms?: number;
  /** Stage group: item · input · gate · steer · embed · context · llm ·
   *  extract · store · docs · review · reply · done · error. */
  stage: string;
  /** One-line human summary (what the console mirror prints). */
  label: string;
  /** The full payload — prompts, responses, candidate lists… (capped). */
  detail?: Record<string, unknown>;
}

export interface TraceJson {
  version: 1;
  startedAt: string;
  totalMs: number;
  steps: TraceStep[];
  /** Present when the size budget forced detail to be dropped. */
  truncated?: boolean;
}

export interface Tracer {
  readonly enabled: boolean;
  step(stage: string, label: string, detail?: Record<string, unknown>): void;
  /** Wrap an LLM provider so every chatJSON call records model, prompts,
   *  response and duration as an "llm" step. Identity when disabled. */
  wrapLlm<P extends LlmLike>(llm: P): P;
  toJSON(): TraceJson | null;
}

/** Structural slice of LlmProvider — keeps this core import-free. `models`
 *  is opaque pass-through; the request shape is only what the wrapper reads
 *  (providers accept more fields — the request passes through untouched). */
interface LlmLike {
  readonly name: string;
  readonly models: unknown;
  chatJSON(req: never): Promise<unknown>;
}

interface TracedChatRequest {
  model: string;
  system: string;
  user: string;
  images?: { mediaType: string; dataBase64: string }[];
  schemaName?: string;
  maxTokens?: number;
}

const MAX_STRING = 20_000; // per captured string (a prompt, a response)
const MAX_TOTAL = 400_000; // whole-trace serialized budget

/** Cap one string, marking what was cut — truncation is never silent. */
export function capString(s: string, max = MAX_STRING): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} of ${s.length} chars]`;
}

/** Deep-copy a detail object with every string capped. Arrays/objects walked;
 *  anything JSON can't carry (undefined, functions) drops naturally later. */
function capDetail(v: unknown, max: number, depth = 0): unknown {
  if (typeof v === "string") return capString(v, max);
  if (v == null || typeof v !== "object" || depth > 6) return v;
  if (Array.isArray(v)) return v.map((x) => capDetail(x, max, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = capDetail(val, max, depth + 1);
  return out;
}

export interface TracerOpts {
  /** Clock injection for tests. */
  now?: () => number;
  /** ISO start stamp (the shell passes new Date().toISOString()). */
  startedAt?: string;
  /** Console mirror — called with one compact line per step ("in the logs"). */
  log?: (line: string) => void;
  maxString?: number;
  maxTotal?: number;
}

export function createTracer(opts: TracerOpts = {}): Tracer {
  const now = opts.now ?? (() => Date.now());
  const t0 = now();
  const maxString = opts.maxString ?? MAX_STRING;
  const maxTotal = opts.maxTotal ?? MAX_TOTAL;
  const steps: TraceStep[] = [];
  let spent = 0;
  let truncated = false;

  const push = (stage: string, label: string, detail?: Record<string, unknown>, ms?: number) => {
    const step: TraceStep = { t: now() - t0, stage, label };
    if (ms != null) step.ms = ms;
    if (detail) {
      const capped = capDetail(detail, maxString) as Record<string, unknown>;
      let size = 0;
      try {
        size = JSON.stringify(capped)?.length ?? 0;
      } catch {
        // Circular / non-serializable detail: drop it, keep the step.
        step.detail = { omitted: "detail not serializable" };
      }
      if (step.detail == null) {
        if (spent + size > maxTotal) {
          truncated = true;
          step.detail = { omitted: `trace size budget reached (${size} chars dropped)` };
        } else {
          spent += size;
          step.detail = capped;
        }
      }
    }
    steps.push(step);
    opts.log?.(`[trace] +${step.t}ms ${stage}${ms != null ? ` (${ms}ms)` : ""} — ${label}`);
  };

  return {
    enabled: true,
    step: (stage, label, detail) => push(stage, label, detail),
    wrapLlm<P extends LlmLike>(llm: P): P {
      const wrapped = {
        name: llm.name,
        models: llm.models,
        async chatJSON(req: TracedChatRequest) {
          const started = now();
          try {
            const res = await llm.chatJSON(req as never);
            push(
              "llm",
              `${llm.name}:${req.model}${req.schemaName ? ` · ${req.schemaName}` : ""}${req.images?.length ? ` · ${req.images.length} image(s)` : ""}`,
              {
                provider: llm.name,
                model: req.model,
                schemaName: req.schemaName,
                maxTokens: req.maxTokens,
                images: req.images?.length ?? 0,
                system: req.system,
                user: req.user,
                response: res,
              },
              now() - started,
            );
            return res;
          } catch (e) {
            push(
              "llm",
              `${llm.name}:${req.model}${req.schemaName ? ` · ${req.schemaName}` : ""} FAILED`,
              {
                provider: llm.name,
                model: req.model,
                schemaName: req.schemaName,
                system: req.system,
                user: req.user,
                error: String((e as Error)?.message ?? e),
              },
              now() - started,
            );
            throw e;
          }
        },
      };
      // The wrapper only reimplements the LlmLike surface; anything extra on
      // the concrete provider is not needed by pipeline call sites.
      return wrapped as unknown as P;
    },
    toJSON: () => ({
      version: 1,
      startedAt: opts.startedAt ?? "",
      totalMs: now() - t0,
      steps,
      ...(truncated ? { truncated: true } : {}),
    }),
  };
}

/** The disabled tracer — every method free, toJSON null (nothing persists). */
export const NOOP_TRACER: Tracer = {
  enabled: false,
  step: () => {},
  wrapLlm: (llm) => llm,
  toJSON: () => null,
};
