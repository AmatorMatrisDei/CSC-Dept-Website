// A small fixed hash, so that the same day always orders the same pool the same way.
function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// `count` of the items, picked by the day (a "2026-10-22" string) so that every visitor sees the
// same ones, and tomorrow a different few. Equal days give equal results; the pool's own order is
// irrelevant.
export function dailyPick<T>(items: T[], day: string, count: number, key: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, rank: hash(`${day}:${key(item)}`) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(({ item }) => item);
}
