#!/usr/bin/env node
// Mock Ollama — a stand-in server for developing/verifying the LOCAL edition
// where real model weights can't run (CI, sandboxes, tiny machines). Speaks
// just enough of Ollama's surface for the whole datamodo pipeline to run
// END-TO-END: tags/pull (the first-run wizard), OpenAI-compatible chat
// completions with JSON mode + vision parts (extraction, classification,
// adjudication, grounded answers), and embeddings (deterministic vectors, so
// semantic search returns REAL ranked hits).
//
//   node scripts/mock-ollama.mjs [--port 11434]
//
// It is NOT a model: responses come from a tiny rule-based "extractor"
// (companies/people/invoices/amounts/dates via regex), so ingested content
// produces plausible, content-derived entities and facts — enough to verify
// every seam (queue → extraction → knowledge → projections → search) without
// weights. Model QUALITY is exactly what this cannot test.

import http from "node:http";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]) || Number(process.env.MOCK_OLLAMA_PORT) || 11434;

/** Models "installed" on this mock — starts empty like a fresh Ollama; the
 *  wizard's pulls land here. Pre-seed with --models a,b,c */
const seeded = args.includes("--models") ? args[args.indexOf("--models") + 1].split(",") : [];
const installed = new Set(seeded.map((s) => s.trim()).filter(Boolean));

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ------------------------------------------------------------------ */
/* Rule-based "extraction" from the prompt text                        */
/* ------------------------------------------------------------------ */

function ruleExtract(text) {
  const entities = [];
  const facts = [];
  const seen = new Map(); // label -> localId
  let n = 0;
  const add = (kind, label, extra = {}) => {
    const key = `${kind}:${label.toLowerCase()}`;
    if (seen.has(key)) return seen.get(key);
    const localId = `e${++n}`;
    seen.set(key, localId);
    entities.push({ localId, kind, label, ...extra });
    return localId;
  };

  for (const m of text.matchAll(/\b([A-Z][A-Za-z&]+(?: [A-Z][A-Za-z&]+)?) (Corp|Corporation|Inc|GmbH|Ltd|SARL|Group|LLC)\b/g)) {
    add("company", `${m[1]} ${m[2]}`);
  }
  for (const m of text.matchAll(/\b(?:from|with|by|for|to) ([A-Z][a-z]{2,} [A-Z][a-z]{2,})\b/g)) {
    add("person", m[1]);
  }
  const companies = entities.filter((e) => e.kind === "company");
  for (const m of text.matchAll(/\b(INV[-_]?\d+)\b|invoice\s*#\s*(\d+)/gi)) {
    const label = (m[1] ?? `INV-${m[2]}`).toUpperCase();
    const inv = add("invoice", label, { invoiceNo: label });
    const amount = text.match(/(?:€|\$|EUR |USD )\s?(\d+(?:[.,]\d{1,2})?)/);
    if (amount) {
      facts.push({ subjectLocalId: inv, predicate: "amount", cardinality: "one", valueType: "number", valueNumber: Number(amount[1].replace(",", ".")), unit: text.includes("€") || text.includes("EUR") ? "EUR" : "USD", confidence: 0.95 });
    }
    const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (date) {
      facts.push({ subjectLocalId: inv, predicate: "due_date", cardinality: "one", valueType: "date", valueDate: date[1], confidence: 0.92 });
    }
    if (companies[0]) {
      facts.push({ subjectLocalId: inv, predicate: "issued_by", cardinality: "one", valueType: "entity", valueEntityLocalId: seen.get(`company:${companies[0].label.toLowerCase()}`), confidence: 0.9 });
    }
  }
  // people ↔ company affiliation when both present
  const people = entities.filter((e) => e.kind === "person");
  if (people[0] && companies[0]) {
    facts.push({ subjectLocalId: seen.get(`person:${people[0].label.toLowerCase()}`), predicate: "works_at", cardinality: "one", valueType: "entity", valueEntityLocalId: seen.get(`company:${companies[0].label.toLowerCase()}`), confidence: 0.8 });
  }
  return { entities, facts };
}

const guessKind = (text) =>
  /invoice|inv[-_]?\d|facture/i.test(text) ? "invoice"
  : /receipt|reçu/i.test(text) ? "receipt"
  : /contract|agreement/i.test(text) ? "contract"
  : /report|study/i.test(text) ? "report"
  : "note";

/** Route a chat request to a purposeful mock answer by sniffing the prompt. */
function answerChat(system, user, hasImages) {
  const all = `${system}\n${user}`;
  if (all.includes('"matchId"') || /Which candidate/i.test(all)) {
    // Entity adjudication — never merge blindly (the safe answer).
    return { matchId: null, confidence: 0.2, reason: "mock adjudicator: not confident these are the same" };
  }
  if (/classif/i.test(system) && all.includes('"kind"')) {
    return { kind: guessKind(user), confidence: 0.9 };
  }
  if (all.includes('"answerable"')) {
    return { answerable: true, answer: "Based on your data: the mock model found the sources below relevant. [1]" };
  }
  if (hasImages) {
    // Vision tier (photos + scanned PDFs): a "described" thick node. Include a
    // marker so tests/humans can SEE the vision path ran (not metadata_only).
    const { entities, facts } = ruleExtract(user);
    return {
      summary: "**Seen by the mock vision model.** A document image — the mock describes it deterministically (a real model reads the pixels).",
      entities, facts,
      overallConfidence: 0.85,
    };
  }
  if (all.includes('"summary"')) {
    const { entities, facts } = ruleExtract(user);
    return {
      summary: `Document read by the mock model. Kind: **${guessKind(user)}**; ${entities.length} entities spotted.`,
      entities, facts,
      overallConfidence: 0.88,
    };
  }
  if (all.includes('"entities"')) {
    const { entities, facts } = ruleExtract(user);
    return { entities, facts, overallConfidence: entities.length ? 0.9 : 0.6 };
  }
  if (all.includes('"fields"')) {
    return { description: "Mock-drafted category", fields: [{ key: "name", label: "Name", type: "text" }], relations: [] };
  }
  return { summary: "mock fallback", entities: [], facts: [], overallConfidence: 0.5 };
}

/* ------------------------------------------------------------------ */
/* Deterministic embeddings — cosine-meaningful without a model        */
/* ------------------------------------------------------------------ */

/** 768-dim bag-of-words hash embedding: each word contributes to a few seeded
 *  positions, then L2-normalize. Same text → same vector; overlapping texts →
 *  genuinely similar vectors, so ANN ranking behaves like the real thing. */
function embed(text, dim = 768) {
  const v = new Float64Array(dim);
  const words = String(text).toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  for (const w of words) {
    const h = createHash("sha256").update(w).digest();
    for (let k = 0; k < 6; k++) {
      const idx = h.readUInt16BE(k * 2) % dim;
      const sign = h[12 + k] & 1 ? 1 : -1;
      v[idx] += sign;
    }
  }
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Array.from(v, (x) => x / norm);
}

/* ------------------------------------------------------------------ */
/* HTTP surface                                                        */
/* ------------------------------------------------------------------ */

const readBody = (req) =>
  new Promise((res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => res(Buffer.concat(chunks).toString("utf8")));
  });

const json = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/tags") {
    return json(res, 200, { models: [...installed].map((name) => ({ name, model: name, size: 1 })) });
  }
  if (path === "/api/version") return json(res, 200, { version: "0.0.0-mock" });

  if (path === "/api/pull" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const model = body.model ?? body.name ?? "";
    log("pull", model);
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    if (/nope|missing/.test(model)) {
      res.end(JSON.stringify({ error: `pull model manifest: file does not exist: ${model}` }) + "\n");
      return;
    }
    // A few progress frames, then success — enough for progress rendering.
    const total = 1000;
    for (const done of [0, 250, 600, 1000]) {
      res.write(JSON.stringify({ status: "pulling", total, completed: done }) + "\n");
      await new Promise((r) => setTimeout(r, 60));
    }
    installed.add(model.includes(":") ? model : `${model}:latest`);
    res.end(JSON.stringify({ status: "success" }) + "\n");
    return;
  }

  if (path === "/v1/chat/completions" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const model = String(body.model ?? "");
    const bare = model.replace(/:latest$/, "");
    const hasKey = Boolean(req.headers.authorization);
    // Keyless = Ollama semantics (a model must be pulled first). A bearer key
    // = a cloud API (OpenAI/OpenRouter-shaped) — any model id is accepted, so
    // BYOK flows can be driven against this mock via *_BASE_URL.
    if (!hasKey && installed.size && ![...installed].some((m) => m === model || m.replace(/:latest$/, "") === bare)) {
      log("chat", model, "→ 404 not installed");
      return json(res, 404, { error: { message: `model "${model}" not found, try pulling it first` } });
    }
    if (hasKey) log("auth", `bearer ${String(req.headers.authorization).slice(7, 19)}…`);
    const system = typeof body.messages?.[0]?.content === "string" ? body.messages[0].content : "";
    const userMsg = body.messages?.find((m) => m.role === "user");
    const parts = Array.isArray(userMsg?.content) ? userMsg.content : null;
    const user = parts ? parts.filter((p) => p.type === "text").map((p) => p.text).join("\n") : String(userMsg?.content ?? "");
    const hasImages = Boolean(parts?.some((p) => p.type === "image_url"));
    const out = answerChat(system, user, hasImages);
    log("chat", model, hasImages ? "(vision)" : "", "→", Object.keys(out).join(","));
    return json(res, 200, {
      id: "mock",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(out) }, finish_reason: "stop" }],
      usage: { prompt_tokens: Math.ceil(user.length / 4), completion_tokens: 128 },
    });
  }

  if (path === "/v1/embeddings" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
    log("embed", body.model, `×${inputs.length}`);
    return json(res, 200, {
      data: inputs.map((t, index) => ({ index, embedding: embed(t) })),
      model: body.model,
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
  }

  json(res, 404, { error: "mock-ollama: no such route" });
});

server.listen(port, "127.0.0.1", () => {
  log(`mock-ollama listening on http://127.0.0.1:${port}  (installed: ${installed.size ? [...installed].join(", ") : "none"})`);
});
