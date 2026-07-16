// LOCAL EDITION first-run setup — the RAM → model tier → pull wizard.
// Runs from `datamodo setup` and automatically on the first `datamodo serve`
// (when no llm.json exists yet). Detects the RAM budget (host or container),
// lets the user override it, pulls the tier's models from the local Ollama,
// and seeds ~/.datamodo/llm.json — the SAME dashboard-editable store Settings
// writes, so everything the wizard picks stays changeable in the app.
//
// Everything fails soft: no Ollama → print how to get it (or switch to BYOK in
// Settings) and continue — the app runs without a model (keyword search,
// metadata-only filing) until one appears.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { MODEL_TIERS, pickTier, tierModels, parseCgroupLimit, effectiveRamGb } from "./sizing.mjs";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/* ------------------------------------------------------------------ */
/* RAM detection                                                       */
/* ------------------------------------------------------------------ */

/** The machine's usable RAM budget in GB — total memory, capped by the cgroup
 *  limit when we're inside a container (Docker path). */
export async function detectRamGb() {
  let cgroup = null;
  for (const f of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      cgroup = parseCgroupLimit(await fs.readFile(f, "utf8"));
      if (cgroup !== null) break;
    } catch { /* not present (not Linux / not cgroup) */ }
  }
  return effectiveRamGb(os.totalmem(), cgroup);
}

/* ------------------------------------------------------------------ */
/* Ollama client (bare HTTP — no SDK)                                  */
/* ------------------------------------------------------------------ */

const bare = (url) => url.trim().replace(/\/+$/, "").replace(/\/v1$/, "");

/** The models already present on the Ollama server, or null when unreachable. */
export async function ollamaTags(baseUrl) {
  try {
    const res = await fetch(`${bare(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

/** Pull one model, streaming NDJSON progress to a single console line.
 *  Returns true on success. */
export async function ollamaPull(baseUrl, model, log = console) {
  const url = `${bare(baseUrl)}/api/pull`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    });
  } catch (e) {
    log.error(`  ✗ ${model} — could not reach Ollama (${e?.cause?.code ?? e?.message ?? e})`);
    return false;
  }
  if (!res.ok || !res.body) {
    log.error(`  ✗ ${model} — Ollama answered ${res.status}`);
    return false;
  }
  const isTty = Boolean(process.stdout.isTTY);
  const line = (s) => {
    if (isTty) process.stdout.write(`\r\x1b[2K  ${s}`);
  };
  let failed = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      try {
        const j = JSON.parse(raw);
        if (j.error) failed = j.error;
        else if (j.total && j.completed !== undefined) {
          const pct = Math.floor((j.completed / j.total) * 100);
          line(`↓ ${model} — ${j.status ?? "downloading"} ${pct}%`);
        } else if (j.status) line(`↓ ${model} — ${j.status}`);
      } catch { /* partial line */ }
    }
  }
  if (isTty) process.stdout.write("\r\x1b[2K");
  if (failed) {
    log.error(`  ✗ ${model} — ${failed}`);
    return false;
  }
  log.log(`  ✓ ${model}`);
  return true;
}

/* ------------------------------------------------------------------ */
/* llm.json seeding (same store the dashboard edits)                   */
/* ------------------------------------------------------------------ */

async function readLlmJson(dataDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, "llm.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Seed the OLLAMA slot of llm.json. Model names are namespaced PER PROVIDER
 *  (lib/local/config.ts `LocalLlmFile`) — the wizard only ever picks Ollama
 *  models, and they must never leak into a BYOK provider's requests. */
async function writeLlmJson(dataDir, ollamaModels) {
  const current = (await readLlmJson(dataDir)) ?? {};
  const providers = current.providers && typeof current.providers === "object" ? current.providers : {};
  const next = {
    ...(current.url ? { url: current.url } : {}),
    providers: { ...providers, ollama: { ...(providers.ollama ?? {}), ...ollamaModels } },
  };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "llm.json"), JSON.stringify(next, null, 2));
  return next;
}

/* ------------------------------------------------------------------ */
/* The wizard                                                          */
/* ------------------------------------------------------------------ */

const OLLAMA_HINT = `datamodo: Ollama isn't running at %URL%.
  Local AI needs Ollama (free, private): https://ollama.com/download
  Start it, then run \`datamodo setup\` — or open Settings in the dashboard
  and either point datamodo at another Ollama URL or switch to
  "Bring your own key" (Anthropic/OpenAI/OpenRouter). Everything else works
  meanwhile — messages are stored and filed, just not AI-read.`;

/**
 * First-run model sizing. Options:
 *   dataDir       — ~/.datamodo
 *   interactive   — ask before acting (TTY only)
 *   ram           — RAM budget override in GB (--ram)
 *   ollamaUrl     — Ollama server (default localhost:11434)
 *   skipModels    — write nothing, pull nothing (--skip-models)
 *   force         — re-run even when llm.json already exists
 * Returns { ran, tier, pulled } for the caller's logging; never throws.
 */
export async function runFirstRunSetup(opts = {}) {
  const dataDir = opts.dataDir;
  const log = opts.log ?? console;
  const ollamaUrl = opts.ollamaUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
  if (opts.skipModels) return { ran: false, reason: "skipped" };

  // llm.json is the "already set up" marker — the dashboard owns it from then on.
  if (!opts.force && (await readLlmJson(dataDir)) !== null) return { ran: false, reason: "configured" };

  const detected = Number(opts.ram) > 0 ? Number(opts.ram) : await detectRamGb();
  let tier = pickTier(detected);

  log.log("");
  log.log("datamodo — first-run setup (local AI)");
  log.log(`  RAM budget: ${detected} GB → "${tier.name}" models`);
  log.log(`  text ${tier.text} · vision ${tier.vision ?? "— (none at this size)"} · embeddings ${tier.embed}`);
  log.log(`  ${tier.note}`);

  if (opts.interactive && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question(`  Use this? [Y/n, or a RAM budget in GB e.g. "8"]: `)).trim().toLowerCase();
      if (answer === "n" || answer === "no") {
        log.log("  Skipped — set models any time in Settings, or run `datamodo setup`.");
        return { ran: false, reason: "declined" };
      }
      const asNumber = Number(answer);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        tier = pickTier(asNumber);
        log.log(`  ${asNumber} GB → "${tier.name}": text ${tier.text} · vision ${tier.vision ?? "—"} · embeddings ${tier.embed}`);
      }
    } finally {
      rl.close();
    }
  }

  const tags = await ollamaTags(ollamaUrl);
  if (tags === null) {
    log.log(OLLAMA_HINT.replaceAll("%URL%", ollamaUrl));
    // Seed the choice anyway so the dashboard shows the intended models and a
    // later `ollama pull` (or setup re-run) picks them straight up.
    await writeLlmJson(dataDir, { extract: tier.text, ...(tier.vision ? { vision: tier.vision } : {}) });
    return { ran: true, tier, pulled: [] };
  }

  const wanted = tierModels(tier);
  const have = new Set(tags.map((t) => t.replace(/:latest$/, "")));
  const missing = wanted.filter((m) => !have.has(m) && !have.has(m.replace(/:latest$/, "")) && !tags.includes(m));

  const pulled = [];
  if (missing.length) {
    log.log(`  Pulling ${missing.length} model${missing.length > 1 ? "s" : ""} from Ollama (one-time download)…`);
    for (const m of missing) {
      if (await ollamaPull(ollamaUrl, m, log)) pulled.push(m);
    }
  } else {
    log.log("  All models already present on Ollama.");
  }

  await writeLlmJson(dataDir, { extract: tier.text, ...(tier.vision ? { vision: tier.vision } : {}) });
  log.log("  Models saved — change them any time in the dashboard (Settings).");
  log.log("");
  return { ran: true, tier, pulled };
}

export { MODEL_TIERS, pickTier, tierModels };
