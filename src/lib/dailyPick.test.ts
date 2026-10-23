import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyPick } from "./dailyPick.ts";

const pool = ["a", "b", "c", "d", "e", "f", "g", "h"];
const id = (x: string) => x;

test("the same day gives the same few, whatever order the pool is in", () => {
  const first = dailyPick(pool, "2026-10-22", 3, id);
  assert.deepEqual(dailyPick([...pool].reverse(), "2026-10-22", 3, id), first);
  assert.equal(first.length, 3);
});

test("the few change from day to day", () => {
  const days = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((d) => dailyPick(pool, d, 3, id).join());
  assert.ok(new Set(days).size > 1);
});

test("a pool smaller than the count returns everything", () => {
  assert.deepEqual(dailyPick(["a", "b"], "2026-10-22", 5, id).sort(), ["a", "b"]);
  assert.deepEqual(dailyPick([], "2026-10-22", 5, id), []);
});
