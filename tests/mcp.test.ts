// Unit tests for the MCP server's pure pieces: derived bearer tokens
// (mcp-token.ts) and the submit_extraction contract (mcp-extraction.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mintMcpToken, verifyMcpToken } from "../lib/datamodo/mcp-token.ts";
import { parseExtraction } from "../lib/datamodo/mcp-extraction.ts";

const SECRET = "test-secret-0123456789";

test("mcp token: mint → verify roundtrip; deterministic per user+secret", () => {
  const t = mintMcpToken("user-42", SECRET);
  assert.ok(t.startsWith("dmk_"));
  assert.equal(verifyMcpToken(t, SECRET), "user-42");
  assert.equal(mintMcpToken("user-42", SECRET), t, "same user, same secret → same token");
  assert.notEqual(mintMcpToken("user-43", SECRET), t);
});

test("mcp token: tampering, wrong secret, and garbage all verify to null", () => {
  const t = mintMcpToken("user-42", SECRET);
  assert.equal(verifyMcpToken(t, "other-secret"), null);
  assert.equal(verifyMcpToken(t.slice(0, -2) + "xx", SECRET), null, "MAC tamper");
  // Re-labeling the user while keeping the MAC must fail.
  const forged = `dmk_${Buffer.from("user-43").toString("base64url")}.${t.split(".")[1]}`;
  assert.equal(verifyMcpToken(forged, SECRET), null);
  assert.equal(verifyMcpToken("", SECRET), null);
  assert.equal(verifyMcpToken("dmk_", SECRET), null);
  assert.equal(verifyMcpToken("Bearer nope", SECRET), null);
  assert.equal(verifyMcpToken(t, ""), null, "no secret configured → nothing verifies");
});

test("parseExtraction: a valid submission passes through unchanged", () => {
  const r = parseExtraction({
    entities: [
      { localId: "e1", kind: "company", label: "Acme Group", naturalKeys: { domain: "acme.com" } },
      { localId: "e2", kind: "invoice", label: "INV-901" },
    ],
    facts: [
      { subjectLocalId: "e2", predicate: "issued_by", value: { kind: "entity", entityLocalId: "e1" }, confidence: 0.9 },
      { subjectLocalId: "e2", predicate: "amount", value: { kind: "number", num: 4200, unit: "USD" } },
      { subjectLocalId: "e2", predicate: "due", value: { kind: "date", date: "2026-08-01" } },
    ],
  });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.extraction.facts.length, 3);
});

test("parseExtraction: dangling localIds and bad dates bounce with a fixable message", () => {
  const dangling = parseExtraction({
    entities: [{ localId: "e1", kind: "person", label: "Bob" }],
    facts: [{ subjectLocalId: "ghost", predicate: "role", value: { kind: "text", text: "cto" } }],
  });
  assert.ok(!dangling.ok);
  if (!dangling.ok) assert.match(dangling.error, /unknown entity localId "ghost"/);

  const badDate = parseExtraction({
    entities: [{ localId: "e1", kind: "person", label: "Bob" }],
    facts: [{ subjectLocalId: "e1", predicate: "born", value: { kind: "date", date: "next tuesday" } }],
  });
  assert.ok(!badDate.ok);
  if (!badDate.ok) assert.match(badDate.error, /YYYY-MM-DD/);

  assert.ok(!parseExtraction({ entities: "nope", facts: [] }).ok);
});

// ---- datamodo mode (2026-07-17): the steering strings --------------------
import { EXTRACTION_DOCTRINE, MCP_INSTRUCTIONS } from "../lib/datamodo/mcp-extraction.ts";

test("datamodo-mode strings: doctrine matches the submit_extraction contract", () => {
  // The doctrine teaches the MCP value shape, not the internal LLM shape.
  assert.match(EXTRACTION_DOCTRINE, /kind:"text"\|"number"\|"date"\|"entity"/);
  assert.match(EXTRACTION_DOCTRINE, /YYYY-MM-DD/);
  assert.match(EXTRACTION_DOCTRINE, /snake_case/);
  assert.match(EXTRACTION_DOCTRINE, /knownEntities/, "names the briefing field it steers on");
  assert.match(EXTRACTION_DOCTRINE, /AT MOST 3 "concept"/);
  assert.match(EXTRACTION_DOCTRINE, /note:\{title/);
  assert.match(EXTRACTION_DOCTRINE, /never invent/i);
});

test("datamodo-mode strings: instructions teach the three loops on real tool names", () => {
  // Every tool the instructions reference must exist by that exact name —
  // a rename that forgets this string would strand the client.
  for (const tool of [
    "extraction_briefing", "submit_extraction", "run_extraction", "list_commits",
    "get_context", "list_facts", "search_documents", "walk_graph", "get_entity",
    "list_pull_requests", "resolve_pull_request",
    "create_category", "suggest_category_template", "update_category",
    "set_context", "create_agent", "update_agent", "set_agent_status",
  ]) {
    assert.ok(MCP_INSTRUCTIONS.includes(tool), `instructions mention ${tool}`);
  }
  assert.match(MCP_INSTRUCTIONS, /WHEN TO ENGAGE/);
  assert.match(MCP_INSTRUCTIONS, /explicit yes\/no/i, "reviews stay user-decided");
  assert.match(MCP_INSTRUCTIONS, /sourceText/, "provenance rule rides the filing loop");
});
