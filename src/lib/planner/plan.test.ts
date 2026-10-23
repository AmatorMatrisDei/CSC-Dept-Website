import assert from "node:assert/strict";
import { test } from "node:test";
import { addCourse, checkRequirements, moveItem, semesterLabel, suggestedPlan, warnings, type Start } from "./plan.ts";
import type { Course, Degree, Plan } from "./types.ts";

function course(id: string, code: string, extra: Partial<Course> = {}): Course {
  return {
    catalog_year: "2025-2026", id, code, title: code, credits: 3, credits_max: null, prerequisite_groups: [], corequisites: [],
    offered: [], offered_years: {}, prerequisite_text: null, corequisite_text: null, offered_text: null, catalog_url: null,
    description: null, ...extra,
  };
}

// A plan from lists of course ids, one list per semester.
const plan = (...semesters: string[][]): Plan =>
  semesters.map((ids, s) => ids.map((id, i) => ({ key: `${s}-${i}`, course: id, slot: null, credits: 0 })));

const fall2025: Start = { firstFall: 2025, spring: false };
const spring2025: Start = { firstFall: 2024, spring: true };

test("a suggested plan keeps courses and core slots, and a spring start opens with a free spring", () => {
  const degree = {
    semesters: [
      { year: 1, term: "Fall", note: null, entries: [{ course: "csc141" }, { slot: "Philosophy Core", credits: 3 }] },
      { year: 1, term: "Spring", note: null, entries: [{ course: "csc142" }] },
    ],
  } as unknown as Degree;
  const fromFall = suggestedPlan(degree, fall2025);
  assert.deepEqual(fromFall.map((s) => s.map((i) => i.course ?? i.slot)), [["csc141", "Philosophy Core"], ["csc142"]]);
  assert.equal(fromFall[0][1].credits, 3);
  assert.deepEqual(suggestedPlan(degree, spring2025).map((s) => s.length), [0, 2, 1]);
});

test("semester labels follow the calendar of the start", () => {
  assert.equal(semesterLabel(0, fall2025), "Year 1, Fall 2025");
  assert.equal(semesterLabel(1, fall2025), "Year 1, Spring 2026");
  assert.equal(semesterLabel(0, spring2025), "Year 1, Spring 2025");
  assert.equal(semesterLabel(1, spring2025), "Year 2, Fall 2025");
  assert.equal(semesterLabel(2), "Year 2, Fall");
});

test("moving and adding courses", () => {
  const start = plan(["csc141", "mth151"], ["csc142"]);
  assert.deepEqual(moveItem(start, "0-1", 1).map((s) => s.map((i) => i.course)), [["csc141"], ["csc142", "mth151"]]);
  assert.equal(moveItem(start, "missing", 1), start);
  assert.equal(addCourse(start, "csc141", 1), start, "a course already in the plan isn't added twice");
  assert.deepEqual(addCourse(start, "csc250", 1)[1].map((i) => i.course), ["csc142", "csc250"]);
});

test("each course counts toward one requirement, and required courses claim theirs first", () => {
  const elective = { label: "Security elective", options: [["csc350"], ["csc360"]] };
  const requirements = [elective, elective, { options: [["csc350"]] }, { label: "Philosophy core" }];
  const statuses = checkRequirements(requirements, new Set(["csc350", "csc360"]), new Set());
  assert.deepEqual(statuses.map((s) => [s.status, s.courses]), [
    ["planned", ["csc360"]],
    ["missing", []],
    ["planned", ["csc350"]],
    ["open", []],
  ]);
  const done = checkRequirements([elective], new Set(), new Set(["csc360"]));
  assert.equal(done[0].status, "completed");
});

test("a requirement option needs all of its courses", () => {
  const chemistry = [{ options: [["chm111", "chm116"], ["chm141"]] }];
  assert.equal(checkRequirements(chemistry, new Set(["chm111"]), new Set())[0].status, "missing");
  assert.deepEqual(checkRequirements(chemistry, new Set(["chm141"]), new Set())[0].courses, ["chm141"]);
});

test("warnings: prerequisites, terms, odd and even years, corequisites", () => {
  const courses = new Map(
    [
      course("csc141", "CSC 141", { offered: ["fall"] }),
      course("csc142", "CSC 142", { prerequisite_groups: [{ courses: ["csc141"] }] }),
      course("mth220", "MTH 220", { prerequisite_groups: [{ courses: ["mth150"], other: "placement" }] }),
      course("mth151", "MTH 151"),
      course("egr101", "EGR 101", { prerequisite_groups: [{ courses: ["mth151"], concurrent: true }] }),
      course("phy201", "PHY 201", { corequisites: ["phy201l"] }),
      course("phy201l", "PHY 201L"),
      course("csc380", "CSC 380", { offered_years: { fall: "odd" }, offered_text: "Odd falls" }),
    ].map((c) => [c.id, c]),
  );
  const schedule = plan(["csc142", "mth220", "egr101", "mth151"], ["csc141", "phy201"], ["csc380"]);
  assert.deepEqual(warnings(schedule, courses, new Set(), fall2025), [
    { courseId: "csc142", message: "Needs CSC 141 first" },
    { courseId: "csc141", message: "Only offered in Fall" },
    { courseId: "phy201", message: "Take with PHY 201L" },
    { courseId: "csc380", message: "Only offered in odd years (Odd falls)" },
  ]);
  const withCompleted = warnings(schedule, courses, new Set(["csc141"]), fall2025);
  assert.ok(!withCompleted.some((w) => w.courseId === "csc142"), "a completed prerequisite counts");
});
