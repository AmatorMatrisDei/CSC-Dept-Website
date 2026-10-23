import assert from "node:assert/strict";
import { test } from "node:test";
import { safeLink, splitLines, splitList } from "./list.ts";

test("comma lists are trimmed, without empty entries", () => {
  assert.deepEqual(splitList(" Python, React,, SQL , "), ["Python", "React", "SQL"]);
});

test("line lists keep commas inside an entry", () => {
  assert.deepEqual(splitLines("ACM, treasurer\n\n  Robotics club  \n"), ["ACM, treasurer", "Robotics club"]);
});

test("list links are web addresses or paths on this site, never another host", () => {
  for (const ok of ["https://example.org/a?b=1", "http://example.org", "/projects", "/"]) assert.equal(safeLink(ok), true, ok);
  for (const bad of ["//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example", "/a b", ""]) assert.equal(safeLink(bad), false, bad);
});
