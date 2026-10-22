import { lastDay, type EventTimes } from "./eventDates.ts";

// A calendar file (.ics) for one event, so a visitor can add it to Google, Apple or Outlook
// calendar. Times are university clock time, so timed events name the America/New_York zone and
// the file carries that zone's rules; all-day events have no time at all.

type IcsEvent = EventTimes & { id: string; title: string; place: string; link_url: string | null; description: string };

const ZONE = "America/New_York";

const TIME_ZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// "2026-11-04" and "18:00:00" as "20261104T180000".
const stamp = (date: string, time: string) => `${date.replaceAll("-", "")}T${time.slice(0, 5).replace(":", "")}00`;

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");

// Lines may not pass 75 bytes; a longer one continues on the next line after a space.
function fold(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > (lines.length ? 74 : 75)) {
      lines.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  lines.push(current);
  return lines.join("\r\n ");
}

export function eventIcs(event: IcsEvent, now = new Date()): string {
  const last = lastDay(event);
  const when = event.start_time
    ? [`DTSTART;TZID=${ZONE}:${stamp(event.event_date, event.start_time)}`, ...(event.end_time ? [`DTEND;TZID=${ZONE}:${stamp(last, event.end_time)}`] : [])]
    : [`DTSTART;VALUE=DATE:${event.event_date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${nextDay(last)}`];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Franciscan University Department of Engineering and Computing//Events//EN",
    "CALSCALE:GREGORIAN",
    ...(event.start_time ? TIME_ZONE : []),
    "BEGIN:VEVENT",
    `UID:${event.id}@csc-dept-website`,
    `DTSTAMP:${now.toISOString().replace(/[-:]|\.\d{3}/g, "")}`,
    ...when,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.place ? [`LOCATION:${escapeText(event.place)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.link_url ? [`URL:${event.link_url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Saves the event's calendar file in the browser.
export function downloadEventIcs(event: IcsEvent) {
  const file = new Blob([eventIcs(event)], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}
