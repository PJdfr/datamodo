"use client";

/**
 * INSIGHTS view — the "numbers" layer over your knowledge. Surfaces the analytics
 * the backend already computes (POST /api/knowledge/analytics): headline totals,
 * a spend-by-vendor breakdown, and the entity mix. Read-only, org-scoped.
 *
 * Charts follow the product palette; every colored mark sits next to a text label,
 * so identity is never carried by color alone.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { C } from "./ui";

interface AggRow { group: string; value: number; count: number }
interface AggResult { op: string; total: number; rows: AggRow[] }
interface Metrics { entitiesByKind: { kind: string; count: number }[]; totalEntities: number; totalFacts: number }

const KIND_TONE: Record<string, string> = {
  person: C.blue, people: C.blue,
  company: C.accent, org: C.accent, organization: C.accent,
  invoice: C.gold, project: C.green,
};
const toneOf = (k: string) => KIND_TONE[k.toLowerCase()] ?? C.ink;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const IRREGULAR_PLURAL: Record<string, string> = { person: "people", company: "companies", organization: "organizations" };
const plural = (k: string) => {
  const key = k.toLowerCase();
  if (IRREGULAR_PLURAL[key]) return IRREGULAR_PLURAL[key];
  if (/[^aeiou]y$/.test(k)) return k.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/.test(k)) return k + "es";
  return k + "s";
};
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const num = (n: number) => new Intl.NumberFormat("en-US").format(n);

async function analytics<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch("/api/knowledge/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ flex: "1 1 160px", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 14, padding: "16px 18px" }}>
      <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 8 }}>{label}</div>
      <div className="dm-display" style={{ fontWeight: 800, fontSize: 30, letterSpacing: "-0.03em", lineHeight: 1, color: tone ?? C.ink }}>{value}</div>
    </div>
  );
}

/** Single-measure horizontal bars: one hue, value direct-labelled, 4px rounded end. */
function BarList({ rows, tone, fmt }: { rows: AggRow[]; tone: string; fmt: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.group}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 10 }}>
            <span style={{ fontSize: 13, color: C.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.group}</span>
            <span className="dm-mono" style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, flexShrink: 0 }}>{fmt(r.value)}<span style={{ color: "#B7AF9F", fontWeight: 400 }}> · {r.count}</span></span>
          </div>
          <div style={{ height: 10, background: "#F1EDE4", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, height: "100%", background: tone, borderRadius: 5 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <span className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: C.ink }}>{title}</span>
        {hint && <span style={{ fontSize: 12, color: "#A39B8B" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function InsightsView() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [spend, setSpend] = useState<AggResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, s] = await Promise.all([
        analytics<Metrics>({ op: "metrics" }),
        analytics<AggResult>({ op: "aggregate", measure: "amount", agg: "sum", groupBy: "issued_by" }),
      ]);
      if (!alive) return;
      setMetrics(m);
      setSpend(s);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const kinds = useMemo(() => (metrics?.entitiesByKind ?? []).slice().sort((a, b) => b.count - a.count), [metrics]);
  const hasSpend = !!spend && spend.total > 0 && spend.rows.length > 0;

  if (loading) return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Crunching your numbers…</div>;

  if (!metrics || metrics.totalFacts === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 26 }}>◔</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 8px" }}>No numbers yet</h2>
        <p style={{ fontSize: 14.5, color: "#57534A", maxWidth: "44ch", margin: 0, lineHeight: 1.55 }}>Once your agents extract facts with amounts and dates, the totals and breakdowns show up here — computed straight from your knowledge.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}>The numbers behind your knowledge</div>
        <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Computed live from your facts — not a separate spreadsheet to keep in sync.</div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {hasSpend && <StatTile label="Total invoiced" value={money(spend!.total)} tone={C.gold} />}
        <StatTile label="Things known" value={num(metrics.totalEntities)} />
        <StatTile label="Facts on file" value={num(metrics.totalFacts)} />
      </div>

      {hasSpend && (
        <Section title="Invoiced by vendor" hint="sum of amount · count of invoices">
          <BarList rows={spend!.rows} tone={C.gold} fmt={money} />
        </Section>
      )}

      <Section title="What you know" hint={`${kinds.length} kind${kinds.length === 1 ? "" : "s"}`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {kinds.map((k) => (
            <div key={k.kind} style={{ display: "flex", alignItems: "center", gap: 9, background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11, padding: "9px 13px" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: toneOf(k.kind), flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: C.ink }}>{titleCase(plural(k.kind))}</span>
              <span className="dm-mono" style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{num(k.count)}</span>
            </div>
          ))}
        </div>
      </Section>

      {!hasSpend && (
        <div className="dm-mono" style={{ fontSize: 11.5, color: "#A39B8B", padding: "0 2px" }}>
          No numeric measures (like invoice amounts) in your facts yet — add some and a spend breakdown appears here.
        </div>
      )}
    </div>
  );
}
