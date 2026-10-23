import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyEvent, eventProblem, type EventInput } from "./eventInput.ts";

const ok: EventInput = { ...emptyEvent, title: "Showcase", event_date: "2026-11-01" };

test("a complete event has no problem", () => {
  assert.equal(eventProblem(ok), null);
});

test("an event needs an importance", () => {
  assert.equal(eventProblem({ ...ok, importance: "" as EventInput["importance"] }), "Choose how important the event is.");
  assert.equal(eventProblem({ ...ok, importance: "huge" as EventInput["importance"] }), "Choose how important the event is.");
});
