import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, paragraphs, projectYears } from "./format.ts";

test("paragraphs split on blank lines and drop empty ones", () => {
  assert.deepEqual(paragraphs("First line\nstill first.\n\n\n  Second.  \n\n"), ["First line\nstill first.", "Second."]);
  assert.deepEqual(paragraphs(""), []);
});

test("project years are distinct, newest first, from the start date", () => {
  const years = projectYears([{ date_started: "2025-01-10" }, { date_started: null }, { date_started: "2026-09-01" }, { date_started: "2025-08-30" }]);
  assert.deepEqual(years, [2026, 2025]);
});

test("dates read the same in every time zone", () => {
  assert.equal(formatDate("2026-09-01"), "September 1, 2026");
  assert.equal(formatDate("2026-10-15T23:30:00Z"), "October 15, 2026");
});
