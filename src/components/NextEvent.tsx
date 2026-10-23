import { daysBetween, formatEventDays, formatEventTime } from "@/lib/eventDates";
import type { EventView } from "@/lib/events";
import { useAnime } from "@/lib/motion";
import EventGear, { GEAR_TEETH } from "./EventGear";
import { secondaryButtonClass } from "./Form";

const TOOTH = 360 / GEAR_TEETH;
const daysText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

// The soonest upcoming event with a countdown. The gear turns one tooth for each day to go (up to
// a full turn) while the number counts up, and ticks one tooth when the pointer enters the card.
// Parents should give it a `key` that changes with the event, since the opening motion plays once.
export default function NextEvent({ event, today, onShow }: { event: EventView; today: string; onShow: () => void }) {
  const days = daysBetween(today, event.event_date);
  const running = days <= 0;
  const heading = running ? (event.event_date === today ? "Today" : "Happening now") : null;

  const ref = useAnime<HTMLDivElement>((anime, { root, scope, reduceMotion }) => {
    const gears = [...root.querySelectorAll<SVGElement>("[data-gear]")];
    const count = root.querySelector<HTMLElement>("[data-count]");
    if (reduceMotion || !gears.length) return;

    scope.add("tick", () => {
      anime.animate(gears, { rotate: `+=${TOOTH}`, duration: 300, ease: "outCubic" });
    });
    const tick = () => scope.methods.tick();
    root.addEventListener("pointerenter", tick);

    if (count) {
      const target = Number(count.dataset.value);
      const counter = { value: 0 };
      anime.animate(counter, {
        value: target,
        duration: 1000,
        ease: "outCubic",
        onUpdate: () => {
          count.textContent = daysText(Math.round(counter.value));
        },
        onComplete: () => {
          count.textContent = daysText(target);
        },
      });
      anime.animate(gears, { rotate: Math.min(target, GEAR_TEETH) * TOOTH, duration: 1000, ease: "outCubic" });
    }
    return () => {
      root.removeEventListener("pointerenter", tick);
      if (count) count.textContent = daysText(Number(count.dataset.value));
    };
  });

  return (
    <div ref={ref} className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <EventGear className="size-16 shrink-0 sm:size-24" style={{ rotate: "calc(var(--turn, 0) * 0.4deg)" }} />
      <div className="flex w-full min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">Next up</p>
        <p className="text-lg font-semibold">{event.title}</p>
        <p className="text-sm text-muted">
          {[formatEventDays(event, today), formatEventTime(event), event.place].filter(Boolean).join(" · ")}
        </p>
        <p className="text-accent">
          {heading ?? (
            <>
              <span className="text-2xl font-semibold" data-count data-value={days}>
                {daysText(days)}
              </span>{" "}
              to go
            </>
          )}
        </p>
      </div>
      <button type="button" className={secondaryButtonClass} onClick={onShow}>
        Show in calendar
      </button>
    </div>
  );
}
