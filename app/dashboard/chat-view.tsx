"use client";

/**
 * CHAT — the app itself as a capture channel, peer to email/WhatsApp/Slack.
 * Whatever lands here rides the SAME pipeline as every other channel: text →
 * extraction, photos → vision tier, PDFs/docs → document tier with page-cited
 * chunks, voice notes → transcription tier. The thread shows each message's
 * pipeline state live, so "send → filed" is visible end to end.
 *
 * Brand notes (design/system): cream canvas, ink bubbles on paper, ONE coral
 * accent, all data in Geist Mono, glyphs not emoji (⊕ ⏺ ∿ ▤ ▣ ✓), motion via
 * the app's own keyframes (dm-drop-in entrances, cc-pulse processing dot) —
 * all disabled under prefers-reduced-motion by the global guard.
 *
 * Input affordances: auto-growing text, any-file attach + drag-drop + paste,
 * a dictaphone (MediaRecorder voice note with in-tray preview — transcribed
 * server-side), live speech-to-text where the browser has it, optimistic
 * bubbles with image thumbnails, day separators.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "./ui";
import { ReviewCardBody, INK_SKIN } from "./review-card";
import { activeMention, matchAgents, stripMention, type ChatAgentRef, type MentionSpan } from "@/lib/datamodo/chat-address";
import type { ReviewItem } from "@/lib/datamodo/review-types";

interface ChatAttachment { filename: string | null; contentType: string | null; bytes: number }
interface ChatMessage {
  id: string;
  text: string | null;
  status: string;
  error: string | null;
  at: string;
  attachments: ChatAttachment[];
  /** The addressed agent's name (null/absent = the general datamodo agent). */
  agent?: string | null;
  /** Optimistic bubble, not yet confirmed by the server. */
  local?: boolean;
  /** Local-only image previews for the optimistic bubble. */
  previews?: string[];
}

interface PendingFile {
  key: number;
  file: File;
  kind: "file" | "voice";
  /** Object URL for image thumbnails / audio preview. */
  url: string | null;
}

const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "today";
  if (same(d, y)) return "yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase();
};

/* Glyphs, not emoji — per the brand's iconography rule. */
const fileGlyph = (ct: string | null) => {
  const t = (ct ?? "").toLowerCase();
  if (t.startsWith("image/")) return "▣";
  if (t.startsWith("audio/")) return "∿";
  if (t.includes("pdf") || t.startsWith("text/")) return "▤";
  if (t.includes("spreadsheet") || t.includes("excel") || t.includes("csv")) return "▦";
  return "◦";
};

const BUSY = new Set(["sending", "received", "stored", "analyzing"]);

const suggestChip: React.CSSProperties = {
  fontSize: 12.5, color: "#3A352C", background: "#FFFDF8", border: "1px solid #E1D9C8",
  borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit",
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/* Minimal typing for the (prefixed) Web Speech API. */
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
}

/* ---- status line under a bubble --------------------------------------- */
function StatusLine({ m }: { m: ChatMessage }) {
  if (m.status === "sending") {
    return <span className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B" }}>sending…</span>;
  }
  if (BUSY.has(m.status)) {
    return (
      <span className="dm-mono" style={{ fontSize: 9.5, color: "#8A6D1F", display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B08A2E", animation: "cc-pulse 2.2s ease-in-out infinite" }} />
        {m.status === "analyzing" ? "reading…" : "processing…"}
      </span>
    );
  }
  if (m.status === "analyzed") {
    return <span className="dm-mono dm-fade-in" style={{ fontSize: 9.5, color: C.green }}>✓ filed into your graph</span>;
  }
  if (m.status === "failed") {
    return <span className="dm-mono" title={m.error ?? undefined} style={{ fontSize: 9.5, color: C.accent }}>⚠ failed{m.error ? " — hover for why" : ""}</span>;
  }
  return <span className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B" }}>{m.status}</span>;
}

/* ---- one message bubble ------------------------------------------------ */
function Bubble({ m }: { m: ChatMessage }) {
  return (
    <div style={{ alignSelf: "flex-end", maxWidth: "min(78%, 640px)", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, animation: "dm-drop-in .34s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{
        background: "#FFFDF8", border: "1px solid #E7E0D2",
        borderRadius: "16px 16px 6px 16px", padding: "10px 14px",
        boxShadow: "0 14px 34px -26px rgba(33,30,24,.5)",
        opacity: m.status === "sending" ? 0.75 : 1,
        transition: "opacity .3s",
      }}>
        {m.text && (
          <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
        )}
        {(m.previews?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: m.text ? 8 : 0 }}>
            {m.previews!.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "1px solid #ECE5D8" }} />
            ))}
          </div>
        )}
        {m.attachments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: m.text || m.previews?.length ? 8 : 0 }}>
            {m.attachments.map((a, i) => (
              <span key={i} className="dm-mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, color: "#57534A", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 8, padding: "5px 9px" }}>
                <span style={{ color: C.accent }}>{fileGlyph(a.contentType)}</span>
                <span style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.filename ?? "attachment"}</span>
                <span style={{ color: "#A39B8B", flexShrink: 0 }}>{fmtBytes(a.bytes)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingRight: 2 }}>
        {m.agent && (
          <span className="dm-mono" title={`Addressed to your "${m.agent}" agent`} style={{ fontSize: 9.5, color: "#8A8477" }}>→ {m.agent}</span>
        )}
        <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F" }}>{fmtTime(m.at)}</span>
        <StatusLine m={m} />
      </div>
    </div>
  );
}

/* ---- datamodo's bubble: the pull request, tap-to-approve ----------------
 * Full PR fidelity (2026-07-14): each numbered question carries the SAME
 * evidence body Review Studio renders (review-card.tsx), in the ink skin —
 * the diff, the sides, the facts — so a decision here is as informed as one
 * made in the Review tab. Same accept/decline side-effects core. */
interface PingQuestion { id: string; question: string }

function ReviewBubble({ questions, reviews, onDecide, resolved }: {
  questions: PingQuestion[];
  reviews: ReviewItem[];
  onDecide: (id: string, accept: boolean) => void;
  resolved: { id: string; line: string }[];
}) {
  const itemById = new Map(reviews.map((r) => [r.id, r]));
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "min(84%, 700px)", display: "flex", flexDirection: "column", gap: 4, animation: "dm-drop-in .34s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{
        background: "#211E18", color: "#F1ECE1",
        borderRadius: "16px 16px 16px 6px", padding: "12px 15px",
        boxShadow: "0 18px 40px -26px rgba(33,30,24,.65)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <span style={{ color: C.accent, fontSize: 13 }}>✦</span>
          <span className="dm-mono" style={{ fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#9C958A" }}>
            datamodo · {questions.length === 1 ? "one thing needs" : `${questions.length} things need`} your ok
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q, i) => {
            const item = itemById.get(q.id);
            return (
              <div key={q.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="dm-mono" style={{ fontSize: 10.5, color: "#9C958A", flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.45, flex: 1, minWidth: 180 }}>{q.question}</span>
                  <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => onDecide(q.id, true)}
                      style={{ fontSize: 12, fontWeight: 600, color: "#FFF8F4", background: C.accent, border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      ✓ yes
                    </button>
                    <button type="button" onClick={() => onDecide(q.id, false)}
                      style={{ fontSize: 12, fontWeight: 500, color: "#F1ECE1", background: "transparent", border: "1px solid #3A352C", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      ✗ no
                    </button>
                  </span>
                </div>
                {item && (
                  <div style={{ margin: "8px 0 0 20px" }}>
                    <ReviewCardBody item={item} skin={INK_SKIN} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {resolved.length > 0 && (
          <div style={{ marginTop: questions.length ? 10 : 0, paddingTop: questions.length ? 9 : 0, borderTop: questions.length ? "1px solid #3A352C" : "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {resolved.map((r) => (
              <span key={r.id} className="dm-mono dm-fade-in" style={{ fontSize: 10.5, color: "#9C958A" }}>{r.line}</span>
            ))}
          </div>
        )}
      </div>
      <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", paddingLeft: 2 }}>
        same decisions as the review tab — applied for real when you tap
      </span>
    </div>
  );
}

/* ======================================================================== */
export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questions, setQuestions] = useState<PingQuestion[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [resolved, setResolved] = useState<{ id: string; line: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Addressing: the user's agents (recipients), the sticky chosen recipient
  // (null = the general datamodo agent — the deterministic default), the
  // "to" dropdown, and the live @mention under the caret.
  const [agents, setAgents] = useState<ChatAgentRef[]>([]);
  const [recipient, setRecipient] = useState<ChatAgentRef | null>(null);
  const [toOpen, setToOpen] = useState(false);
  const [mention, setMention] = useState<MentionSpan | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const dismissedMention = useRef<string | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const keySeq = useRef(1);

  const canDictate = useMemo(
    () =>
      typeof window !== "undefined" &&
      Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition),
    [],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (!res.ok) return;
      const json = await res.json();
      // Server truth replaces everything except still-unconfirmed optimistic bubbles.
      setMessages((prev) => [...(json.messages ?? []), ...prev.filter((m) => m.local)]);
      setQuestions(json.questions ?? []);
      setReviews(json.reviews ?? []);
      setAgents(json.agents ?? []);
    } catch { /* keep the current thread */ }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  // Poll while anything is still being read — "send → filed" stays live.
  useEffect(() => {
    const busy = messages.some((m) => !m.local && BUSY.has(m.status));
    if (!busy) return;
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [messages, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, loading]);

  // Recording elapsed clock (the counter resets where recording starts).
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  const grow = () => {
    const el = textArea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };

  /* ---- addressing: the @mention under the caret + the recipient slot ---- */
  const mentionMatches = useMemo(() => (mention ? matchAgents(agents, mention.query) : []), [mention, agents]);
  const trackMention = (el: HTMLTextAreaElement) => {
    const span = agents.length ? activeMention(el.value, el.selectionStart ?? el.value.length) : null;
    if (span && dismissedMention.current === span.query) return; // Esc'd — stay closed until the query changes
    if (!span) dismissedMention.current = null;
    setMention(span);
    setMentionIdx(0);
  };
  const pickAgent = (a: ChatAgentRef | null, span: MentionSpan | null = null) => {
    setRecipient(a);
    if (span) { setText((t) => stripMention(t, span)); requestAnimationFrame(grow); }
    setMention(null);
    setToOpen(false);
    textArea.current?.focus();
  };

  const addFiles = useCallback((list: FileList | File[] | null, kind: "file" | "voice" = "file") => {
    if (!list) return;
    const files = [...list].map((file) => ({
      key: keySeq.current++,
      file,
      kind,
      url: file.type.startsWith("image/") || file.type.startsWith("audio/") ? URL.createObjectURL(file) : null,
    }));
    setPending((p) => [...p, ...files].slice(0, 8));
  }, []);

  const removePending = (key: number) =>
    setPending((p) => {
      const gone = p.find((x) => x.key === key);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.key !== key);
    });

  /* ---- dictaphone: record a voice note (transcribed by the audio tier) ---- */
  const toggleRecord = async () => {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        if (blob.size > 0) {
          const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
          addFiles([new File([blob], `voice-note-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${ext}`, { type })], "voice");
        }
        setRecording(false);
      };
      rec.start();
      recorder.current = rec;
      setRecSeconds(0);
      setRecording(true);
      setError(null);
    } catch {
      setError("microphone unavailable — check browser permissions");
    }
  };

  /* ---- live speech-to-text into the text box (feature-detected) ---- */
  const toggleDictation = () => {
    if (dictating) { recognition.current?.stop(); return; }
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      let heard = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) heard += ev.results[i][0].transcript;
      }
      if (heard) { setText((t) => (t ? t.replace(/\s*$/, " ") : "") + heard.trim()); requestAnimationFrame(grow); }
    };
    rec.onend = () => setDictating(false);
    recognition.current = rec;
    rec.start();
    setDictating(true);
  };

  const send = async () => {
    if (sending || recording || (!text.trim() && pending.length === 0)) return;
    setSending(true); setError(null);
    const sentText = text.trim();
    const sentFiles = pending;
    // Optimistic bubble — the thread answers immediately.
    const tempId = `local-${keySeq.current++}`;
    setMessages((prev) => [...prev, {
      id: tempId,
      text: sentText || null,
      status: "sending",
      error: null,
      at: new Date().toISOString(),
      attachments: sentFiles.map((p) => ({ filename: p.file.name, contentType: p.file.type || null, bytes: p.file.size })),
      previews: sentFiles.filter((p) => p.url && p.file.type.startsWith("image/")).map((p) => p.url!),
      agent: recipient?.name ?? null,
      local: true,
    }]);
    setText("");
    setPending([]);
    requestAnimationFrame(grow);
    try {
      const attachments = await Promise.all(
        sentFiles.map(async (p) => ({
          filename: p.file.name,
          contentType: p.file.type || "application/octet-stream",
          dataBase64: await toBase64(p.file),
        })),
      );
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: sentText || undefined, attachments: attachments.length ? attachments : undefined, agentId: recipient?.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String((json as { error?: string }).error ?? "could not send"));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setText(sentText);
        setPending(sentFiles);
        return;
      }
      sentFiles.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url); });
      await load();
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } catch {
      setError("network error — try again");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(sentText);
      setPending(sentFiles);
    } finally {
      setSending(false);
    }
  };

  /* ---- the pull request: tap a decision, it applies for real ---- */
  const decide = async (id: string, accept: boolean) => {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    // Optimistic: the question leaves the list, the receipt line lands.
    setQuestions((prev) => prev.filter((x) => x.id !== id));
    setResolved((prev) => [...prev, { id, line: `${accept ? "✓ approved" : "✗ declined"} — ${q.question.replace(/\?$/, "").toLowerCase()}` }]);
    try {
      const res = await fetch("/api/chat/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, accept }),
      });
      if (!res.ok) {
        setResolved((prev) => prev.map((r) => (r.id === id ? { ...r, line: `⚠ could not apply — see the review tab` } : r)));
      }
    } catch {
      setResolved((prev) => prev.map((r) => (r.id === id ? { ...r, line: `⚠ network error — see the review tab` } : r)));
    }
  };

  /* ---- grouped by day for the separators ---- */
  const days = useMemo(() => {
    const groups: { label: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    }
    return groups;
  }, [messages]);

  const canSend = !sending && !recording && (Boolean(text.trim()) || pending.length > 0);

  const toolBtn = (active: boolean): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
    border: `1px solid ${active ? C.accent : "#E1D9C8"}`,
    background: active ? "#FDF1EC" : "#FFFDF8",
    color: active ? C.accent : "#57534A",
    cursor: "pointer", fontSize: 14, lineHeight: 1,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "border-color .15s, background .15s, color .15s",
  });

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      style={{ width: "100%", display: "flex", flexDirection: "column", height: "calc(100vh - 190px)", minHeight: 440, position: "relative" }}
    >
      {/* drop veil */}
      {dragOver && (
        <div style={{ position: "absolute", inset: -8, zIndex: 40, borderRadius: 18, border: `2px dashed ${C.accent}`, background: "rgba(228,89,59,.05)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span className="dm-mono" style={{ fontSize: 12, color: C.accent, background: "#FFFDF8", border: "1px solid #F3D6CB", borderRadius: 999, padding: "6px 14px" }}>drop to attach</span>
        </div>
      )}

      {/* ---- thread ---- */}
      <div className="cc-scroll" style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
        {loading && <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 12.5, padding: "30px 4px" }}>Loading your thread…</div>}

        {!loading && messages.length === 0 && (
          <div className="dm-fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "48px 20px 36px" }}>
            <div className="dm-bob" style={{ width: 58, height: 58, borderRadius: 17, background: "#FFFDF8", border: "1px solid #E7E0D2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, color: C.accent, fontSize: 22 }}>✦</div>
            <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em", margin: "0 0 6px", color: C.ink }}>Send anything. It files itself.</h2>
            <p style={{ fontSize: 14, color: "#57534A", maxWidth: "44ch", margin: "0 0 20px", lineHeight: 1.55 }}>
              The app is a channel like email or WhatsApp. Type a braindump, drop a photo or a PDF, or record a voice note — same pipeline, same graph.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              <button type="button" style={suggestChip}
                onClick={() => { setText("note: met Elena from Brightwave — open to an 8% discount on a 12-month commit. Decide before Aug 31."); textArea.current?.focus(); requestAnimationFrame(grow); }}>
                ✎ try a braindump
              </button>
              <button type="button" style={suggestChip} onClick={() => fileInput.current?.click()}>
                ⊕ attach a receipt
              </button>
              <button type="button" style={suggestChip} onClick={() => void toggleRecord()}>
                ⏺ record a memo
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 2px 6px" }}>
          {days.map((g) => (
            <div key={g.label + g.items[0]?.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 2px" }}>
                <span style={{ flex: 1, height: 1, background: "#EBE2D2" }} />
                <span className="dm-mono" style={{ fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#B7AF9F" }}>{g.label}</span>
                <span style={{ flex: 1, height: 1, background: "#EBE2D2" }} />
              </div>
              {g.items.map((m) => <Bubble key={m.id} m={m} />)}
            </div>
          ))}
          {(questions.length > 0 || resolved.length > 0) && (
            <ReviewBubble questions={questions} reviews={reviews} onDecide={(id, accept) => void decide(id, accept)} resolved={resolved} />
          )}
          <div ref={bottom} />
        </div>
      </div>

      {/* ---- attachment tray ---- */}
      {pending.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 2px 0" }}>
          {pending.map((p) => (
            <div key={p.key} className="dm-drop-in-el" style={{ position: "relative", animation: "dm-drop-in .28s cubic-bezier(0.16,1,0.3,1)" }}>
              {p.file.type.startsWith("image/") && p.url ? (
                <div style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.file.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid #E1D9C8", display: "block" }} />
                </div>
              ) : p.file.type.startsWith("audio/") && p.url ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFDF8", border: `1px solid ${p.kind === "voice" ? "#F3D6CB" : "#E1D9C8"}`, borderRadius: 12, padding: "6px 10px" }}>
                  <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>∿</span>
                  <audio src={p.url} controls preload="metadata" style={{ height: 30, maxWidth: 200 }} />
                </div>
              ) : (
                <span className="dm-mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, color: "#57534A", background: "#FFFDF8", border: "1px solid #E1D9C8", borderRadius: 10, padding: "8px 10px" }}>
                  <span style={{ color: C.accent }}>{fileGlyph(p.file.type)}</span>
                  <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.file.name}</span>
                  <span style={{ color: "#A39B8B" }}>{fmtBytes(p.file.size)}</span>
                </span>
              )}
              <button type="button" onClick={() => removePending(p.key)} aria-label={`Remove ${p.file.name}`}
                style={{ position: "absolute", top: -7, right: -7, width: 18, height: 18, borderRadius: "50%", border: "1px solid #E1D9C8", background: "#FFFDF8", color: "#8A8477", cursor: "pointer", fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 4px 10px -4px rgba(33,30,24,.3)" }}>×</button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="dm-mono dm-fade-in" style={{ fontSize: 11, color: C.accent, padding: "8px 2px 0" }}>{error}</div>}

      {/* ---- persistent drop hint ---- */}
      {pending.length === 0 && (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          title="Attach or drop any document"
          style={{
            display: "flex", alignItems: "center", gap: 9, width: "100%",
            margin: "10px 0 0", padding: "8px 12px", cursor: "pointer",
            background: "transparent", textAlign: "left",
            border: "1px dashed #DAD0BE", borderRadius: 12, color: "#8A8477",
            transition: "border-color .15s, background .15s, color .15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = "rgba(228,89,59,.04)"; e.currentTarget.style.color = "#57534A"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#DAD0BE"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8A8477"; }}
        >
          <span style={{ color: C.accent, fontSize: 14, lineHeight: 1 }}>⊕</span>
          <span className="dm-mono" style={{ fontSize: 11.5, letterSpacing: "0.01em" }}>
            Drag &amp; drop any doc here — or click to attach. PDFs, photos, spreadsheets, notes, voice memos.
          </span>
        </button>
      )}

      {/* ---- composer ---- */}
      <div style={{
        position: "relative",
        display: "flex", flexDirection: "column", gap: 7, marginTop: 10,
        background: "#FFFDF8", border: `1px solid ${recording ? C.accent : "#E1D9C8"}`,
        borderRadius: 16, padding: 9,
        boxShadow: recording ? "0 0 0 3px rgba(228,89,59,.12), 0 18px 44px -34px rgba(33,30,24,.35)" : "0 18px 44px -34px rgba(33,30,24,.35)",
        transition: "border-color .2s, box-shadow .2s",
      }}>
        {/* @mention popover — pick a recipient without leaving the keyboard */}
        {mention && mentionMatches.length > 0 && (
          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 8, zIndex: 60, minWidth: 280, maxWidth: 360, background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, boxShadow: "0 14px 34px rgba(33,30,24,.16)", overflow: "hidden" }}>
            <div className="dm-mono" style={{ fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#B7AF9F", padding: "8px 12px 5px" }}>send to an agent</div>
            {mentionMatches.map((a, i) => (
              <button key={a.id} type="button"
                onMouseEnter={() => setMentionIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); pickAgent(a, mention); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", background: i === mentionIdx ? "#FBF8F1" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ display: "block", fontSize: 13, color: C.ink, fontWeight: 500 }}>{a.name}</span>
                {a.purposeText && <span style={{ display: "block", fontSize: 11, color: "#8A8477", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.purposeText}</span>}
              </button>
            ))}
            <div className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", padding: "5px 12px 8px" }}>↑↓ choose · Enter picks · Esc keeps typing</div>
          </div>
        )}

        {/* "to" row — the recipient slot; only when there are agents to pick */}
        {agents.length > 0 && !recording && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "1px 3px 0", position: "relative" }}>
            <span className="dm-mono" style={{ fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#B7AF9F" }}>to</span>
            <button type="button" onClick={() => setToOpen((o) => !o)} title="Choose which agent reads this"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: recipient ? C.ink : "#57534A", background: recipient ? "#FBF8F1" : "transparent", border: `1px solid ${recipient ? "#E1D9C8" : "transparent"}`, borderRadius: 999, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit" }}>
              {recipient ? recipient.name : <><span style={{ color: C.accent }}>✦</span> datamodo</>}
              <span style={{ fontSize: 9, color: "#A39B8B" }}>▾</span>
            </button>
            {recipient && (
              <button type="button" onClick={() => pickAgent(null)} title="Back to the general agent" aria-label="Clear recipient"
                style={{ background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 12, padding: 0, fontFamily: "inherit" }}>×</button>
            )}
            <span className="dm-mono" style={{ fontSize: 9.5, color: "#C9C2B4", marginLeft: "auto" }}>@ in the box works too</span>

            {toOpen && (
              <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: 0, zIndex: 60, minWidth: 280, maxWidth: 360, background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, boxShadow: "0 14px 34px rgba(33,30,24,.16)", overflow: "hidden" }}>
                <button type="button" onClick={() => pickAgent(null)}
                  style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%", textAlign: "left", padding: "8px 12px", background: recipient ? "transparent" : "#FBF8F1", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ color: C.accent, fontSize: 12 }}>✦</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, color: C.ink, fontWeight: 500 }}>datamodo</span>
                    <span style={{ display: "block", fontSize: 11, color: "#8A8477", marginTop: 1 }}>the general agent — files anything</span>
                  </span>
                  {!recipient && <span style={{ marginLeft: "auto", color: C.green, fontSize: 12 }}>✓</span>}
                </button>
                {agents.map((a) => (
                  <button key={a.id} type="button" onClick={() => pickAgent(a)}
                    style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%", textAlign: "left", padding: "8px 12px", background: recipient?.id === a.id ? "#FBF8F1" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ color: "#B7AF9F", fontSize: 12 }}>◦</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 13, color: C.ink, fontWeight: 500 }}>{a.name}</span>
                      {a.purposeText && <span style={{ display: "block", fontSize: 11, color: "#8A8477", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.purposeText}</span>}
                    </span>
                    {recipient?.id === a.id && <span style={{ color: C.green, fontSize: 12, flexShrink: 0 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" title="Attach photos, PDFs, documents… (or drag & drop, or paste)" aria-label="Attach files" onClick={() => fileInput.current?.click()} style={toolBtn(false)}>⊕</button>
        <button type="button" title={recording ? "Stop — the voice note lands in the tray" : "Record a voice note (transcribed automatically)"} aria-label={recording ? "Stop recording" : "Record a voice note"} onClick={() => void toggleRecord()} style={toolBtn(recording)}>
          {recording ? "■" : "⏺"}
        </button>
        {canDictate && (
          <button type="button" title={dictating ? "Stop dictating" : "Dictate — your speech becomes text here"} aria-label={dictating ? "Stop dictating" : "Dictate"} onClick={toggleDictation} style={toolBtn(dictating)}>∿</button>
        )}

        {recording ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "7px 4px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, animation: "cc-pulse 1.6s ease-in-out infinite" }} />
            <span className="dm-mono" style={{ fontSize: 12.5, color: C.ink }}>
              recording {String(Math.floor(recSeconds / 60)).padStart(1, "0")}:{String(recSeconds % 60).padStart(2, "0")}
            </span>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>— tap ■ to keep it</span>
          </div>
        ) : (
          <textarea
            ref={textArea}
            value={text}
            onChange={(e) => { setText(e.target.value); grow(); trackMention(e.target); }}
            onSelect={(e) => trackMention(e.currentTarget)}
            onKeyDown={(e) => {
              // The mention popover owns the keyboard while it's open.
              if (mention && mentionMatches.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickAgent(mentionMatches[mentionIdx], mention); return; }
                if (e.key === "Escape") { e.preventDefault(); dismissedMention.current = mention.query; setMention(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
            rows={1}
            placeholder={dictating ? "listening…" : agents.length ? "Type, dictate, or drop any doc — @ addresses an agent · Enter sends" : "Type, dictate, or drop any doc here — Enter sends"}
            style={{ flex: 1, border: "none", outline: "none", resize: "none", fontFamily: "inherit", fontSize: 14, color: C.ink, background: "transparent", lineHeight: 1.5, padding: "7px 4px", maxHeight: 168 }}
          />
        )}

        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="Send"
          title="Send (Enter)"
          style={{
            width: 38, height: 38, borderRadius: 12, border: "none", flexShrink: 0,
            background: canSend ? C.accent : "#EFE9DC",
            color: canSend ? "#FFF8F4" : "#B7AF9F",
            cursor: canSend ? "pointer" : "default",
            fontSize: 16, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: canSend ? "0 6px 16px rgba(228,89,59,.28)" : "none",
            transition: "background .2s, box-shadow .2s, color .2s",
          }}
        >↑</button>
        </div>
      </div>
      <div className="dm-mono" style={{ fontSize: 9.5, letterSpacing: "0.04em", color: "#B7AF9F", margin: "8px 4px 0" }}>
        same pipeline as every channel — photos understood · pdfs read page by page · voice notes transcribed · unsure reads come back as questions in review
      </div>
    </div>
  );
}
