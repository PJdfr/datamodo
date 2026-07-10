/* global React */
const DSs = window.DatamodoDesignSystem_07247b;
const monoS = "var(--dm-font-mono, monospace)";
const displayS = "var(--dm-font-display, sans-serif)";
const MAXs = 1160;
const smono = { fontFamily: monoS, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--dm-text-on-ink-faint)", marginBottom: 6 };
const hlS = { background: "rgba(228,89,59,0.16)", color: "#F0714E", fontWeight: 600, padding: "0 3px", borderRadius: 4 };

function EmailMini() {
  return (
    <div style={{ background: "#fff", color: "#1E1B16", fontFamily: "var(--dm-font-body)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid #EEE9DF" }}>
        <img src="../../assets/logos/google-gmail.svg" alt="" width="15" height="15" />
        <span style={{ fontFamily: monoS, fontSize: 10.5, color: "#9C9687" }}>Gmail</span>
        <span style={{ marginLeft: "auto", fontFamily: monoS, fontSize: 10, color: "#B8B2A4" }}>2h</span>
      </div>
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Re: Q3 retainer — invoice</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#E4593B", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>S</span>
          <span style={{ fontSize: 12 }}><b style={{ fontWeight: 600 }}>Sarah Chen</b></span>
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#3F3B33" }}>Approving the retainer with <span style={hlS}>Acme Inc</span> — <span style={hlS}>$12,000</span>, due Aug 1.</p>
      </div>
    </div>
  );
}
function TeamsMini() {
  return (
    <div style={{ background: "#fff", color: "#252423", fontFamily: "var(--dm-font-body)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#F5F5FB", borderBottom: "1px solid #E6E5F2" }}>
        <img src="../../assets/logos/microsoft-teams.svg" alt="" width="15" height="15" />
        <span style={{ fontFamily: monoS, fontSize: 10.5, color: "#6264A7", fontWeight: 600 }}>Teams · Deals</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9B99B5" }}>▦</span>
      </div>
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#6264A7", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>MJ</span>
          <div>
            <div style={{ fontSize: 11, color: "#8A88A0", marginBottom: 3 }}>Maya Juno · 10:24</div>
            <div style={{ background: "#F0F0F8", border: "1px solid #E6E5F2", borderRadius: "2px 10px 10px 10px", padding: "8px 10px", fontSize: 12.5, lineHeight: 1.45, color: "#252423" }}>
              Locked the <span style={hlS}>Northwind</span> renewal — <span style={hlS}>$40k</span>, kickoff <span style={hlS}>Aug 15</span>. Looping in <span style={hlS}>Priya</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function WhatsAppMini() {
  return (
    <div style={{ background: "#EFE7DE", color: "#111B21", fontFamily: "var(--dm-font-body)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#075E54" }}>
        <img src="../../assets/logos/whatsapp-icon.svg" alt="" width="16" height="16" />
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>Priya S.</span>
        <span style={{ marginLeft: "auto", fontFamily: monoS, fontSize: 9.5, color: "#B7D3CE" }}>online</span>
      </div>
      <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ alignSelf: "flex-start", maxWidth: "90%", background: "#fff", borderRadius: "2px 8px 8px 8px", padding: "7px 10px", fontSize: 12.5, lineHeight: 1.45, boxShadow: "0 1px 1px rgba(0,0,0,.08)" }}>
          Can you send the pitch deck to <span style={hlS}>Globex</span> — <span style={hlS}>Dana</span>'s intro — by <span style={hlS}>Friday</span>? 🙏
        </div>
        <span style={{ alignSelf: "flex-start", fontFamily: monoS, fontSize: 9, color: "#8AA39B" }}>9:41</span>
      </div>
    </div>
  );
}

function SlackMini() {
  return (
    <div style={{ background: "#fff", color: "#1D1C1D", fontFamily: "var(--dm-font-body)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid #EDE7E9" }}>
        <img src="../../assets/logos/slack-icon.svg" alt="" width="15" height="15" />
        <span style={{ fontFamily: monoS, fontSize: 10.5, color: "#8D8B8E", fontWeight: 600 }}># ops</span>
        <span style={{ marginLeft: "auto", fontFamily: monoS, fontSize: 10, color: "#B7B4B6" }}>1d</span>
      </div>
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: "#4A154B", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>LB</span>
          <div>
            <div style={{ fontSize: 11, color: "#8D8B8E", marginBottom: 3 }}><b style={{ color: "#1D1C1D", fontWeight: 600 }}>Leo Braun</b> · 4:12</div>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#1D1C1D", marginBottom: 7 }}>Signed the <span style={hlS}>Berlin</span> office lease — <span style={hlS}>€4,200</span>/mo from <span style={hlS}>Sep 1</span>. Board deck attached.</p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #E4DFE1", borderRadius: 8, padding: "6px 9px", fontFamily: monoS, fontSize: 11, color: "#3F3B33" }}>
              <span style={{ color: "#E4593B" }}>▤</span> Q2_board.pdf
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutlookMini() {
  return (
    <div style={{ background: "#fff", color: "#1E1B16", fontFamily: "var(--dm-font-body)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid #E7EEF6" }}>
        <img src="../../assets/logos/microsoft-outlook.svg" alt="" width="15" height="15" />
        <span style={{ fontFamily: monoS, fontSize: 10.5, color: "#0F6CBD", fontWeight: 600 }}>Outlook</span>
        <span style={{ marginLeft: "auto", fontFamily: monoS, fontSize: 10, color: "#B8B2A4" }}>3d</span>
      </div>
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Fwd: Warehouse move + insurance</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#0F6CBD", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>S</span>
          <span style={{ fontSize: 12 }}><b style={{ fontWeight: 600 }}>Sana Reyes</b></span>
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#3F3B33", marginBottom: 7 }}>We're at <span style={hlS}>12 Dock Rd</span> now. Insurance with <span style={hlS}>Hartford</span> renews <span style={hlS}>Oct 3</span> — <span style={hlS}>$1,850</span>/yr.</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--dm-surface-sunk)", border: "1px solid var(--dm-border-soft)", borderRadius: 8, padding: "5px 9px", fontFamily: monoS, fontSize: 11, color: "var(--dm-text-body-2)" }}>
          <span style={{ color: "#E4593B" }}>▤</span> policy_HF-88.pdf
        </div>
      </div>
    </div>
  );
}

function SourceGraph() {
  const { LinkedCards, LinkedCard } = DSs;
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const scenes = [
    {
      key: "email", label: "Gmail", logo: "google-gmail", node: <EmailMini />,
      facts: [
        ["acme", "company", "Acme Inc", "2", "1"], ["sarah", "person", "Sarah Chen", "3", "1"], ["addr", "email", "accounts@acme.com", "4", "1"],
        ["inv", "invoice", "#A-204", "2", "2", true], ["amt", "amount", "$12,000", "3", "2", true], ["due", "date", "Aug 1", "4", "2"],
      ],
      links: [["src", "acme"], ["src", "sarah"], ["src", "inv"], ["acme", "sarah"], ["acme", "inv"], ["inv", "amt"], ["inv", "due"], ["acme", "addr"], ["sarah", "addr"]],
    },
    {
      key: "teams", label: "Teams", logo: "microsoft-teams", node: <TeamsMini />,
      facts: [
        ["north", "company", "Northwind", "2", "1"], ["maya", "person", "Maya Juno", "3", "1"], ["renewal", "deal", "Renewal", "4", "1"],
        ["amt2", "amount", "$40,000", "2", "2", true], ["date2", "date", "Aug 15", "3", "2"], ["priya2", "person", "Priya S.", "4", "2"],
      ],
      links: [["src", "north"], ["src", "maya"], ["src", "renewal"], ["north", "renewal"], ["renewal", "amt2"], ["renewal", "date2"], ["north", "maya"], ["maya", "priya2"], ["north", "priya2"]],
    },
    {
      key: "wa", label: "WhatsApp", logo: "whatsapp-icon", node: <WhatsAppMini />,
      facts: [
        ["priya", "person", "Priya S.", "2", "1"], ["task", "task", "Send pitch deck", "3", "1", true], ["globex", "company", "Globex", "4", "1"],
        ["dana", "person", "Dana Okafor", "2", "2"], ["deck", "file", "pitch-deck.pdf", "3", "2"], ["fri", "date", "Friday", "4", "2"],
      ],
      links: [["src", "priya"], ["src", "task"], ["src", "globex"], ["task", "deck"], ["task", "fri"], ["globex", "dana"], ["priya", "globex"], ["dana", "globex"], ["priya", "task"]],
    },
    {
      key: "slack", label: "Slack", logo: "slack-icon", node: <SlackMini />,
      facts: [
        ["berlin", "location", "Berlin office", "2", "1"], ["rent", "amount", "€4,200 / mo", "3", "1", true], ["leo", "person", "Leo Braun", "4", "1"],
        ["lease", "document", "Office lease", "2", "2"], ["deck2", "file", "Q2_board.pdf", "3", "2"], ["sep", "date", "Sep 1", "4", "2"],
      ],
      links: [["src", "berlin"], ["src", "lease"], ["src", "deck2"], ["src", "leo"], ["berlin", "rent"], ["berlin", "lease"], ["lease", "sep"], ["rent", "sep"], ["leo", "deck2"]],
    },
    {
      key: "outlook", label: "Outlook", logo: "microsoft-outlook", node: <OutlookMini />,
      facts: [
        ["dock", "location", "12 Dock Rd", "2", "1"], ["hartford", "company", "Hartford", "3", "1"], ["sana", "person", "Sana Reyes", "4", "1"],
        ["yr", "amount", "$1,850 / yr", "2", "2", true], ["oct", "date", "Oct 3", "3", "2"], ["policy", "document", "policy_HF-88.pdf", "4", "2"],
      ],
      links: [["src", "dock"], ["src", "hartford"], ["src", "sana"], ["src", "policy"], ["hartford", "yr"], ["hartford", "oct"], ["hartford", "policy"], ["yr", "oct"], ["dock", "hartford"]],
    },
  ];
  const sc = scenes[active];

  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % scenes.length), 4800);
    return () => clearInterval(id);
  }, [paused]);

  const fact = ([id, kind, label, gc, gr, accent]) => (
    <LinkedCard key={id} id={id} tone={accent ? "accent" : "ink"} tilt glow radius={13} style={{ gridColumn: gc, gridRow: gr, alignSelf: "center" }}>
      <div style={{ ...smono, color: accent ? "var(--dm-accent)" : "var(--dm-text-on-ink-faint)" }}>{kind}</div>
      <b style={{ fontFamily: kind === "amount" || kind === "date" || kind === "invoice" || kind === "file" ? monoS : "inherit", fontSize: 13.5, color: accent ? "var(--dm-accent)" : "inherit" }}>{label}</b>
    </LinkedCard>
  );

  return (
    <section style={{ background: "var(--dm-ink)", color: "var(--dm-text-on-ink)" }}>
      <div style={{ maxWidth: MAXs, margin: "0 auto", padding: "88px 28px" }}>
        <div style={{ maxWidth: 660, marginBottom: 20 }}>
          <div style={{ marginBottom: 16 }}><DSs.Eyebrow onDark>everything connects</DSs.Eyebrow></div>
          <h2 style={{ fontFamily: displayS, fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 16 }}>A message is just a small graph of facts.</h2>
          <p style={{ fontSize: 17, color: "var(--dm-text-on-ink-muted)", maxWidth: "54ch" }}>A retainer email, a deal thread, a favor over WhatsApp, a lease signed in Slack — every message hides a few facts, a file, a date worth keeping. datamodo reads them where they live and links each one back to what you already know.</p>
        </div>

        {/* one scenario graph (auto-advances; pauses on hover) */}
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <LinkedCards
            key={sc.key}
            links={sc.links}
            style={{ display: "grid", gridTemplateColumns: "minmax(230px,270px) 1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "44px 40px", alignItems: "center", padding: "36px 6px", minHeight: 360 }}
          >
            <LinkedCard id="src" tone="cream" lift padding={0} radius={14} style={{ overflow: "hidden", gridColumn: "1", gridRow: "1 / 3", alignSelf: "center" }}>{sc.node}</LinkedCard>
            {sc.facts.map(fact)}
          </LinkedCards>
        </div>

        {/* source selector + 1·2·3 progress, below the graph */}
        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "center", flexWrap: "wrap" }}>
          {scenes.map((s, i) => (
            <button key={s.key} onClick={() => setActive(i)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "9px 15px", borderRadius: 999, cursor: "pointer", position: "relative", overflow: "hidden",
              border: "1px solid " + (i === active ? "var(--dm-accent)" : "var(--dm-ink-border)"),
              background: i === active ? "rgba(228,89,59,0.14)" : "transparent",
              color: i === active ? "var(--dm-accent)" : "var(--dm-text-on-ink-muted)",
              fontFamily: "var(--dm-font-body)", fontSize: 13, fontWeight: 500, transition: "all .2s ease",
            }}>
              <img src={`../../assets/logos/${s.logo}.svg`} alt="" width="16" height="16" style={{ display: "block" }} />
              {s.label}
              {i === active && (
                <span key={active} aria-hidden="true" style={{
                  position: "absolute", left: 0, bottom: 0, height: 3, width: "100%", background: "var(--dm-accent)",
                  transformOrigin: "left", transform: "scaleX(0)", animation: "dm-fill 4.8s linear forwards",
                  animationPlayState: paused ? "paused" : "running",
                }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

window.LandingSources = { SourceGraph };
