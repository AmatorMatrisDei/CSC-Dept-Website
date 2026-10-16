import type { ElementType, ReactNode } from "react";
import { motionTiming, useAnime } from "@/lib/motion";

// A list whose items fade up as they scroll into view. Items that come into view together enter
// one after another, in page order, and items added later (when a filter changes) get the same
// entrance. The hidden starting state and the failsafe are in index.css under [data-reveal];
// timing is in the --motion-* variables. With reduced motion, or if anime.js can't load, items
// are simply shown.
export default function RevealList({
  as: Tag = "ul",
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  const ref = useAnime<HTMLElement>(
    (anime, { root, scope, reduceMotion }) => {
      const items = () => [...root.children] as HTMLElement[];
      const show = (item: HTMLElement) => {
        item.dataset.revealed = "";
      };

      // Anything the failsafe already showed (anime.js arrived late) stays as it is.
      for (const item of items()) if (getComputedStyle(item).opacity !== "0") show(item);
      root.dataset.revealArmed = "";

      if (reduceMotion || !("IntersectionObserver" in window)) {
        items().forEach(show);
        root.dataset.revealOff = "";
        return () => {
          delete root.dataset.revealOff;
        };
      }

      const { duration, rise, stagger } = motionTiming();
      scope.add("enter", (arriving: HTMLElement[]) => {
        anime.animate(arriving, {
          opacity: [0, 1],
          y: [rise, 0],
          duration,
          // One after another, but never more than four steps behind the first.
          delay: anime.stagger(stagger, { modifier: (delay) => Math.min(delay, stagger * 4) }),
          ease: "outCubic",
          onComplete: (animation) => {
            arriving.forEach(show);
            anime.cleanInlineStyles(animation);
          },
        });
      });

      const started = new WeakSet<Element>();
      const inView = new IntersectionObserver(
        (entries) => {
          const arriving = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement);
          if (!arriving.length) return;
          for (const item of arriving) {
            inView.unobserve(item);
            started.add(item);
          }
          arriving.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
          scope.methods.enter(arriving);
        },
        { threshold: 0.15 },
      );
      const watch = () => {
        for (const item of items()) if (item.dataset.revealed === undefined && !started.has(item)) inView.observe(item);
      };
      watch();

      // React adds and removes items as filters change.
      const changes = new MutationObserver((records) => {
        for (const record of records) {
          record.removedNodes.forEach((node) => {
            if (node instanceof Element) inView.unobserve(node);
          });
        }
        watch();
      });
      changes.observe(root, { childList: true });

      return () => {
        inView.disconnect();
        changes.disconnect();
      };
    },
    (root) => {
      root.dataset.revealOff = "";
    },
  );

  return (
    <Tag ref={ref} data-reveal="" className={className}>
      {children}
    </Tag>
  );
}
