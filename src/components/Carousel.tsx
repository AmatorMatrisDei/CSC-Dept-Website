"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Cover from "@/components/Cover";
import { peopleLine, StatusBadge } from "@/components/ProjectCard";
import type { ProjectView } from "@/lib/types";

const INTERVAL_MS = 6000;

// Where slide i sits relative to the current one, wrapping around: -2 -1 0 +1 +2 (for 5).
// This is what makes the loop infinite in both directions (index mod length).
function offsetOf(i: number, current: number, count: number): number {
  const half = Math.floor(count / 2);
  return ((((i - current + half) % count) + count) % count) - half;
}

// Featured-project carousel. Autoplay stops while the visitor hovers or focuses it, when they
// press Pause, and always when the OS asks for reduced motion.
export default function Carousel({ projects }: { projects: ProjectView[] }) {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  const count = projects.length;
  const playing = count > 1 && !userPaused && !hovering && !focused && !reducedMotion;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, count]);

  if (count === 0) return null;

  const go = (next: number) => setIndex((next + count) % count);
  const buttonClass =
    "inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border bg-background px-3 text-sm hover:bg-surface";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured projects"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface">
        {/* Slides are stacked and slid sideways; only the current one is in the layout flow. */}
        <div aria-live={playing ? "off" : "polite"} className="grid">
          {projects.map((project, i) => {
            const offset = offsetOf(i, index, count);
            const visible = Math.abs(offset) <= 1;
            return (
              <div
                key={project.slug}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                inert={offset !== 0}
                style={{
                  gridArea: "1 / 1",
                  transform: `translateX(${offset * 100}%)`,
                  visibility: visible ? "visible" : "hidden",
                }}
                className="grid w-full bg-background transition-[transform,visibility] duration-500 ease-out md:grid-cols-2"
              >
                <Cover src={project.thumbnail?.url ?? null} alt={project.thumbnail?.alt ?? ""} />
                <div className="flex flex-col justify-center gap-3 p-6">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={project.status} />
                    <span className="text-xs text-muted">{project.sub_department.name}</span>
                  </div>
                  <h2 className="text-2xl font-semibold">{project.title}</h2>
                  <p className="text-muted">{project.summary}</p>
                  {peopleLine(project) && <p className="text-sm text-muted">{peopleLine(project)}</p>}
                  <Link
                    href={`/projects/${project.slug}`}
                    className="inline-flex min-h-11 w-fit items-center rounded bg-accent px-4 text-accent-foreground hover:opacity-90"
                  >
                    View project
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button type="button" className={buttonClass} onClick={() => go(index - 1)}>
              <span aria-hidden="true">←</span>
              <span className="sr-only">Previous project</span>
            </button>
            <button type="button" className={buttonClass} onClick={() => go(index + 1)}>
              <span aria-hidden="true">→</span>
              <span className="sr-only">Next project</span>
            </button>
            {!reducedMotion && (
              <button
                type="button"
                className={buttonClass}
                aria-pressed={userPaused}
                onClick={() => setUserPaused((p) => !p)}
              >
                {userPaused ? "Play" : "Pause"}
              </button>
            )}
          </div>
          <div className="flex">
            {projects.map((project, i) => (
              <button
                key={project.slug}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${project.title}`}
                aria-current={i === index}
                className="inline-flex h-11 w-8 items-center justify-center"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full border border-accent ${i === index ? "bg-accent" : ""}`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
