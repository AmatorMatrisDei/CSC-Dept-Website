import { formatEventDays, formatEventTime } from "@/lib/eventDates";
import { downloadEventIcs } from "@/lib/eventIcs";
import type { EventView } from "@/lib/events";
import { secondaryButtonClass } from "./Form";

// One event in a list. Past events are muted and say so in words, so it never depends on color
// alone. Upcoming events can be saved to a visitor's own calendar. `onEdit` and `onCopy` are given only to editors.
// `banner` is the larger, accent-bordered look the home page gives its biggest events.
export default function EventCard({
  event,
  today,
  past = false,
  banner = false,
  onEdit,
  onCopy,
}: {
  event: EventView;
  today: string;
  past?: boolean;
  banner?: boolean;
  onEdit?: () => void;
  onCopy?: () => void;
}) {
  const status = past ? "Past event" : event.event_date > today ? "Upcoming" : event.event_date === today ? "Today" : "Happening now";
  const details = [formatEventTime(event), event.place].filter(Boolean).join(" · ");
  return (
    <li
      className={`lift flex h-full flex-col gap-2 wrap-anywhere rounded-lg p-4 ${
        banner ? "border-2 border-accent p-6" : "border border-border"
      } ${past ? "bg-background text-muted" : "bg-surface"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">{status}</span>
        {event.department && <span className="text-xs text-muted">{event.department.name}</span>}
      </div>
      <p className={`font-medium ${banner ? "text-xl font-semibold" : ""} ${past ? "" : "text-accent"}`}>
        <time dateTime={event.event_date}>{formatEventDays(event, today)}</time>
      </p>
      <h3 className={banner ? "text-2xl font-semibold" : "text-lg font-semibold"}>{event.title}</h3>
      <p className={banner ? "" : "text-sm"}>{details}</p>
      {event.description && <p className="whitespace-pre-line">{event.description}</p>}
      {(event.link_url || onEdit || !past) && (
        <div className="flex flex-wrap items-center gap-2">
          {event.link_url && (
            <a href={event.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">
              More details<span className="sr-only"> about {event.title} (opens in a new tab)</span>
            </a>
          )}
          {!past && (
            <button type="button" className={secondaryButtonClass} onClick={() => downloadEventIcs(event)}>
              Add to calendar<span className="sr-only"> {event.title}</span>
            </button>
          )}
          {onEdit && (
            <button type="button" className={secondaryButtonClass} onClick={onEdit}>
              Edit<span className="sr-only"> {event.title}</span>
            </button>
          )}
          {onCopy && (
            <button type="button" className={secondaryButtonClass} onClick={onCopy}>
              Copy<span className="sr-only"> {event.title} as a new event</span>
            </button>
          )}
        </div>
      )}
    </li>
  );
}
