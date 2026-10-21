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

// A link in a page list: a web address, or a path on this site. "//host" and "/\host" would leave
// the site, so they are not links. (The database applies the same rule.)
export const safeLink = (url: string) => /^(https?:\/\/\S{1,255}|\/([^/\\\s]\S{0,254})?)$/.test(url);
