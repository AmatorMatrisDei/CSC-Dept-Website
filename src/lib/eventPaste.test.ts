import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEventPaste } from "./eventPaste.ts";

const areas = [
  { id: "a1", name: "Computer Science" },
  { id: "a2", name: "Engineering" },
];

test("an AI answer in a code fence fills every field", () => {
  const answer = [
    "Here you go:",
    "```json",
    JSON.stringify({
      title: "Senior showcase",
      date: "2026-12-04",
      last_day: "",
      starts: "18:00",
      ends: "19:30",
      place: "Science Hall",
      link: "https://example.org/showcase",
      description: "Seniors present their projects.",
      area: "computer science",
    }),
    "```",
  ].join("\n");
  const result = parseEventPaste(answer, areas);
  assert.ok("input" in result);
  assert.deepEqual(result.input, {
    title: "Senior showcase",
    event_date: "2026-12-04",
    end_date: "",
    start_time: "18:00",
    end_time: "19:30",
    place: "Science Hall",
    link_url: "https://example.org/showcase",
    description: "Seniors present their projects.",
    sub_department_id: "a1",
  });
  assert.deepEqual(result.notes, []);
});

test("values in the wrong format are left empty and reported, not guessed", () => {
  const result = parseEventPaste('{"title":"Talk","date":"Dec 4","starts":"6pm","link":"javascript:alert(1)","area":"Music"}', areas);
  assert.ok("input" in result);
  assert.equal(result.input.title, "Talk");
  assert.equal(result.input.event_date, "");
  assert.equal(result.input.start_time, "");
  assert.equal(result.input.link_url, "");
  assert.equal(result.input.sub_department_id, "");
  assert.equal(result.notes.length, 4);
});

test("text without event details is refused with a reason", () => {
  assert.ok("problem" in parseEventPaste("Sure! What is the event?", areas));
  assert.ok("problem" in parseEventPaste("{not json}", areas));
  assert.ok("problem" in parseEventPaste("[1, 2]", areas));
});
