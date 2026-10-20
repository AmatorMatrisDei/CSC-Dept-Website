// Lists what changed on staging between two points, from the pull requests merged in that time.
// Every pull request description has a "What changed" section (.github/pull_request_template.md),
// so this is the change-log: paste its output to an AI and ask for a short summary.
//
//   npm run changes -- v1                  everything merged after the v1 tag
//   npm run changes -- v1 v2               between two tags
//   npm run changes -- 2026-10-20          after a date (or 2026-10-20T12:00:00-04:00)
//   npm run changes -- 2026-10-20 2026-11-03
//
// The first argument is where to start and the optional second is where to stop (default: now).
// A start or stop can be a tag, a commit or a date. It needs the GitHub CLI (`gh`), signed in.
import { execFileSync } from "node:child_process";

const [from, to] = process.argv.slice(2);
if (!from) {
  console.error("Usage: npm run changes -- <from> [to]   (a tag, a commit or a date such as 2026-10-20)");
  process.exit(1);
}

const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();

const isDate = (text) => /^\d{4}-\d{2}-\d{2}/.test(text);

// A date is used as it is; anything else is looked up in git as a tag or commit.
function moment(text) {
  if (isDate(text)) return new Date(text);
  try {
    return new Date(run("git", ["log", "-1", "--format=%cI", text]));
  } catch {
    console.error(`"${text}" is not a date, tag or commit (run \`git fetch --tags\` if it should exist).`);
    process.exit(1);
  }
}

const start = moment(from);
const end = to ? moment(to) : new Date();
if (Number.isNaN(start) || Number.isNaN(end)) {
  console.error("Could not read that date. Use a form like 2026-10-20 or 2026-10-20T12:00:00-04:00.");
  process.exit(1);
}

// Does the commit belong to the history of the tag or commit `ref`?
function within(oid, ref) {
  try {
    run("git", ["merge-base", "--is-ancestor", oid, ref]);
    return true;
  } catch {
    return false;
  }
}

// A start or stop given as a tag or commit is compared by history, which is exact; a date is
// compared by time. GitHub records a merge a few seconds after its commit, so time alone would
// count the pull request a tag points at as coming after it.
function inRange(pr) {
  const oid = pr.mergeCommit?.oid;
  const merged = new Date(pr.mergedAt);
  const afterStart = isDate(from) || !oid ? merged > start : !within(oid, from);
  const beforeEnd = !to ? true : isDate(to) || !oid ? merged <= end : within(oid, to);
  return afterStart && beforeEnd;
}

const prs = JSON.parse(
  run("gh", ["pr", "list", "--state", "merged", "--base", "staging", "--limit", "500", "--json", "number,title,body,author,mergedAt,mergeCommit,url,labels"]),
)
  .filter(inRange)
  .sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));

// The "What changed" section of a description, up to the next heading. Older pull requests, from
// before the section existed, have none, so their whole description is used instead.
function whatChanged(body) {
  const text = (body ?? "").replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const match = text.match(/^##\s*What changed[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im);
  return (match ? match[1] : text.split(/^##\s/m)[0]).trim() || "(no description)";
}

const day = (d) => new Date(d).toISOString().slice(0, 10);
console.log(`# Changes from ${from} to ${to ?? "now"}\n`);
console.log(`${prs.length} pull request${prs.length === 1 ? "" : "s"} merged into staging, ${day(start)} to ${day(end)}.\n`);
for (const pr of prs) {
  const labels = pr.labels.map((l) => l.name).join(", ");
  console.log(`## #${pr.number} ${pr.title}`);
  console.log(`Merged ${day(pr.mergedAt)} by ${pr.author?.login ?? "unknown"}${labels ? ` · ${labels}` : ""} · ${pr.url}\n`);
  console.log(`${whatChanged(pr.body)}\n`);
}
