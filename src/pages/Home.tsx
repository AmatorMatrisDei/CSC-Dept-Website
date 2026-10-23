import { Link } from "react-router";
import Carousel from "@/components/Carousel";
import DepartmentMark from "@/components/DepartmentMark";
import EventCard from "@/components/EventCard";
import HighlightCard from "@/components/HighlightCard";
import SiteText from "@/components/SiteText";
import { getCarouselProjects } from "@/lib/content";
import { dailyPick } from "@/lib/dailyPick";
import { splitEvents, universityToday } from "@/lib/eventDates";
import { getEventsForHome } from "@/lib/events";
import { getHomeHighlights } from "@/lib/highlights";
import { useEdit } from "@/lib/edit";
import { useAsync, useTitle } from "@/lib/hooks";
import { playHomeIntro } from "@/lib/homeIntro";
import { useAnime, usePreloadMotion } from "@/lib/motion";

// How many events the home page shows; the events page has all of them. The banner holds the
// major ones (or, when none is coming, simply the next ones); the list below it holds the rest.
const BANNER_EVENTS = 2;
const LIST_EVENTS = 3;
// How many students and alumni the home page shows, of each.
const PEOPLE_EACH = 2;

export default function Home() {
  useTitle(undefined);
  usePreloadMotion();
  // The opening animation; see lib/homeIntro.ts.
  const page = useAnime<HTMLDivElement>(playHomeIntro, (root) => {
    root.dataset.introDone = "";
  });
  const featured = useAsync(getCarouselProjects);
  const events = useAsync(getEventsForHome);
  const highlights = useAsync(getHomeHighlights);
  const { editing } = useEdit();
  const today = universityToday();
  const upcoming = events ? splitEvents(events, today).upcoming : [];
  const major = upcoming.filter((e) => e.importance === "major");
  const banner = (major.length ? major : upcoming.filter((e) => e.importance === "regular")).slice(0, BANNER_EVENTS);
  const soon = upcoming.filter((e) => e.importance !== "minor" && !banner.includes(e)).slice(0, LIST_EVENTS);
  // A different few each day, students and alumni taking turns so neither runs together.
  const pool = highlights ?? [];
  const students = dailyPick(pool.filter((h) => h.kind === "student"), today, PEOPLE_EACH, (h) => h.ref);
  const alumni = dailyPick(pool.filter((h) => h.kind === "alumni"), today, PEOPLE_EACH, (h) => h.ref);
  const people = Array.from({ length: PEOPLE_EACH }, (_, i) => [students[i], alumni[i]]).flat().filter((h) => h !== undefined);

  return (
    <div ref={page} data-intro="" className="flex flex-col gap-12">
      <section className="grid items-center gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-3">
          <div data-intro-part="title">
            <SiteText id="home.title" as="h1" fallback="Engineering & Computing" className="text-3xl font-semibold sm:text-4xl" />
          </div>
          <div data-intro-part="text" className="flex flex-col gap-3">
            <SiteText
              id="home.intro"
              fallback="See what our students and faculty are building, from capstones and class projects to internships and partner work."
              className="max-w-2xl text-muted"
            />
            <div>
              <Link
                to="/projects"
                className="inline-flex min-h-11 items-center rounded bg-accent px-4 text-accent-foreground"
              >
                Browse all projects
              </Link>
            </div>
          </div>
        </div>
        <div data-intro-part="mark" className="max-w-64 md:max-w-none">
          <DepartmentMark className="h-auto w-full" />
        </div>
      </section>

      <section data-intro-part="featured" aria-label="Featured projects" className="flex flex-col gap-4">
        <SiteText id="home.featured" as="h2" fallback="Featured projects" className="text-2xl font-semibold" />
        {featured ? <Carousel projects={featured} /> : <p className="text-muted">Loading…</p>}
      </section>

      {banner.length > 0 && (
        <section aria-labelledby="home-coming-up" className="flex flex-col gap-4">
          <h2 id="home-coming-up" className="text-2xl font-semibold">
            Coming up
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {banner.map((e) => (
              <EventCard key={e.id} event={e} today={today} banner />
            ))}
          </ul>
        </section>
      )}

      {(people.length > 0 || (editing && highlights)) && (
        <section aria-labelledby="home-people" className="flex flex-col gap-4">
          <h2 id="home-people" className="text-2xl font-semibold">
            Our students and alumni
          </h2>
          {people.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {people.map((h) => (
                <HighlightCard key={`${h.kind}:${h.ref}`} item={h} />
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nobody is highlighted yet. Turn on Highlight when editing a student or alumni page.</p>
          )}
        </section>
      )}

      {events && (soon.length > 0 || editing) && (
        <section aria-labelledby="home-events" className="flex flex-col gap-4">
          <h2 id="home-events" className="text-2xl font-semibold">
            More events
          </h2>
          {soon.length ? (
            <ul className="grid gap-4 md:grid-cols-3">
              {soon.map((e) => (
                <EventCard key={e.id} event={e} today={today} />
              ))}
            </ul>
          ) : (
            <p className="text-muted">No more upcoming events. Add one on the events page.</p>
          )}
        </section>
      )}

      {(banner.length > 0 || soon.length > 0 || editing) && (
        <div>
          <Link to="/events" className="inline-flex min-h-11 items-center underline">
            All events
          </Link>
        </div>
      )}
    </div>
  );
}
