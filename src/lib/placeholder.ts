// Helpers for image placeholders: initials of a name or title, and a steady tint picked from it.
export function initials(label: string) {
  return label
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

// A steady background color picked from the label: a green or gold tint over the card surface,
// in six strengths, so neighbouring cards usually differ.
const TINTS = [
  ["accent", 14],
  ["highlight", 24],
  ["accent", 24],
  ["highlight", 14],
  ["accent", 32],
  ["highlight", 34],
] as const;

export function tintFor(label: string) {
  let hash = 5381;
  for (const ch of label) hash = (hash * 33 + ch.charCodeAt(0)) % 1000003;
  const [color, percent] = TINTS[hash % TINTS.length];
  return `color-mix(in srgb, var(--${color}) ${percent}%, var(--surface))`;
}
