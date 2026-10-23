import type { EventInput } from "./events";

// Fills the event form from text an AI wrote, so an editor can describe an event in plain words
// and paste the answer. Nothing here saves anything: the editor reads the filled form and presses Save.

// The instructions to give an AI together with the event's details.
export function eventPrompt(today: string, areas: string[]): string {
  return [
    "I will describe a department event. Reply with only one JSON object, nothing else, with these keys:",
    '"title": short name of the event',
    '"date": first day as YYYY-MM-DD',
    '"last_day": last day as YYYY-MM-DD, only if it lasts more than one day, otherwise ""',
    '"starts": start time in 24-hour HH:MM, or "" for an all-day event',
    '"ends": end time in 24-hour HH:MM, or ""',
    '"place": where it happens, or ""',
    '"link": a web address starting with https://, or ""',
    '"description": one or two plain sentences, no formatting',
    `"area": one of ${areas.map((a) => `"${a}"`).join(", ")}, or "" for the whole department`,
    `Today is ${today}. Use the next matching date if I don't give a year. Do not invent details I did not give.`,
    "",
    "The event:",
    "",
  ].join("\n");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// The form values from pasted text, or what is wrong with it. Finds the first {...} in the text,
// so a code fence or a sentence around the JSON does not matter. `notes` lists fields that were
// left empty because their value could not be used.
export function parseEventPaste(
  pasted: string,
  departments: { id: string; name: string }[],
): { input: EventInput; notes: string[] } | { problem: string } {
  const start = pasted.indexOf("{");
  const end = pasted.lastIndexOf("}");
  if (start < 0 || end < start) return { problem: "No event details found. Paste the whole answer, starting with {." };
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(pasted.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    data = parsed as Record<string, unknown>;
  } catch {
    return { problem: "That doesn't read as event details. Ask the AI to reply with only the JSON, then paste it again." };
  }

  const notes: string[] = [];
  const pick = (key: string, label: string, ok: (v: string) => boolean) => {
    const value = text(data[key]);
    if (!value) return "";
    if (ok(value)) return value;
    notes.push(`${label} ("${value.slice(0, 40)}") was not in the expected format, so it was left empty.`);
    return "";
  };

  const areaName = text(data.area).toLowerCase();
  const department = areaName ? departments.find((d) => d.name.toLowerCase() === areaName) : undefined;
  if (areaName && !department) notes.push(`Area "${text(data.area).slice(0, 40)}" is not one of the areas, so it was left as the whole department.`);

  return {
    input: {
      title: text(data.title).slice(0, 200),
      importance: "regular", // a paste never sets this; the form shows it for the editor to choose
      event_date: pick("date", "The date", (v) => DATE.test(v)),
      end_date: pick("last_day", "The last day", (v) => DATE.test(v)),
      start_time: pick("starts", "The start time", (v) => TIME.test(v)),
      end_time: pick("ends", "The end time", (v) => TIME.test(v)),
      place: text(data.place).slice(0, 200),
      link_url: pick("link", "The link", (v) => /^https?:\/\/\S{1,255}$/.test(v)),
      description: text(data.description).slice(0, 2000),
      sub_department_id: department?.id ?? "",
    },
    notes,
  };
}
