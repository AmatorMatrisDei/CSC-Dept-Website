// The daily carousel pick (Requirements and Team Guide, section 4.2; FR-5.6).
//
// OWNED BY THE ALGORITHMS TEAM. The body below is a placeholder that keeps the pipeline working:
// it takes pinned projects first, then the highest priority, and is not random. Replace it with
// the guide's algorithm:
//   1. target size: a random whole number from 5 to 7, or the pool size if smaller
//   2. every pinned project; if more than the target, the highest-priority ones
//   3. one project per sub-department not yet shown, chosen at random weighted by priority
//   4. fill the rest by weighted random sampling without replacement (weight = priority)
//   5. shuffle for display order
// Derive all randomness from `seed`, so the same seed always gives the same pick.
//
// Keep the signature and keep the file free of Deno- or Node-specific imports: the Edge Function
// in ../carousel/ imports it, and carousel-pick.test.ts runs it under Node.

export type Candidate = {
  project_id: string;
  sub_department_id: string;
  /** 1 to 10; the database guarantees it is never 0 or missing. */
  priority: number;
  is_pinned: boolean;
  /** ISO timestamp. */
  updated_at: string;
};

/**
 * Picks the day's carousel from this month's candidates.
 * @param seed "<YYYY-MM-DD>:<re-shuffle count>", e.g. "2026-10-14:0"
 * @returns 0 to 7 project ids from `candidates`, without repeats, in display order
 */
export function pickCarousel(candidates: Candidate[], seed: string): string[] {
  void seed;
  return [...candidates]
    .sort((a, b) =>
      Number(b.is_pinned) - Number(a.is_pinned) ||
      b.priority - a.priority ||
      a.project_id.localeCompare(b.project_id))
    .slice(0, 5)
    .map((candidate) => candidate.project_id);
}
