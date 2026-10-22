import { useState, type ReactNode } from "react";
import { fieldClass } from "@/components/Form";
import RevealList from "@/components/RevealList";
import { lastDay, splitEvents } from "@/lib/eventDates";
import type { EventView } from "@/lib/events";

const gridClass = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

function Select({
  label,
  value,
  onChange,
  options,
  all = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  all?: string | null;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        {all !== null && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Every event as cards in a grid, filtered like the project browser: by words in the title, place
// or description, by whether it is coming up or past, by what it is for (`areas`, every department) and by year. Upcoming ones are soonest first and past ones newest first; when
// both show, the past ones sit under their own heading.
export default function EventBrowser({
  events,
  today,
  areas,
  renderCard,
}: {
  events: EventView[];
  today: string;
  areas: { id: string; name: string }[];
  renderCard: (event: EventView, past: boolean) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [when, setWhen] = useState("upcoming");
  const [area, setArea] = useState("");
  const [year, setYear] = useState("");

  const years = [...new Set([today.slice(0, 4), ...events.map((e) => e.event_date.slice(0, 4))])].sort().reverse();
  const needle = query.trim().toLowerCase();
  const visible = events.filter((e) => {
    if (when === "upcoming" && lastDay(e) < today) return false;
    if (when === "past" && lastDay(e) >= today) return false;
    if (area && e.department?.id !== area) return false;
    if (year && e.event_date.slice(0, 4) !== year) return false;
    return !needle || [e.title, e.place, e.description].some((text) => text.toLowerCase().includes(needle));
  });
  const { upcoming, past } = splitEvents(visible, today);

  return (
    <div className="flex flex-col gap-6">
      <form role="search" aria-label="Filter events" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1 text-sm">
          Search events
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, place or details" className={fieldClass} />
        </label>
        <Select
          label="When"
          value={when}
          onChange={setWhen}
          all={null}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past events" },
            { value: "", label: "Upcoming and past" },
          ]}
        />
        {areas.length > 0 && <Select label="Related to" value={area} onChange={setArea} options={areas.map((d) => ({ value: d.id, label: d.name }))} />}
        <Select label="Year" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} />
      </form>

      <p className="text-sm text-muted" role="status">
        Showing {visible.length} of {events.length} events
      </p>

      {visible.length === 0 && <p className="text-muted">No events match those filters.</p>}
      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-events" className="flex flex-col gap-4">
          <h2 id="upcoming-events" className="text-2xl font-semibold">
            Upcoming events
          </h2>
          <RevealList className={gridClass}>{upcoming.map((e) => renderCard(e, false))}</RevealList>
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="past-events" className="flex flex-col gap-4">
          <h2 id="past-events" className="text-2xl font-semibold text-muted">
            Past events
          </h2>
          <RevealList className={gridClass}>{past.map((e) => renderCard(e, true))}</RevealList>
        </section>
      )}
    </div>
  );
}
