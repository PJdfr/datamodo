// Unit tests for the timeline projection's pure core (lib/datamodo/timeline.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { composeEntityTimeline, type TimelineFactRow, type TimelineSourceRow } from "../lib/datamodo/timeline.ts";

const fact = (over: Partial<TimelineFactRow>): TimelineFactRow => ({
  id: "f1",
  predicate: "amount",
  value: "100 USD",
  incoming: false,
  otherLabel: null,
  validFrom: "2026-07-01T10:00:00Z",
  validTo: null,
  supersededBy: null,
  ...over,
});

test("timeline: supersession renders as ONE changed event (was → now), newest first", () => {
  const events = composeEntityTimeline(
    [
      fact({ id: "a", value: "4250 USD", validFrom: "2026-07-01T10:00:00Z", validTo: "2026-07-08T09:00:00Z", supersededBy: "b" }),
      fact({ id: "b", value: "18500 USD", validFrom: "2026-07-08T09:00:00Z" }),
    ],
    [],
  );
  assert.deepEqual(events.map((e) => e.type), ["changed", "asserted"]);
  assert.equal(events[0].was, "4250 USD");
  assert.equal(events[0].value, "18500 USD");
  assert.equal(events[1].value, "4250 USD"); // the original assert survives as history
});

test("timeline: closed with no successor = retracted", () => {
  const events = composeEntityTimeline(
    [fact({ validFrom: "2026-07-01T10:00:00Z", validTo: "2026-07-02T10:00:00Z" })],
    [],
  );
  assert.deepEqual(events.map((e) => e.type), ["retracted", "asserted"]);
});

test("timeline: each source message appears once; sourceless rows skipped", () => {
  const src = (over: Partial<TimelineSourceRow>): TimelineSourceRow => ({
    factId: "f1", itemId: "i1", channel: "email", sender: "a@b.c", subject: "s",
    receivedAt: "2026-07-01T09:00:00Z", snippet: null, ...over,
  });
  const events = composeEntityTimeline(
    [fact({})],
    [src({}), src({ factId: "f2" }), src({ itemId: null }), src({ itemId: "i2", receivedAt: null })],
  );
  assert.equal(events.filter((e) => e.type === "captured").length, 1);
});

test("timeline: incoming edges keep the other end's label", () => {
  const events = composeEntityTimeline(
    [fact({ predicate: "issued_by", incoming: true, otherLabel: "INV-4417", value: "Brightwave" })],
    [],
  );
  assert.equal(events[0].incoming, true);
  assert.equal(events[0].otherLabel, "INV-4417");
});
