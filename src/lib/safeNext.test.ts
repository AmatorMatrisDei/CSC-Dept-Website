import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNext } from "./safeNext.ts";

test("keeps paths on this site", () => {
  assert.equal(safeNext("/account/profile"), "/account/profile");
  assert.equal(safeNext("/projects?status=Active#search"), "/projects?status=Active#search");
});

test("sends anything else to the account page", () => {
  for (const next of [null, "", "account", "https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)"]) {
    assert.equal(safeNext(next), "/account", String(next));
  }
});
