// Rules every version of pickCarousel must keep, whatever the algorithm. Run with
// `npm run test:carousel`. The Algorithms team adds its edge-case and statistical tests
// (guide 4.3) alongside these.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Candidate, pickCarousel } from "./carousel-pick.ts";

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    project_id: id,
    sub_department_id: "computer-science",
    priority: 1,
    is_pinned: false,
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const pool = Array.from({ length: 15 }, (_, i) =>
  candidate(`project-${i + 1}`, {
    sub_department_id: ["cs", "me", "swe", "bai"][i % 4],
    priority: (i % 10) + 1,
    is_pinned: i === 3,
  }));

test("picks 5 to 7 projects from a full pool, without repeats", () => {
  const picked = pickCarousel(pool, "2026-10-14:0");
  assert.ok(picked.length >= 5 && picked.length <= 7, `picked ${picked.length}`);
  assert.equal(new Set(picked).size, picked.length);
});

test("only picks projects from the pool", () => {
  const ids = new Set(pool.map((c) => c.project_id));
  for (const id of pickCarousel(pool, "2026-10-14:0")) {
    assert.ok(ids.has(id), `${id} is not a candidate`);
  }
});

test("always includes pinned projects", () => {
  assert.ok(pickCarousel(pool, "2026-10-14:0").includes("project-4"));
});

test("the same seed gives the same pick", () => {
  assert.deepEqual(pickCarousel(pool, "2026-10-14:2"), pickCarousel(pool, "2026-10-14:2"));
});

test("shows the whole pool when it has fewer than 5 projects", () => {
  const small = pool.slice(0, 3);
  assert.deepEqual(new Set(pickCarousel(small, "2026-10-14:0")), new Set(small.map((c) => c.project_id)));
});

test("an empty pool gives an empty pick", () => {
  assert.deepEqual(pickCarousel([], "2026-10-14:0"), []);
});
