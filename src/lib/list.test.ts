import assert from "node:assert/strict";
import { test } from "node:test";
import { splitLines, splitList } from "./list.ts";

test("comma lists are trimmed, without empty entries", () => {
  assert.deepEqual(splitList(" Python, React,, SQL , "), ["Python", "React", "SQL"]);
});

test("line lists keep commas inside an entry", () => {
  assert.deepEqual(splitLines("ACM, treasurer\n\n  Robotics club  \n"), ["ACM, treasurer", "Robotics club"]);
});
