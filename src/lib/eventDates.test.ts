import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, daysBetween, eventsOn, formatEventDays, formatEventTime, monthWeeks, splitEvents, universityToday } from "./eventDates.ts";

const event = (event_date: string, extra: object = {}) => ({ event_date, end_date: null, start_time: null, end_time: null, ...extra });

test("today is the date at the university, whatever the visitor's own clock", () => {
  assert.equal(universityToday(new Date("2026-11-04T03:30:00Z")), "2026-11-03"); // 10:30 pm the evening before
  assert.equal(universityToday(new Date("2026-11-04T12:00:00Z")), "2026-11-04");
});

test("events split into upcoming (soonest first) and past (newest first); today and running events are upcoming", () => {
  const all = [
    event("2026-10-01"),
    event("2026-11-20"),
    event("2026-11-03", { start_time: "18:00:00" }),
    event("2026-11-03", { start_time: "09:00:00" }),
    event("2026-11-01", { end_date: "2026-11-05" }),
    event("2026-09-15"),
  ];
  const { upcoming, past } = splitEvents(all, "2026-11-03");
  assert.deepEqual(upcoming.map((e) => `${e.event_date}${e.start_time ?? ""}`), ["2026-11-01", "2026-11-0309:00:00", "2026-11-0318:00:00", "2026-11-20"]);
  assert.deepEqual(past.map((e) => e.event_date), ["2026-10-01", "2026-09-15"]);
});

test("times read as clock times, or all day", () => {
  assert.equal(formatEventTime(event("2026-11-03")), "All day");
  assert.equal(formatEventTime(event("2026-11-03", { start_time: "18:00:00" })), "6:00 pm");
  assert.equal(formatEventTime(event("2026-11-03", { start_time: "00:05:00", end_time: "12:30:00" })), "12:05 am – 12:30 pm");
});

test("days read as one day or a range, with the year only when it is not this year", () => {
  assert.equal(formatEventDays(event("2026-11-03"), "2026-10-21"), "Tue, Nov 3");
  assert.equal(formatEventDays(event("2026-11-03", { end_date: "2026-11-05" }), "2026-10-21"), "Tue, Nov 3 – Thu, Nov 5");
  assert.equal(formatEventDays(event("2027-01-12"), "2026-10-21"), "Tue, Jan 12, 2027");
});

test("a month is whole weeks starting on Sunday, and months roll over the year", () => {
  const weeks = monthWeeks("2026-11"); // Nov 1, 2026 is a Sunday
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0][0], "2026-11-01");
  assert.equal(weeks[4][6], "2026-12-05");
  assert.equal(monthWeeks("2026-10")[0][0], "2026-09-27");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("a multi-day event is listed on each day it runs", () => {
  const all = [event("2026-11-14", { end_date: "2026-11-15" }), event("2026-11-15"), event("2026-11-16")];
  assert.equal(eventsOn(all, "2026-11-14").length, 1);
  assert.equal(eventsOn(all, "2026-11-15").length, 2);
  assert.equal(eventsOn(all, "2026-11-17").length, 0);
});

test("days between dates are whole days, across months and daylight saving", () => {
  assert.equal(daysBetween("2026-10-21", "2026-10-21"), 0);
  assert.equal(daysBetween("2026-10-21", "2026-11-14"), 24);
  assert.equal(daysBetween("2026-11-01", "2026-10-31"), -1);
  assert.equal(daysBetween("2026-03-01", "2026-04-01"), 31);
});
