// Unit tests for the pure timeline projection (lib/datamodo/timeline.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline,
  formatFactValue,
  type TimelineEntityInput,
  type TimelineFactInput,
  type TimelineItemInput,
} from "../lib/datamodo/timeline.ts";

const E = (id: string, kind: string, label: string, createdAt = "2026-07-01T10:00:00.000Z"): TimelineEntityInput => ({
  id, kind, label, createdAt,
});

const F = (over: Partial<TimelineFactInput> & Pick<TimelineFactInput, "id" | "subjectEntityId" | "predicate">): TimelineFactInput => ({
  objectEntityId: null,
  valueText: null,
  valueNum: null,
  valueDate: null,
  unit: null,
  validFrom: "2026-07-02T09:00:00.000Z",
  validTo: null,
  supersededBy: null,
  sourceItemId: null,
  ...over,
});

const I = (id: string, receivedAt: string, over: Partial<TimelineItemInput> = {}): TimelineItemInput => ({
  id,
  channel: "email",
  sender: "billing@acme.com",
  subject: "Invoice attached",
  preview: null,
  receivedAt,
  ...over,
});

const ENTITIES = [
  E("acme", "company", "Acme Inc", "2026-07-01T10:00:00.000Z"),
  E("inv", "invoice", "INV-9", "2026-07-02T09:00:00.000Z"),
];

test("buildTimeline: sorts newest first and includes every event family", () => {
  const facts = [
    F({ id: "f1", subjectEntityId: "inv", predicate: "amount", valueNum: 1200, unit: "EUR", sourceItemId: "m1" }),
    F({ id: "f2", subjectEntityId: "inv", predicate: "due_date", valueDate: "2026-07-20", sourceItemId: "m1" }),
    F({ id: "f3", subjectEntityId: "inv", predicate: "issued_by", objectEntityId: "acme", sourceItemId: "m1" }),
  ];
  const items = [I("m1", "2026-07-02T09:00:00.000Z")];
  const ev = buildTimeline(ENTITIES, facts, items);

  const types = ev.map((e) => e.type);
  assert.ok(types.includes("message"), "has a message event");
  assert.ok(types.includes("date"), "has a domain-date event");
  assert.ok(types.includes("seen"), "has first-seen events");

  for (let i = 1; i < ev.length; i++) {
    assert.ok(Date.parse(ev[i - 1].ts) >= Date.parse(ev[i].ts), "descending order");
  }
  // The future due date sits above everything past — that's "upcoming".
  assert.equal(ev[0].type, "date");
  assert.equal(ev[0].ts, "2026-07-20");
  assert.equal(ev[0].dateOnly, true);
  assert.match(ev[0].title, /INV-9 — due date/);
});

test("buildTimeline: message events carry fact counts and entity chips", () => {
  const facts = [
    F({ id: "f1", subjectEntityId: "inv", predicate: "amount", valueNum: 1200, sourceItemId: "m1" }),
    F({ id: "f3", subjectEntityId: "inv", predicate: "issued_by", objectEntityId: "acme", sourceItemId: "m1" }),
  ];
  const ev = buildTimeline(ENTITIES, facts, [I("m1", "2026-07-02T09:00:00.000Z")]);
  const msg = ev.find((e) => e.type === "message")!;
  assert.equal(msg.title, "Invoice attached");
  assert.equal(msg.channel, "email");
  assert.match(msg.detail!, /billing@acme\.com · 2 facts extracted/);
  assert.deepEqual(msg.entities.map((r) => r.id).sort(), ["acme", "inv"]);
});

test("buildTimeline: a superseded fact becomes a change event with old → new", () => {
  const facts = [
    F({
      id: "old", subjectEntityId: "inv", predicate: "amount", valueNum: 1200, unit: "EUR",
      validTo: "2026-07-05T08:00:00.000Z", supersededBy: "new",
    }),
    F({ id: "new", subjectEntityId: "inv", predicate: "amount", valueNum: 1450, unit: "EUR", validFrom: "2026-07-05T08:00:00.000Z", sourceItemId: "m2" }),
  ];
  const ev = buildTimeline(ENTITIES, facts, []);
  const chg = ev.find((e) => e.type === "change")!;
  assert.equal(chg.ts, "2026-07-05T08:00:00.000Z");
  assert.match(chg.title, /INV-9 · amount changed/);
  assert.equal(chg.detail, "1200 EUR → 1450 EUR");
  assert.equal(chg.itemId, "m2", "points at the message that corrected it");
});

test("buildTimeline: superseded date facts do NOT create domain-date events", () => {
  const facts = [
    F({ id: "old", subjectEntityId: "inv", predicate: "due_date", valueDate: "2026-07-10", validTo: "2026-07-03T00:00:00.000Z", supersededBy: "new" }),
    F({ id: "new", subjectEntityId: "inv", predicate: "due_date", valueDate: "2026-07-24" }),
  ];
  const ev = buildTimeline(ENTITIES, facts, []);
  const dates = ev.filter((e) => e.type === "date");
  assert.equal(dates.length, 1, "only the current due date is an event");
  assert.equal(dates[0].ts, "2026-07-24");
  // ...but the correction itself shows up as a change.
  assert.ok(ev.some((e) => e.type === "change" && e.detail === "2026-07-10 → 2026-07-24"));
});

test("buildTimeline: entityId filter keeps only events touching that entity", () => {
  const other = E("bob", "person", "Bob", "2026-07-01T11:00:00.000Z");
  const facts = [
    F({ id: "f1", subjectEntityId: "inv", predicate: "issued_by", objectEntityId: "acme", sourceItemId: "m1" }),
    F({ id: "f2", subjectEntityId: "bob", predicate: "role", valueText: "CFO", sourceItemId: "m2" }),
  ];
  const items = [I("m1", "2026-07-02T09:00:00.000Z"), I("m2", "2026-07-03T09:00:00.000Z", { subject: "Bob intro" })];
  const ev = buildTimeline([...ENTITIES, other], facts, items, { entityId: "acme" });

  // acme: its own first-seen, the message whose facts touch it (as object) —
  // and nothing about Bob.
  assert.ok(ev.some((e) => e.type === "seen" && e.title === "Acme Inc first seen"));
  assert.ok(ev.some((e) => e.type === "message" && e.itemId === "m1"));
  assert.ok(!ev.some((e) => e.itemId === "m2"), "unrelated message filtered out");
  assert.ok(!ev.some((e) => e.title.includes("Bob")), "unrelated entity filtered out");
});

test("buildTimeline: respects the limit after sorting", () => {
  const items = Array.from({ length: 10 }, (_, i) => I(`m${i}`, `2026-07-0${(i % 9) + 1}T0${i % 10}:00:00.000Z`));
  const ev = buildTimeline([], [], items, { limit: 3 });
  assert.equal(ev.length, 3);
  assert.ok(Date.parse(ev[0].ts) >= Date.parse(ev[2].ts));
});

test("formatFactValue: entity refs use labels; numbers carry units", () => {
  const labelOf = (id: string) => (id === "acme" ? "Acme Inc" : "?");
  assert.equal(formatFactValue({ objectEntityId: "acme", valueText: null, valueNum: null, valueDate: null, unit: null }, labelOf), "Acme Inc");
  assert.equal(formatFactValue({ objectEntityId: null, valueText: null, valueNum: 12, valueDate: null, unit: "EUR" }, labelOf), "12 EUR");
  assert.equal(formatFactValue({ objectEntityId: null, valueText: null, valueNum: null, valueDate: "2026-07-20", unit: null }, labelOf), "2026-07-20");
  assert.equal(formatFactValue({ objectEntityId: null, valueText: "net 30", valueNum: null, valueDate: null, unit: null }, labelOf), "net 30");
});

test("buildTimeline: timeBasis 'sent' uses sentAt with receivedAt fallback", () => {
  const facts = [F({ id: "f1", subjectEntityId: "inv", predicate: "amount", valueNum: 1, sourceItemId: "m1" }),
                 F({ id: "f2", subjectEntityId: "inv", predicate: "status", valueText: "open", sourceItemId: "m2" })];
  const items = [
    // Forwarded mail: sent long before it reached the inbox.
    I("m1", "2026-07-02T09:00:00.000Z", { sentAt: "2026-06-01T08:00:00.000Z" }),
    // Channel without a send date.
    I("m2", "2026-07-03T09:00:00.000Z", { subject: "No send date", sentAt: null }),
  ];

  const received = buildTimeline(ENTITIES, facts, items).filter((e) => e.type === "message");
  assert.deepEqual(received.map((e) => e.ts), ["2026-07-03T09:00:00.000Z", "2026-07-02T09:00:00.000Z"]);

  const sent = buildTimeline(ENTITIES, facts, items, { timeBasis: "sent" }).filter((e) => e.type === "message");
  const byId = new Map(sent.map((e) => [e.itemId, e.ts]));
  assert.equal(byId.get("m1"), "2026-06-01T08:00:00.000Z"); // sender's clock
  assert.equal(byId.get("m2"), "2026-07-03T09:00:00.000Z"); // fallback
});
