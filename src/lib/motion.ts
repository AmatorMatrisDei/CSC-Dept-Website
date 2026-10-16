import type { Scope } from "animejs";
import { useEffect, useRef } from "react";

// Scripted motion with anime.js. The library loads the first time a page asks for it, so pages
// without animation never download it, and everything here follows the visitor's reduced-motion
// setting.

export type Anime = typeof import("./anime");

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

let request: Promise<Anime> | null = null;

export function loadAnime(): Promise<Anime> {
  request ??= import("./anime").catch((error) => {
    request = null;
    throw error;
  });
  return request;
}

// Starts downloading anime.js while a page fetches its data, so the two arrive together.
export function usePreloadMotion() {
  useEffect(() => {
    loadAnime().catch(() => {});
  }, []);
}

// Timing for scripted motion, read from the --motion-* variables in index.css so CSS and script
// motion stay in step. Times come back in ms and distances in px. The build's CSS minifier may
// rewrite a time in seconds (600ms becomes .6s), so both units are read.
export function motionTiming() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: number) => {
    const value = style.getPropertyValue(name).trim();
    const number = parseFloat(value);
    if (!Number.isFinite(number)) return fallback;
    return /\ds$/.test(value) ? number * 1000 : number;
  };
  return {
    duration: read("--motion-duration", 600),
    rise: read("--motion-rise", 16),
    stagger: read("--motion-stagger", 80),
  };
}

type Setup<T> = (anime: Anime, context: { root: T; scope: Scope; reduceMotion: boolean }) => void | (() => void);

// Runs `setup` in an anime.js scope on the element the returned ref is attached to, once the
// library has loaded. `setup` may return a cleanup function. On unmount the scope reverts every
// animation it made (removing their inline styles) and runs that cleanup; when the reduced-motion
// setting changes it does the same, then runs `setup` again. Animations started later, from an
// event or an observer, must go through a scope method (scope.add("name", fn), then
// scope.methods.name()) so the scope can revert them too. If anime.js can't load, `fallback` runs
// instead. Both run once per mount, so they should read the DOM rather than props.
export function useAnime<T extends HTMLElement>(setup: Setup<T>, fallback?: (root: T) => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let scope: Scope | undefined;
    let cancelled = false;
    loadAnime().then(
      (anime) => {
        if (cancelled) return;
        scope = anime
          .createScope({ root, mediaQueries: { reduceMotion: REDUCED_MOTION } })
          .add((self) => setup(anime, { root, scope: self!, reduceMotion: Boolean(self!.matches.reduceMotion) }));
      },
      () => {
        if (!cancelled) fallback?.(root);
      },
    );
    return () => {
      cancelled = true;
      scope?.revert();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return ref;
}
