import { Fragment, useEffect, useState } from "react";
import EventBrowser from "@/components/EventBrowser";
import EventCalendar from "@/components/EventCalendar";
import EventCard from "@/components/EventCard";
import EventForm from "@/components/EventForm";
import NextEvent from "@/components/NextEvent";
import { buttonClass, secondaryButtonClass } from "@/components/Form";
import { splitEvents, universityToday } from "@/lib/eventDates";
import { emptyEvent, eventToInput, getEventDepartments, getEvents, type EventInput, type EventView } from "@/lib/events";
import { useEdit } from "@/lib/edit";
import { useAsync, useReloadable, useTitle } from "@/lib/hooks";
import { useScrollTurn } from "@/lib/motion";

// `id` null is a new event (a copy starts from an existing one without its dates). The form opens
// under the event it came from (`after`), or at the top of the page for a brand new event.
type Open = { id: string | null; after: string | null; initial: EventInput };

export default function Events() {
  useTitle("Events");
  const page = useScrollTurn<HTMLDivElement>();
  const { editing } = useEdit();
  const [events, reload] = useReloadable(getEvents, 0);
  const departments = useAsync(getEventDepartments);
  const [open, setOpen] = useState<Open | null>(null);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [calendarStart, setCalendarStart] = useState<string>();
  const today = universityToday();

  const all = events ?? [];
  const first = splitEvents(all, today).upcoming[0];

  useEffect(() => {
    if (open) document.getElementById("event-form")?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const form = (open: Open) => (
    <EventForm
      key={open.id ?? "new"}
      id={open.id}
      initial={open.initial}
      departments={departments ?? []}
      onDone={() => {
        setOpen(null);
        reload();
      }}
      onCancel={() => setOpen(null)}
    />
  );

  // An event's card, with its form under it while it is being copied, or in its place while it is being edited.
  const card = (e: EventView, isPast: boolean) => (
    <Fragment key={e.id}>
      {!(editing && open?.id === e.id) && (
        <EventCard
          event={e}
          today={today}
          past={isPast}
          onEdit={editing ? () => setOpen({ id: e.id, after: e.id, initial: eventToInput(e) }) : undefined}
          onCopy={editing ? () => setOpen({ id: null, after: e.id, initial: { ...eventToInput(e), event_date: "", end_date: "" } }) : undefined}
        />
      )}
      {editing && open?.after === e.id && (
        <li id="event-form" className="list-none sm:col-span-2 lg:col-span-3">
          {form(open)}
        </li>
      )}
    </Fragment>
  );

  return (
    <div ref={page} className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">Events</h1>
        <p className="max-w-2xl text-muted">Talks, showcases, deadlines and meetings from the department.</p>
        {editing && (!open || open.after !== null) && (
          <div>
            <button type="button" className={buttonClass} onClick={() => setOpen({ id: null, after: null, initial: emptyEvent })}>
              Add an event
            </button>
          </div>
        )}
      </header>

      {editing && open && open.after === null && <div id="event-form">{form(open)}</div>}

      {first && (
        <NextEvent
          key={`${first.id}${first.event_date}`}
          event={first}
          today={today}
          onShow={() => {
            setCalendarStart(first.event_date > today ? first.event_date : today);
            setView("calendar");
          }}
        />
      )}

      <div className="flex gap-2" role="group" aria-label="How to show events">
        {(["calendar", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            className={`${secondaryButtonClass} ${view === v ? "border-accent font-semibold" : ""}`}
            onClick={() => setView(v)}
          >
            {v === "calendar" ? "Calendar" : "List"}
          </button>
        ))}
      </div>

      {!events ? (
        <p className="text-muted">Loading events…</p>
      ) : view === "calendar" ? (
        <EventCalendar key={calendarStart} events={all} today={today} startDate={calendarStart} renderCard={card} />
      ) : (
        <EventBrowser events={all} today={today} areas={departments ?? []} renderCard={card} />
      )}
    </div>
  );
}
