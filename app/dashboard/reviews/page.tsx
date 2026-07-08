"use client";

import { useEffect, useState } from "react";

// Minimal review queue UI: the knowledge layer's uncertain decisions (proposed
// entity merges + fact conflicts), most impactful first, with accept/reject.
// Intentionally lightweight — swap in the dashboard's design system as needed.

interface ReviewItem {
  id: string;
  kind: "entity_merge" | "fact_conflict";
  confidence: number | null;
  impact: number;
  summary: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/knowledge/reviews");
    const json = await res.json();
    setReviews(json.reviews ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function act(id: string, action: "accept" | "reject") {
    setBusy(id);
    await fetch(`/api/knowledge/reviews/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    setReviews((rs) => rs.filter((r) => r.id !== id));
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Review queue</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Uncertain decisions to confirm — highest impact first.
      </p>
      {loading ? (
        <p>Loading…</p>
      ) : reviews.length === 0 ? (
        <p style={{ color: "#888" }}>Nothing to review 🎉</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {reviews.map((r) => (
            <li key={r.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 11, textTransform: "uppercase", color: "#999" }}>
                    {r.kind.replace("_", " ")} · impact {r.impact}
                    {r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ""}
                  </span>
                  <div style={{ fontSize: 15, marginTop: 2 }}>{r.summary}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button disabled={busy === r.id} onClick={() => act(r.id, "accept")}>Accept</button>
                  <button disabled={busy === r.id} onClick={() => act(r.id, "reject")}>Reject</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
