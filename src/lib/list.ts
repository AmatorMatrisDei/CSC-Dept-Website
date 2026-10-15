// Turns "a, b, c" typed by staff into a clean list, and back.
export const splitList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// One entry per line, for lists whose entries can contain commas (clubs: "ACM, treasurer").
export const splitLines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
