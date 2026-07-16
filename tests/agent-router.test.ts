import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentProfiles, routeToAgent, normalizeTerms } from "../lib/datamodo/agent-router.ts";

// Zero-cost agent routing: a deterministic lexical classifier picks which
// agent's purpose steers an UNADDRESSED item in auto mode — no LLM, no spend.
// These tests pin the behavior that matters: confident matches route,
// ambiguity NEVER routes (falls back to the generic agent), and it's all
// deterministic.

const AGENTS = [
  { id: "a-book", name: "Bookkeeper", purposeText: "Track invoices, receipts and payments from suppliers and clients" },
  { id: "a-recruit", name: "Recruiter", purposeText: "Recruiting pipeline: candidates, interviews, offers and rejections" },
  { id: "a-home", name: "Landlord", purposeText: "My rental apartments: leases, tenants, rent and repairs" },
];
const profiles = buildAgentProfiles(AGENTS);

test("normalizeTerms: lowercases, drops stopwords/short words, folds plurals", () => {
  const t = normalizeTerms("Track the INVOICES and receipts from suppliers!");
  assert.ok(t.includes("invoice"), "plural folded");
  assert.ok(t.includes("receipt"));
  assert.ok(t.includes("supplier"));
  assert.ok(!t.includes("the") && !t.includes("track"), "stopwords dropped");
});

test("routes a clearly-on-topic message to the right agent", () => {
  const hit = routeToAgent("Invoice INV-9 from Acme for €300, payment due Friday", profiles);
  assert.equal(hit?.agentId, "a-book");
  assert.ok(hit!.matched.includes("invoice"), "explainable match terms");

  const hit2 = routeToAgent("Interview feedback for the backend candidate — moving to offer", profiles);
  assert.equal(hit2?.agentId, "a-recruit");

  const hit3 = routeToAgent("The tenant in apartment 4B reported a leak, repair scheduled", profiles);
  assert.equal(hit3?.agentId, "a-home");
});

test("the agent NAME counts (double weight)", () => {
  const hit = routeToAgent("forwarding this to the bookkeeper to file", profiles);
  assert.equal(hit?.agentId, "a-book");
});

test("off-topic and ambiguous messages do NOT route (generic agent)", () => {
  // nothing matching anyone
  assert.equal(routeToAgent("Lunch on Tuesday? The weather is great.", profiles), null);
  // terms from TWO agents with no clear winner → ambiguity never routes
  assert.equal(routeToAgent("candidate invoice", profiles), null);
  // empty-ish input
  assert.equal(routeToAgent("ok", profiles), null);
  assert.equal(routeToAgent("Invoice from Acme", []), null);
});

test("shared terms are discounted; distinctive terms decide", () => {
  const shared = buildAgentProfiles([
    { id: "x", name: "A", purposeText: "client invoices and contracts" },
    { id: "y", name: "B", purposeText: "client invoices and candidates" },
  ]);
  // "invoice client" hits both equally → no routing
  assert.equal(routeToAgent("client invoice attached", shared), null);
  // the distinctive term breaks the tie
  assert.equal(routeToAgent("client invoice for the contract", shared)?.agentId, "x");
});

test("deterministic: same input, same output", () => {
  const a = routeToAgent("rent payment for the apartment lease", profiles);
  const b = routeToAgent("rent payment for the apartment lease", profiles);
  assert.deepEqual(a, b);
  assert.equal(a?.agentId, "a-home");
});
