import assert from "node:assert/strict";
import { test } from "node:test";
import { eventIcs } from "./eventIcs.ts";

const base = {
  id: "abc",
  title: "Senior showcase",
  event_date: "2026-12-04",
  end_date: null,
  start_time: "18:00:00",
  end_time: "19:30:00",
  place: "Science Hall",
  link_url: "https://example.org/showcase",
  description: "Seniors present; bring friends, snacks.\nDoors at 5:30.",
};
const now = new Date("2026-10-21T12:00:00Z");

test("a timed event names the university time zone and ends on its end time", () => {
  const ics = eventIcs(base, now);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;TZID=America\/New_York:20261204T180000\r\n/);
  assert.match(ics, /DTEND;TZID=America\/New_York:20261204T193000\r\n/);
  assert.match(ics, /DTSTAMP:20261021T120000Z\r\n/);
  assert.match(ics, /BEGIN:VTIMEZONE/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test("text is escaped and the link and place are included", () => {
  const ics = eventIcs(base, now);
  assert.ok(ics.includes("DESCRIPTION:Seniors present\\; bring friends\\, snacks.\\nDoors at 5:30."));
  assert.ok(ics.includes("LOCATION:Science Hall"));
  assert.ok(ics.includes("URL:https://example.org/showcase"));
});

test("a timed multi-day event with no end time runs to the end of its last day", () => {
  const ics = eventIcs({ ...base, end_date: "2026-12-06", end_time: null }, now);
  assert.ok(ics.includes("DTEND;TZID=America/New_York:20261206T235900\r\n"));
});

test("an all-day, multi-day event ends the day after its last day", () => {
  const ics = eventIcs({ ...base, end_date: "2026-12-06", start_time: null, end_time: null }, now);
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261204\r\n"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20261207\r\n"));
  assert.ok(!ics.includes("VTIMEZONE"));
});

test("long lines are folded at 75 bytes", () => {
  const ics = eventIcs({ ...base, description: "é".repeat(100) }, now);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
});
