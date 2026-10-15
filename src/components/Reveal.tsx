import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef } from "react";

// Fades its children up when they scroll into view. `step` (0 to 4) staggers items that appear
// together, such as the cards in a row. The styling is in index.css under [data-reveal].
export default function Reveal({
  as: Tag = "div",
  step = 0,
  className,
  children,
}: {
  as?: ElementType;
  step?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.dataset.revealed = "";
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.revealed = "";
        observer.disconnect();
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal=""
      className={className}
      style={{ "--step": Math.min(step, 4) } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
