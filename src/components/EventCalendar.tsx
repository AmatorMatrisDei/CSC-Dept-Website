import { useState, type ReactNode } from "react";
import { addMonths, eventsOn, formatEventTime, formatMonth, lastDay, monthOf, monthWeeks, splitEvents } from "@/lib/eventDates";
import type { EventView } from "@/lib/events";
import EventGear, { GEAR_TEETH } from "./EventGear";
import { secondaryButtonClass } from "./Form";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const dayName = (date: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));

// A month grid. Changing month slides the grid in and turns the gear by a tooth; pointing at or
// focusing a day with events previews them; choosing a day lists that day's events below the grid,
// using `renderCard`.
export default function EventCalendar({
  events,
  today,
  renderCard,
  startDate,
}: {
  events: EventView[];
  today: string;
  renderCard: (event: EventView, past: boolean) => ReactNode;
  startDate?: string; // the day to open on; defaults to today
}) {
  const [month, setMonth] = useState(monthOf(startDate ?? today));
  const [selected, setSelected] = useState(startDate ?? today);
  // Which way the last change of month went (for the slide), and how many teeth the gear has turned.
  const [heading, setHeading] = useState({ direction: 0, teeth: 0 });
  const weeks = monthWeeks(month);
  const chosen = eventsOn(events, selected);
  const next = splitEvents(events, today).upcoming[0];

  const go = (target: string, day?: string) => {
    if (day) setSelected(day);
    if (target === month) return;
    const direction = target > month ? 1 : -1;
    setHeading((h) => ({ direction, teeth: h.teeth + direction }));
    setMonth(target);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <EventGear
            className="size-8 shrink-0 transition-[rotate] duration-300 ease-out"
            style={{ rotate: `${heading.teeth * (360 / GEAR_TEETH)}deg` }}
          />
          <h2 className="text-2xl font-semibold">{formatMonth(month)}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => go(addMonths(month, -1))}>
            <span aria-hidden="true">←</span> Previous<span className="sr-only"> month</span>
          </button>
          <button type="button" className={secondaryButtonClass} onClick={() => go(monthOf(today), today)}>
            Today
          </button>
          <button type="button" className={secondaryButtonClass} onClick={() => go(addMonths(month, 1))}>
            Next<span className="sr-only"> month</span> <span aria-hidden="true">→</span>
          </button>
          {next && (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                const day = next.event_date > today ? next.event_date : today;
                go(monthOf(day), day);
              }}
            >
              Next event
            </button>
          )}
        </div>
      </div>

      <div key={month} className={heading.direction > 0 ? "month-next" : heading.direction < 0 ? "month-previous" : undefined}>
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="pb-1 text-sm font-medium text-muted">
                  <abbr title={d} className="no-underline">
                    {d.slice(0, 3)}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((date, column) => {
                  const here = eventsOn(events, date);
                  const inMonth = monthOf(date) === month;
                  const isSelected = date === selected;
                  const isToday = date === today;
                  return (
                    <td key={date} className="group relative border border-border p-0 align-top">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${dayName(date)}, ${here.length ? `${here.length} event${here.length > 1 ? "s" : ""}` : "no events"}`}
                        onClick={() => setSelected(date)}
                        className={`flex min-h-16 w-full flex-col items-stretch gap-1 p-1 text-left transition-colors hover:bg-accent/10 sm:min-h-24 ${
                          isSelected ? "bg-accent/15" : inMonth ? "bg-surface" : "bg-background text-muted"
                        }`}
                      >
                        <span className={`self-start px-1 text-sm ${isToday ? "rounded bg-accent font-semibold text-background" : ""}`}>
                          {Number(date.slice(8))}
                        </span>
                        {/* small screens: one dot per event; wider screens: the titles */}
                        <span className="flex flex-wrap gap-0.5 px-1 sm:hidden" aria-hidden="true">
                          {here.slice(0, 4).map((e) => (
                            <span key={e.id} className={`size-2 rounded-full ${lastDay(e) < today ? "bg-muted" : "bg-accent"}`} />
                          ))}
                        </span>
                        <span className="hidden flex-col gap-0.5 sm:flex" aria-hidden="true">
                          {here.slice(0, 2).map((e) => (
                            <span
                              key={e.id}
                              className={`truncate rounded px-1 text-xs ${lastDay(e) < today ? "bg-border text-muted" : "bg-accent/20"}`}
                            >
                              {e.title}
                            </span>
                          ))}
                          {here.length > 2 && <span className="px-1 text-xs text-muted">+{here.length - 2} more</span>}
                        </span>
                      </button>
                      {/* a preview on wide screens; the day's events are listed in full below the grid, so it is hidden from screen readers */}
                      {here.length > 0 && (
                        <div
                          aria-hidden="true"
                          className={`day-in pointer-events-none absolute top-full z-10 hidden w-56 flex-col gap-2 rounded-lg border border-highlight bg-surface p-3 text-left shadow-lg group-has-[:focus-visible]:flex group-hover:flex ${
                            column < 2 ? "left-0" : column > 4 ? "right-0" : "left-1/2 -translate-x-1/2"
                          }`}
                        >
                          {here.slice(0, 4).map((e) => (
                            <div key={e.id} className="flex flex-col text-sm">
                              <span className="font-medium">{e.title}</span>
                              <span className="text-xs text-muted">{[formatEventTime(e), e.place].filter(Boolean).join(" · ")}</span>
                            </div>
                          ))}
                          {here.length > 4 && <span className="text-xs text-muted">+{here.length - 4} more</span>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="chosen-day" className="flex flex-col gap-3">
        <h3 id="chosen-day" className="text-xl font-semibold">
          {dayName(selected)}
        </h3>
        <div key={selected} className="day-in">
          {chosen.length ? (
            <ul className="flex flex-col gap-4">{chosen.map((e) => renderCard(e, lastDay(e) < today))}</ul>
          ) : (
            <p className="text-muted">No events on this day.</p>
          )}
        </div>
      </section>
    </div>
  );
}
