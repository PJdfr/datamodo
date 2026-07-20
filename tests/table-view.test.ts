// Unit tests for the table-surface pure core (lib/datamodo/table-view.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeViewConfig,
  defaultViewConfig,
  viewStorageKey,
  orderColumns,
  visibleRange,
  nextPage,
  coerceCell,
  formatCell,
  compareCells,
  isEmptyCell,
  rowMatchesFilter,
  rowProvenance,
  rowIdentity,
  diffSnapshots,
  moveCell,
} from "../lib/datamodo/table-view.ts";

/* ---- view config ---- */

test("sanitizeViewConfig: garbage degrades to defaults, valid fields survive", () => {
  assert.deepEqual(sanitizeViewConfig(null), defaultViewConfig());
  assert.deepEqual(sanitizeViewConfig("nope"), defaultViewConfig());
  assert.deepEqual(sanitizeViewConfig({ view: "board" }), defaultViewConfig());
  const cfg = sanitizeViewConfig({
    view: "cards",
    sort: { key: "total", dir: "desc" },
    hidden: ["notes", 42, null],
    order: ["number", "client"],
    extra: "ignored",
  });
  assert.equal(cfg.view, "cards");
  assert.deepEqual(cfg.sort, { key: "total", dir: "desc" });
  assert.deepEqual(cfg.hidden, ["notes"]);
  assert.deepEqual(cfg.order, ["number", "client"]);
  // malformed sort drops to null
  assert.equal(sanitizeViewConfig({ sort: { key: "", dir: "desc" } }).sort, null);
  assert.equal(sanitizeViewConfig({ sort: { key: "a", dir: "sideways" } }).sort, null);
});

test("viewStorageKey is per-table and versioned", () => {
  assert.equal(viewStorageKey("k1"), "dm-table-view-v1:k1");
});

test("orderColumns: order first, rest in schema order, hidden removed; all-hidden falls back", () => {
  const cols = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
  const out = orderColumns(cols, { ...defaultViewConfig(), order: ["c", "ghost", "a"], hidden: ["b"] });
  assert.deepEqual(out.map((c) => c.key), ["c", "a", "d"]);
  // hiding everything shows everything (a view can never render zero columns)
  const all = orderColumns(cols, { ...defaultViewConfig(), hidden: ["a", "b", "c", "d"] });
  assert.deepEqual(all.map((c) => c.key), ["a", "b", "c", "d"]);
});

/* ---- window math ---- */

test("visibleRange: covers the viewport with overscan, clamped to [0, total]", () => {
  // 34px rows, 340px viewport, scrolled to row 100
  const r = visibleRange(100 * 34, 340, 34, 1000, 8);
  assert.equal(r.start, 92);
  assert.equal(r.end, 100 + 11 + 8);
  assert.deepEqual(visibleRange(0, 340, 34, 1000, 8), { start: 0, end: 19 });
  // near the end, end clamps to total
  const tail = visibleRange(995 * 34, 340, 34, 1000, 8);
  assert.equal(tail.end, 1000);
  assert.ok(tail.start <= 995);
  assert.deepEqual(visibleRange(0, 340, 34, 0), { start: 0, end: 0 });
});

test("nextPage: sequential windows, honest tail, null when done", () => {
  assert.deepEqual(nextPage(0, 450, 200), { offset: 0, limit: 200 });
  assert.deepEqual(nextPage(200, 450, 200), { offset: 200, limit: 200 });
  assert.deepEqual(nextPage(400, 450, 200), { offset: 400, limit: 50 });
  assert.equal(nextPage(450, 450, 200), null);
  assert.equal(nextPage(0, 0, 200), null);
});

/* ---- typed cells ---- */

test("coerceCell: empty clears, numbers parse, unparseable numbers keep the text", () => {
  assert.equal(coerceCell("text", ""), null);
  assert.equal(coerceCell("number", "1200.5"), 1200.5);
  assert.equal(coerceCell("number", "12 Main St"), "12 Main St");
  assert.equal(coerceCell("date", "2026-07-20"), "2026-07-20");
});

test("formatCell: em-dash for empty, localized numbers", () => {
  assert.equal(formatCell("text", null), "—");
  assert.equal(formatCell("text", ""), "—");
  assert.equal(formatCell("number", 1234567.5), "1,234,567.5");
  assert.equal(formatCell("text", { a: 1 }), '{"a":1}');
});

test("compareCells: typed ordering; isEmptyCell feeds the empties-last rule", () => {
  assert.ok(compareCells("number", 2, 10) < 0);
  assert.ok(compareCells("number", 10, "text") < 0); // numbers before stray text
  assert.ok(compareCells("date", "2026-01-02", "2026-01-10") < 0);
  assert.ok(compareCells("text", "apple", "Banana") < 0);
  assert.ok(isEmptyCell(null) && isEmptyCell(undefined) && isEmptyCell(""));
  assert.ok(!isEmptyCell(0) && !isEmptyCell("x"));
});

/* ---- filter + provenance ---- */

test("rowMatchesFilter: case-insensitive across visible columns; empty query matches", () => {
  const cols = [{ key: "client", type: "text" }, { key: "total", type: "number" }];
  const data = { client: "Acme Inc", total: 1200 };
  assert.ok(rowMatchesFilter(data, cols, ""));
  assert.ok(rowMatchesFilter(data, cols, "acme"));
  assert.ok(rowMatchesFilter(data, cols, "1,200"));
  assert.ok(!rowMatchesFilter(data, cols, "bright"));
});

test("rowProvenance: human edit or manual creation = human; else agent", () => {
  assert.equal(rowProvenance({ humanEdited: true, createdBy: null }), "human");
  assert.equal(rowProvenance({ humanEdited: false, createdBy: "user-1" }), "human");
  assert.equal(rowProvenance({ humanEdited: false, createdBy: null }), "agent");
});

/* ---- snapshot diff ---- */

test("diffSnapshots: added / changed / removed by first-column identity", () => {
  const prev = [{ data: { name: "A", v: 1 } }, { data: { name: "B", v: 2 } }];
  const cur = [{ data: { name: "A", v: 9 } }, { data: { name: "C", v: 3 } }];
  const d = diffSnapshots(prev, cur, "name");
  assert.deepEqual([...d.added], [1]);
  assert.deepEqual([...d.changed], [0]);
  assert.equal(d.removed, 1);
  assert.equal(rowIdentity({ name: "  A " }, "name"), "a");
  assert.equal(rowIdentity({ name: "" }, "name"), null);
});

/* ---- keyboard nav ---- */

test("moveCell: arrows clamp, tab wraps rows both ways", () => {
  assert.deepEqual(moveCell({ r: 0, c: 0 }, "up", 5, 3), { r: 0, c: 0 });
  assert.deepEqual(moveCell({ r: 0, c: 2 }, "right", 5, 3), { r: 0, c: 2 });
  assert.deepEqual(moveCell({ r: 1, c: 1 }, "down", 5, 3), { r: 2, c: 1 });
  assert.deepEqual(moveCell({ r: 0, c: 2 }, "tab", 5, 3), { r: 1, c: 0 });
  assert.deepEqual(moveCell({ r: 1, c: 0 }, "shiftTab", 5, 3), { r: 0, c: 2 });
  // shiftTab at the very first cell: column wraps, row clamps at 0
  assert.deepEqual(moveCell({ r: 0, c: 0 }, "shiftTab", 5, 3), { r: 0, c: 2 });
});
