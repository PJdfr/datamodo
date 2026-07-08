"use client";

import { useEffect, useState } from "react";
import { C, Hov, LOGO, monoLabel } from "./ui";
import { listChannelsAction, startChannelLinkAction, type ChannelStatus } from "./actions";

// "Connect a channel" — the dashboard surface for the forward-to-a-contact bots.
// Email is shown for context (it routes by its unique address); WhatsApp/Slack/
// Teams route by sender, so connecting means proving your identity once by
// sending the shown code to the shared bot.

function LogoTile({ id, label }: { id: string; label: string }) {
  const src = LOGO[id];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={label} style={{ width: 26, height: 26, borderRadius: 6 }} />;
  }
  return (
    <span className="dm-display" style={{ width: 26, height: 26, borderRadius: 6, background: C.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
      {label.charAt(0)}
    </span>
  );
}

function ChannelRow({ ch }: { ch: ChannelStatus }) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [botHandle, setBotHandle] = useState<string | null>(ch.botHandle);
  const [err, setErr] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setErr(null);
    const res = await startChannelLinkAction(ch.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setCode(res.code);
    setBotHandle(res.botHandle);
  };

  const connected = Boolean(ch.linkedHandle);

  return (
    <div style={{ border: "1px solid #E7E0D2", borderRadius: 14, padding: "14px 16px", background: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LogoTile id={ch.id} label={ch.label} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{ch.label}</div>
          <div className="dm-mono" style={{ fontSize: 11, color: connected ? C.green : ch.configured ? "#8A8477" : "#A39B8B", marginTop: 2 }}>
            {connected ? `Connected · ${ch.linkedHandle}` : ch.configured ? "Ready to connect" : "Not set up on the server yet"}
          </div>
        </div>
        {connected ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.green }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} /> Forwarding active
          </span>
        ) : (
          <Hov
            onClick={ch.configured && !busy ? connect : undefined}
            base={{ background: ch.configured ? C.accent : "#EFE9DC", color: ch.configured ? "#fff8f4" : "#A39B8B", border: "none", borderRadius: 10, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: ch.configured && !busy ? "pointer" : "default" }}
            hover={ch.configured ? { background: C.accentPress } : undefined}
          >
            {busy ? "…" : code ? "New code" : "Connect"}
          </Hov>
        )}
      </div>

      {err && <div className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{err}</div>}

      {code && !connected && (
        <div style={{ background: "#F6F2E9", border: "1px solid #ECE5D8", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="dm-mono" style={{ ...monoLabel, color: "#8A8477" }}>
            1 · Send this code {botHandle ? `to ${botHandle}` : "to the bot"} on {ch.label}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dm-mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", color: C.ink }}>{code}</span>
            <Hov
              onClick={() => navigator.clipboard?.writeText(code)}
              base={{ background: "#fff", border: "1px solid #E1D9C8", borderRadius: 8, padding: "5px 10px", fontFamily: "inherit", fontSize: 11.5, color: "#57534A", cursor: "pointer" }}
              hover={{ background: "#FBF8F1" }}
            >
              Copy
            </Hov>
          </div>
          <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477" }}>
            2 · The bot replies “Connected”. Then forward anything here — it lands in your workspace. Code expires in 15 min.
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChannelsModal({ inbox, onClose }: { inbox: string; onClose: () => void }) {
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    listChannelsAction().then((res) => {
      if (res.ok) setChannels(res.channels);
      else setErr(res.error);
    });
  };
  useEffect(load, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(33,30,24,.5)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 540, background: "#F6F2E9", border: "1px solid #E1D9C8", borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 90px -40px rgba(33,30,24,.7)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 8px" }}>
          <div>
            <div className="dm-display" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.025em" }}>Connect a channel</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 3, maxWidth: "44ch", lineHeight: 1.4 }}>
              Forward any message to the bot and it lands in your workspace. Connect once — we recognize you by who’s forwarding.
            </div>
          </div>
          <Hov onClick={onClose} base={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #E1D9C8", background: "#fff", color: "#8A8477", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }} hover={{ background: "#FBF8F1", color: C.ink }}>✕</Hov>
        </div>

        <div className="cc-scroll" style={{ padding: "12px 24px 22px", overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Email — the existing, always-on capture address (routes by recipient). */}
          <div style={{ border: "1px solid #E7E0D2", borderRadius: 14, padding: "14px 16px", background: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 26, height: 26, borderRadius: 6, background: "#EFE9DC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✉️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Email</div>
              <div className="dm-mono" style={{ fontSize: 11, color: C.green, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Connected · {inbox}</div>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.green }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} /> Active
            </span>
          </div>

          {err && <div className="dm-mono" style={{ fontSize: 12, color: C.accent }}>{err}</div>}
          {!channels && !err && <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "8px 2px" }}>Loading channels…</div>}
          {channels?.map((ch) => <ChannelRow key={ch.id} ch={ch} />)}
        </div>
      </div>
    </div>
  );
}
