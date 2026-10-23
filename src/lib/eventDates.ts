// Dates and times of department events. They are university clock time (see the events table), so
// nothing here converts between time zones: "6:00 pm" is shown as 6:00 pm to everyone.

export type EventTimes = {
  event_date: string; // "2026-11-03"
  end_date: string | null;
  start_time: string | null; // "18:00:00"; null means all day
  end_time: string | null;
};

// Today's date at the university, so an event stops being "upcoming" at the end of its day there.
export function universityToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

export const lastDay = (e: EventTimes) => e.end_date ?? e.event_date;

const byStart = (a: EventTimes, b: EventTimes) =>
  a.event_date.localeCompare(b.event_date) || (a.start_time ?? "").localeCompare(b.start_time ?? "");

// Upcoming events (including today's and any still running), soonest first; past events, newest first.
export function splitEvents<T extends EventTimes>(events: T[], today: string): { upcoming: T[]; past: T[] } {
  const upcoming = events.filter((e) => lastDay(e) >= today).sort(byStart);
  const past = events.filter((e) => lastDay(e) < today).sort((a, b) => byStart(b, a));
  return { upcoming, past };
}

const day = (date: string, withYear: boolean) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(`${date}T00:00:00Z`));

// "Tue, Nov 3" or "Tue, Nov 3 – Thu, Nov 5". The year is added for dates outside `today`'s year.
export function formatEventDays(e: EventTimes, today: string): string {
  const withYear = e.event_date.slice(0, 4) !== today.slice(0, 4) || lastDay(e).slice(0, 4) !== today.slice(0, 4);
  const first = day(e.event_date, withYear);
  return e.end_date && e.end_date !== e.event_date ? `${first} – ${day(e.end_date, withYear)}` : first;
}

const clock = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

// "6:00 pm", "6:00 pm – 7:30 pm", or "All day".
export function formatEventTime(e: EventTimes): string {
  if (!e.start_time) return "All day";
  return e.end_time ? `${clock(e.start_time)} – ${clock(e.end_time)}` : clock(e.start_time);
}


// The month ("2026-11") that holds a date, and the month a number of months away.
export const monthOf = (date: string) => date.slice(0, 7);

export function addMonths(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const formatMonth = (month: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));

// The weeks (Sunday first) that cover a month, as dates; days outside the month pad the first and last week.
export function monthWeeks(month: string): string[][] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const cursor = new Date(first);
  cursor.setUTCDate(1 - first.getUTCDay());
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (monthOf(cursor.toISOString().slice(0, 10)) === month);
  return weeks;
}

// The events that happen on a date (multi-day events count on every day they run), earliest first.
export const eventsOn = <T extends EventTimes>(events: T[], date: string): T[] =>
  events.filter((e) => e.event_date <= date && lastDay(e) >= date).sort(byStart);

// Whole days from one date to another (negative when `to` is earlier).
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
