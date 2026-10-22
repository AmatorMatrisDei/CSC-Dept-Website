import type { EventTimes } from "./eventDates";
import { supabase } from "./supabase";
import type { SubDepartment } from "./types";

// Department events: everyone reads them, and editors add, change and delete them (the database
// decides who may, by row level security). Unlike page text and project details, an event has no
// draft step: a save is live at once, so that adding one takes under a minute.

export type EventView = EventTimes & {
  id: string;
  title: string;
  place: string;
  link_url: string | null;
  description: string;
  department: (SubDepartment & { id: string }) | null;
};

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
};

type EventRow = EventTimes & {
  id: string;
  title: string;
  place: string;
  link_url: string | null;
  description: string;
  sub_departments: (SubDepartment & { id: string }) | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getEvents(version = 0): Promise<EventView[]> {
  void version; // changes after an edit, so the list loads again
  const { data, error } = await client()
    .from("events")
    .select("id, title, event_date, end_date, start_time, end_time, place, link_url, description, sub_departments(id, slug, name)")
    .order("event_date")
    .order("start_time", { nullsFirst: true })
    .returns<EventRow[]>();
  if (error) throw error;
  return data.map(({ sub_departments, ...event }) => ({ ...event, department: sub_departments }));
}

export async function getEventDepartments(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await client().from("sub_departments").select("id, name").order("sort_order");
  if (error) throw error;
  return data;
}

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
};

export const eventToInput = (e: EventView): EventInput => ({
  title: e.title,
  event_date: e.event_date,
  end_date: e.end_date ?? "",
  start_time: e.start_time?.slice(0, 5) ?? "",
  end_time: e.end_time?.slice(0, 5) ?? "",
  place: e.place,
  link_url: e.link_url ?? "",
  description: e.description,
  sub_department_id: e.department?.id ?? "",
});

// The problem with what was typed, in words for the editor, or null. The database checks the same things.
export function eventProblem(input: EventInput): string | null {
  if (!input.title.trim()) return "Give the event a title.";
  if (!input.event_date) return "Choose the date of the event.";
  if (input.end_date && input.end_date < input.event_date) return "The last day can't be before the first day.";
  if (input.end_time && !input.start_time) return "Add a start time, or clear the end time.";
  if (input.link_url.trim() && !/^https?:\/\/\S{1,255}$/.test(input.link_url.trim())) {
    return "The link must start with https:// and contain no spaces.";
  }
  return null;
}

const toColumns = (input: EventInput) => ({
  title: input.title,
  event_date: input.event_date,
  end_date: input.end_date || null,
  start_time: input.start_time || null,
  end_time: input.end_time || null,
  place: input.place,
  link_url: input.link_url.trim() || null,
  description: input.description,
  sub_department_id: input.sub_department_id || null,
});

export async function saveEvent(id: string | null, input: EventInput): Promise<void> {
  const columns = toColumns(input);
  if (id) {
    const { data, error } = await client().from("events").update(columns).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("You may not have permission to change events, or this one was already removed.");
  } else {
    const { error } = await client().from("events").insert(columns);
    if (error) throw error;
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const { data, error } = await client().from("events").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You may not have permission to delete events, or it was already removed.");
}
