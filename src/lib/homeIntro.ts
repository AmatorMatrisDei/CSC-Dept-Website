import { type Anime, motionTiming } from "./motion";

// The home page's opening, played each time the page opens (on a reload, and on coming back from
// another page): the department mark draws itself while its gears turn one tooth, the headline
// rises word by word, then the introduction and the featured projects fade in. About 1.3 seconds,
// and nothing waits on it: links work throughout. Home.tsx marks the parts with data-intro-part,
// DepartmentMark.tsx marks the drawing with data-mark, and index.css keeps the parts hidden
// ([data-intro]) until this plays them in.

// A useAnime setup for the page's root element.
export function playHomeIntro(anime: Anime, { root, reduceMotion }: { root: HTMLElement; reduceMotion: boolean }) {
  if (root.dataset.intro === undefined || root.dataset.introDone !== undefined) return;
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-intro-part="${name}"]`);
  const [title, text, mark, featured] = ["title", "text", "mark", "featured"].map(part);
  const finish = () => {
    root.dataset.introDone = "";
  };

  // With reduced motion, or if anime.js arrived after the failsafe already showed the page, show
  // everything as it is.
  if (reduceMotion || !title || !text || !mark || !featured || getComputedStyle(title).opacity !== "0") {
    finish();
    return;
  }
  root.dataset.introArmed = "";

  const heading = title.querySelector("h1");
  // Not splitText's `wrap` option: it writes its wrappers' styles as HTML attributes, which the
  // site's content security policy blocks.
  const split = heading ? anime.splitText(heading, { words: true }) : null;
  const words: HTMLElement[] = split?.words ?? [];
  const lineElements = [...mark.querySelectorAll<SVGElement>('[data-mark="line"]')];
  const lines = anime.createDrawable(lineElements);
  const pads = mark.querySelectorAll('[data-mark="pad"]');
  const { duration, rise } = motionTiming();

  // React replaces the headline's text if it changes (staff edits load after the page), which
  // removes the split words. Only put the original text back if the words are still there.
  const unsplit = () => {
    if (words[0]?.isConnected) split?.revert();
  };
  // Drawing works through stroke attributes, which cleanInlineStyles doesn't remove.
  const undraw = () => {
    for (const line of lineElements) {
      for (const name of ["pathLength", "stroke-dasharray", "stroke-dashoffset", "draw"]) line.removeAttribute(name);
      line.style.removeProperty("stroke-linecap");
    }
  };

  const timeline = anime
    .createTimeline({
      defaults: { ease: "outCubic" },
      onComplete: () => {
        finish();
        anime.cleanInlineStyles(timeline);
        undraw();
        unsplit();
      },
    })
    .set([title, mark], { opacity: 1 }, 0)
    .set(words, { opacity: 0, y: rise }, 0)
    .set(lines, { draw: "0 0" }, 0)
    .set(pads, { scale: 0 }, 0)
    .add(lines, { draw: ["0 0", "0 1"], duration: 900, ease: "inOutQuad", delay: anime.stagger(40) }, 0)
    .add(words, { opacity: [0, 1], y: [rise, 0], duration, delay: anime.stagger(70) }, 100)
    .add(text, { opacity: [0, 1], y: [rise, 0], duration }, 350)
    .add(featured, { opacity: [0, 1], y: [rise, 0], duration }, 500)
    .add(pads, { scale: [0, 1], duration: 350, ease: "outBack", delay: anime.stagger(60) }, 800);
  // Each gear turns one tooth, the small one the opposite way, as meshing gears do.
  for (const gear of mark.querySelectorAll<SVGElement>('[data-mark="gear"]')) {
    timeline.add(gear, { rotate: [0, Number(gear.dataset.turn)], duration: 1300, ease: "inOutCubic" }, 0);
  }

  // Leaving the page, or a change to the reduced-motion setting, mid-way: the scope reverts the
  // animations, so show everything as it is.
  return () => {
    finish();
    undraw();
    unsplit();
  };
}
