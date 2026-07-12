"use client";

/**
 * CHAT — the app itself as a capture channel, peer to email/WhatsApp/Slack.
 * Whatever you drop here rides the SAME pipeline as every other channel:
 * text → extraction, photos → vision tier, PDFs/docs → document tier with
 * page-cited chunks, voice notes → transcription tier. The thread shows each
 * message's processing state, so "send → filed" is visible end to end.
 *
 * Input affordances: multiline text, any-file attach (pictures, pdf, docs,
 * sheets…), a dictaphone (MediaRecorder voice note — transcribed server-side
 * by the audio tier), and live speech-to-text into the text box where the
 * browser supports it (Web Speech API, feature-detected).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { C, Hov, primaryBtn } from "./ui";

interface ChatAttachment { filename: string | null; contentType: string | null; bytes: number }
interface ChatMessage {
  id: string;
  text: string | null;
  status: string;
  error: string | null;
  at: string;
  attachments: ChatAttachment[];
}

interface PendingFile { file: File; kind: "file" | "voice" }

const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fileGlyph = (ct: string | null) => {
  const t = (ct ?? "").toLowerCase();
  if (t.startsWith("image/")) return "🖼";
  if (t.startsWith("audio/")) return "🎙";
  if (t.includes("pdf")) return "📄";
  return "📎";
};

const STATUS_CHIP: Record<string, { label: string; color: string }> = {
  received: { label: "⟳ processing", color: "#8A6D1F" },
  stored: { label: "⟳ processing", color: "#8A6D1F" },
  analyzing: { label: "⟳ reading", color: "#8A6D1F" },
  analyzed: { label: "✓ filed into your graph", color: "#3E6B44" },
  failed: { label: "⚠ failed", color: "#B3261E" },
  skipped: { label: "— skipped", color: "#8A8477" },
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

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [dictating, setDictating] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const canDictate =
    typeof window !== "undefined" &&
    Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (!res.ok) return;
      const json = await res.json();
      setMessages(json.messages ?? []);
    } catch { /* keep the current thread */ }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  // Poll while anything is still being read — "send → filed" stays live.
  useEffect(() => {
    const busy = messages.some((m) => ["received", "stored", "analyzing"].includes(m.status));
    if (!busy) return;
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [messages, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, loading]);

  /* ---- dictaphone: record a voice note (transcribed by the audio tier) ---- */
  const toggleRecord = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
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
          const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type });
          setPending((p) => [...p, { file, kind: "voice" }]);
        }
        setRecording(false);
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      setError("microphone unavailable — check browser permissions");
    }
  };

  /* ---- live speech-to-text into the text box (feature-detected) ---- */
  const toggleDictation = () => {
    if (dictating) {
      recognition.current?.stop();
      return;
    }
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
      if (heard) setText((t) => (t ? t.replace(/\s*$/, " ") : "") + heard.trim());
    };
    rec.onend = () => setDictating(false);
    recognition.current = rec;
    rec.start();
    setDictating(true);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const files = [...list].map((file) => ({ file, kind: "file" as const }));
    setPending((p) => [...p, ...files].slice(0, 8));
  };

  const send = async () => {
    if (sending || (!text.trim() && pending.length === 0)) return;
    setSending(true); setError(null);
    try {
      const attachments = await Promise.all(
        pending.map(async (p) => ({
          filename: p.file.name,
          contentType: p.file.type || "application/octet-stream",
          dataBase64: await toBase64(p.file),
        })),
      );
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, attachments: attachments.length ? attachments : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(String((json as { error?: string }).error ?? "could not send")); return; }
      setText("");
      setPending([]);
      await load();
    } catch {
      setError("network error — try again");
    } finally {
      setSending(false);
    }
  };

  const iconBtn = (active: boolean) => ({
    width: 36, height: 36, borderRadius: 10, border: `1px solid ${active ? C.accent : "#E1D9C8"}`,
    background: active ? "#FDF1EC" : "#fff", color: active ? C.accent : "#57534A",
    cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0,
  });

  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", height: "calc(100vh - 190px)", minHeight: 420 }}>
      {/* ---- thread ---- */}
      <div className="cc-scroll" style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
        {loading && <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "30px 4px" }}>Loading your thread…</div>}
        {!loading && messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "56px 20px" }}>
            <div className="dm-bob" style={{ width: 58, height: 58, borderRadius: 17, background: "#F6F2E9", border: "1px solid #E7E0D2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 24 }}>✉</div>
            <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Send anything, right from here</h2>
            <p style={{ fontSize: 14, color: "#57534A", maxWidth: "46ch", margin: 0, lineHeight: 1.55 }}>
              The app is a channel like email or WhatsApp: type a braindump, attach photos, PDFs or documents, or hold the mic for a voice note — everything rides the same pipeline and files itself into your graph.
            </p>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 2px" }}>
          {messages.map((m) => {
            const chip = STATUS_CHIP[m.status] ?? { label: m.status, color: "#8A8477" };
            return (
              <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: "14px 14px 4px 14px", padding: "10px 13px", boxShadow: "0 10px 26px -22px rgba(33,30,24,.4)" }}>
                  {m.text && <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>}
                  {m.attachments.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: m.text ? 8 : 0 }}>
                      {m.attachments.map((a, i) => (
                        <span key={i} className="dm-mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#57534A", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 7, padding: "3px 8px" }}>
                          <span>{fileGlyph(a.contentType)}</span>
                          <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.filename ?? "attachment"}</span>
                          <span style={{ color: "#A39B8B" }}>{fmtBytes(a.bytes)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B", display: "flex", gap: 8, alignItems: "center" }}>
                  <span>{fmtTime(m.at)}</span>
                  <span style={{ color: chip.color }} title={m.error ?? undefined}>{chip.label}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
      </div>

      {/* ---- composer ---- */}
      {pending.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 2px 0" }}>
          {pending.map((p, i) => (
            <span key={i} className="dm-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#57534A", background: "#fff", border: `1px solid ${p.kind === "voice" ? C.accent : "#E1D9C8"}`, borderRadius: 8, padding: "4px 8px" }}>
              <span>{p.kind === "voice" ? "🎙" : fileGlyph(p.file.type)}</span>
              <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.file.name}</span>
              <span style={{ color: "#A39B8B" }}>{fmtBytes(p.file.size)}</span>
              <button type="button" onClick={() => setPending((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${p.file.name}`}
                style={{ border: "none", background: "transparent", color: "#A39B8B", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      {error && <div className="dm-mono" style={{ fontSize: 11, color: C.accent, padding: "6px 2px 0" }}>{error}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 10, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 14, padding: 10, boxShadow: "0 18px 44px -34px rgba(33,30,24,.35)" }}>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" title="Attach photos, PDFs, documents…" onClick={() => fileInput.current?.click()} style={iconBtn(false)}>📎</button>
        <button type="button" title={recording ? "Stop recording" : "Record a voice note (transcribed automatically)"} onClick={toggleRecord} style={iconBtn(recording)}>
          {recording ? "■" : "🎙"}
        </button>
        {canDictate && (
          <button type="button" title={dictating ? "Stop dictating" : "Dictate — speech becomes text here"} onClick={toggleDictation} style={iconBtn(dictating)}>
            {dictating ? "…" : "🗣"}
          </button>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          rows={Math.min(5, Math.max(1, text.split("\n").length))}
          placeholder={recording ? "Recording… tap ■ to attach the voice note" : "Type, paste, dictate — or just attach and hit send"}
          style={{ flex: 1, border: "none", outline: "none", resize: "none", fontFamily: "inherit", fontSize: 14, color: C.ink, background: "transparent", lineHeight: 1.5, padding: "8px 2px" }}
        />
        <Hov onClick={sending ? undefined : send}
          base={{ ...primaryBtn(sending || (!text.trim() && pending.length === 0)), padding: "9px 16px", fontSize: 13.5 }}
          hover={{ background: C.accentPress }}>
          {sending ? "Sending…" : "Send ↑"}
        </Hov>
      </div>
      <div className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", margin: "7px 4px 0" }}>
        Same pipeline as every channel — photos are understood, PDFs read page by page, voice notes transcribed. Unsure extractions come back as questions in Review.
      </div>
    </div>
  );
}
