import type { CSSProperties } from "react";
import { gearPath } from "@/lib/gears";

export const GEAR_TEETH = 12;
const PATH = gearPath(60, 60, 50, 9, GEAR_TEETH, 0);

// One gear drawn like the large gear of the department mark (same teeth and hub). Decorative, so
// screen readers skip it. It has no motion of its own: its parent turns it (the next-event card
// ticks it, the page turns it as it scrolls, the calendar turns it as the month changes).
export default function EventGear({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      data-gear=""
      aria-hidden="true"
      focusable="false"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      stroke="currentColor"
      className={`fill-background text-highlight ${className}`}
      style={style}
    >
      <path d={PATH} />
      <circle cx={60} cy={60} r={15} fill="none" />
      <circle cx={60} cy={60} r={4} fill="none" />
    </svg>
  );
}
