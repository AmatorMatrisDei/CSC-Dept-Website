// Turns "a, b, c" typed by staff into a clean list, and back.
export const splitList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
