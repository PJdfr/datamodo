"use client";

import { useState } from "react";
import { C, Hov, LOGO, CH_NAMES, ModalShell, monoLabel, ghostBtn } from "./ui";
import { createChannelLinkCodeAction } from "./actions";

// Connect a channel. Email is captured by forwarding to the user's inbox address
// (shown here). Messaging channels (WhatsApp/Slack/Teams) share one bot, so the
// user links their sender identity once by sending a short code to the bot —
// this modal mints + displays that code (createChannelLinkCodeAction →
// lib/datamodo/channels.ts).

const LINKABLE = ["whatsapp", "slack", "teams"] as const;

const HOWTO: Record<string, string> = {
  whatsapp: "Send this code as a WhatsApp message to the datamodo number to link your phone.",
  slack: "DM this code to the datamodo app in Slack to link your account.",
  teams: "Message this code to the datamodo bot in Teams to link your account.",
};

function CodeBlock({ code, expiresAt }: { code: string; expiresAt?: string }) {
  const [copied, setCopied] = useState(false);
  const mins = expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000)) : null;
  return (
    <div style={{ marginTop: 10, background: "#FBF8F1", border: "1px dashed #DCD3C2", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="dm-mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: C.ink }}>{code}</span>
        <Hov
          onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); }}
          base={{ ...ghostBtn, padding: "5px 10px", fontSize: 11.5, marginLeft: "auto" }}
          hover={{ background: "#fff" }}
        >{copied ? "Copied ✓" : "Copy"}</Hov>
      </div>
      {mins != null && <div className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", marginTop: 6 }}>expires in {mins} min · single use</div>}
    </div>
  );
}

function ChannelRow({ channel }: { channel: string }) {
  const [state, setState] = useState<{ code: string; expiresAt?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCode = async () => {
    setPending(true); setError(null);
    const res = await createChannelLinkCodeAction(channel);
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    setState({ code: res.code!, expiresAt: res.expiresAt });
  };

  return (
    <div style={{ border: "1px solid #ECE5D8", borderRadius: 12, padding: "13px 14px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <img src={LOGO[channel]} alt="" width={22} height={22} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{CH_NAMES[channel]}</div>
          <div style={{ fontSize: 11.5, color: "#8A8477" }}>{HOWTO[channel]}</div>
        </div>
        {!state && (
          <Hov onClick={pending ? undefined : getCode} base={{ ...ghostBtn, padding: "7px 13px", fontSize: 12.5, opacity: pending ? 0.6 : 1 }} hover={{ background: "#FBF8F1" }}>
            {pending ? "…" : "Get link code"}
          </Hov>
        )}
      </div>
      {error && <div className="dm-mono" style={{ fontSize: 11, color: C.accent, marginTop: 8 }}>{error}</div>}
      {state && <CodeBlock code={state.code} expiresAt={state.expiresAt} />}
    </div>
  );
}

export function ConnectionsModal({ inbox, onClose }: { inbox: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell title="Connect a channel" subtitle="Where datamodo listens for you" onClose={onClose} maxWidth={520}>
      {/* Email — captured by forwarding to your address. */}
      <div className="dm-mono" style={{ ...monoLabel, marginBottom: 8 }}>Email</div>
      <div style={{ border: "1px solid #ECE5D8", borderRadius: 12, padding: "13px 14px", background: "#fff", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <img src={LOGO.gmail} alt="" width={22} height={22} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Forward email</div>
            <div style={{ fontSize: 11.5, color: "#8A8477" }}>Forward (or auto-forward) any email to your address and it’s captured.</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: C.green }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />live</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 9, padding: "8px 11px" }}>
          <span className="dm-mono" style={{ fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inbox}</span>
          <Hov onClick={() => { void navigator.clipboard?.writeText(inbox); setCopied(true); }} base={{ ...ghostBtn, padding: "5px 10px", fontSize: 11.5, marginLeft: "auto" }} hover={{ background: "#fff" }}>{copied ? "Copied ✓" : "Copy"}</Hov>
        </div>
      </div>

      {/* Messaging — one shared bot, linked once with a code. */}
      <div className="dm-mono" style={{ ...monoLabel, marginBottom: 8 }}>Messaging</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {LINKABLE.map((ch) => <ChannelRow key={ch} channel={ch} />)}
      </div>
      <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 14, lineHeight: 1.5 }}>
        Once you’ve sent the code, messages from that account flow into your workspace automatically. The bot handle for each channel appears here once configured.
      </div>
    </ModalShell>
  );
}
