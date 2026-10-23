// The form side of events, kept apart from events.ts so it needs no database connection (and can be unit tested).

export type Importance = "major" | "regular" | "minor";

export const IMPORTANCE_LABELS: Record<Importance, string> = { major: "Major", regular: "Regular", minor: "Minor" };

// What the form edits. Empty strings stand for "not set" and become null when saved.
export type EventInput = {
  title: string;
  event_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  place: string;
  link_url: string;
  description: string;
  sub_department_id: string;
  importance: Importance;
};

export const emptyEvent: EventInput = {
  title: "",
  event_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  place: "",
  link_url: "",
  description: "",
  sub_department_id: "",
  importance: "regular",
};

// The problem with what was typed, in words for the editor, or null. The database checks the same things.
export function eventProblem(input: EventInput): string | null {
  if (!input.title.trim()) return "Give the event a title.";
  if (!(input.importance in IMPORTANCE_LABELS)) return "Choose how important the event is.";
  if (!input.event_date) return "Choose the date of the event.";
  if (input.end_date && input.end_date < input.event_date) return "The last day can't be before the first day.";
  if (input.end_time && !input.start_time) return "Add a start time, or clear the end time.";
  if (input.end_time && !(input.end_date > input.event_date) && input.end_time <= input.start_time) return "The end time must be after the start time.";
  if (input.link_url.trim() && !/^https?:\/\/\S{1,255}$/.test(input.link_url.trim())) {
    return "The link must start with https:// and contain no spaces.";
  }
  return null;
}
