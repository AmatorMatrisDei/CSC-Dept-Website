import assert from "node:assert/strict";
import { test } from "node:test";
import { initials, nameWords, surname, tintFor } from "./placeholder.ts";

test("names lose titles and suffixes", () => {
  assert.deepEqual(nameWords("Rev. Dr. Stephen Frezza, PSEM"), ["Stephen", "Frezza"]);
  assert.deepEqual(nameWords("Prof. Jose Roberto Lopez"), ["Jose", "Roberto", "Lopez"]);
  assert.deepEqual(nameWords("Dr."), ["Dr."], "a name that is only a title keeps it");
});

test("initials use the first and last words", () => {
  assert.equal(initials("Dr. Tyler Brown"), "TB");
  assert.equal(initials("Rev. Dr. Stephen Frezza, PSEM"), "SF");
  assert.equal(initials("Campus Delivery Robot"), "CR");
  assert.equal(initials("Department Website"), "DW");
});

test("people sort by surname", () => {
  assert.equal(surname("Prof. Jose Roberto Lopez"), "Lopez");
  assert.equal(surname("Dr. Fernanda Psihas"), "Psihas");
});

test("a label always gets the same tint", () => {
  assert.equal(tintFor("High-Altitude Balloon"), tintFor("High-Altitude Balloon"));
  assert.match(tintFor("Study Group Finder"), /^color-mix\(in srgb, var\(--(accent|highlight)\) \d+%, var\(--surface\)\)$/);
});
