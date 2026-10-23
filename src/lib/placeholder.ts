// Helpers for image placeholders: initials of a name or title, and a steady tint picked from it.

// Titles before a name and letters after it, which aren't part of anyone's initials or surname.
const HONORIFICS = /^(dr|prof|professor|rev|fr|sr|br|mr|mrs|ms|mx)\.?$/i;
const SUFFIX = /^(jr|sr|ii|iii|iv|phd|psem|pe|osb|ofm|tor)\.?$/i;

// The words of a person's name without titles or suffixes: "Rev. Dr. Stephen Frezza, PSEM" gives
// ["Stephen", "Frezza"].
export function nameWords(name: string): string[] {
  const words = name.split(",")[0].split(/\s+/).filter((word) => /^\p{L}/u.test(word));
  const kept = words.filter((word) => !HONORIFICS.test(word) && !SUFFIX.test(word));
  return kept.length ? kept : words;
}

// The surname for sorting people: the last word of their name.
export function surname(name: string): string {
  const words = nameWords(name);
  return words[words.length - 1] ?? name;
}

// "Dr. Tyler Brown" gives "TB"; a project title gives its first two initials.
export function initials(label: string) {
  const words = nameWords(label);
  const picked = words.length > 2 ? [words[0], words[words.length - 1]] : words;
  return picked
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
