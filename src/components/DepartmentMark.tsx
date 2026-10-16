// The department's mark: two meshing gears leading into circuit traces, engineering into
// computing, drawn in lines of the theme's gold. It's decorative, so screen readers skip it.
// The home page draws it in on a visitor's first visit (lib/homeIntro.ts), using the data-mark
// attributes: "line" for strokes that draw, "gear" for a gear that turns (data-turn is one tooth,
// in degrees, so a turn ends looking exactly as it started) and "pad" for the traces' end points.

// A gear outline: `teeth` tapered teeth of height `depth` around a circle of radius `root`, the
// first tooth starting `phase` degrees round from the right.
function gear(cx: number, cy: number, root: number, depth: number, teeth: number, phase: number): string {
  const step = 360 / teeth;
  const point = (degrees: number, radius: number) => {
    const angle = (degrees * Math.PI) / 180;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  };
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const start = phase + i * step;
    points.push(point(start, root), point(start + step * 0.18, root + depth), point(start + step * 0.42, root + depth), point(start + step * 0.6, root));
  }
  return `M${points.join("L")}Z`;
}

// The small gear sits up and to the right of the large one. Both have teeth of the same size, so
// the small one has 8 to the large one's 12. At the point where they meet, a tooth of the large
// gear sits in a gap of the small one.
const CONTACT = -38; // degrees, from the large gear's centre to the small one's
const LARGE = { x: 80, y: 120, root: 50, depth: 9, teeth: 12 };
const SMALL_TEETH = 8;
const SMALL_ROOT = ((LARGE.root + LARGE.depth / 2) * SMALL_TEETH) / LARGE.teeth - LARGE.depth / 2;
const DISTANCE = LARGE.root + SMALL_ROOT + LARGE.depth;
const SMALL = {
  x: LARGE.x + DISTANCE * Math.cos((CONTACT * Math.PI) / 180),
  y: LARGE.y + DISTANCE * Math.sin((CONTACT * Math.PI) / 180),
  root: SMALL_ROOT,
  depth: LARGE.depth,
  teeth: SMALL_TEETH,
};
const LARGE_PHASE = CONTACT - (360 / LARGE.teeth) * 0.3; // a tooth centred on the contact point
const SMALL_PHASE = CONTACT + 180 - (360 / SMALL.teeth) * 0.8; // a gap centred on it

const TRACES = [
  "M146 132H214L236 110H312",
  "M262 110V146H290",
  "M140 156H196L220 180H330",
  "M198 72H246L266 52H300",
];
const PADS = [
  [318, 110],
  [296, 146],
  [336, 180],
  [306, 52],
];

const turning = "origin-center [transform-box:fill-box]";

export default function DepartmentMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 350 200"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-highlight ${className}`}
    >
      <g data-mark="gear" data-turn={-360 / LARGE.teeth} className={turning}>
        <path data-mark="line" d={gear(LARGE.x, LARGE.y, LARGE.root, LARGE.depth, LARGE.teeth, LARGE_PHASE)} />
        <circle data-mark="line" cx={LARGE.x} cy={LARGE.y} r={15} />
        <circle data-mark="line" cx={LARGE.x} cy={LARGE.y} r={4} />
      </g>
      <g data-mark="gear" data-turn={360 / SMALL.teeth} className={turning}>
        <path data-mark="line" d={gear(SMALL.x, SMALL.y, SMALL.root, SMALL.depth, SMALL.teeth, SMALL_PHASE)} />
        <circle data-mark="line" cx={SMALL.x} cy={SMALL.y} r={9} />
        <circle data-mark="line" cx={SMALL.x} cy={SMALL.y} r={3} />
      </g>
      {TRACES.map((d) => (
        <path key={d} data-mark="line" d={d} />
      ))}
      {PADS.map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} data-mark="pad" cx={cx} cy={cy} r={5.5} className={`fill-background ${turning}`} />
      ))}
    </svg>
  );
}
