// Posts to the team's chat when a submission is waiting for review (#54). Only the database calls
// it, from the triggers in migration *_review_notifications.sql, with
// Authorization: Bearer <NOTIFY_SECRET>. Browsers never do, so it sends no CORS headers.
//
// Secrets (npx supabase secrets set NAME=value; docs/backend-setup.md):
//   NOTIFY_SECRET        the same value as the notify_secret Vault secret
//   SITE_URL             where the review links point, e.g. https://staging.csc-dept-website.pages.dev
//   GROUPME_BOT_ID       a GroupMe bot in the reviewers' group (bots post to a group's main chat)
//   DISCORD_WEBHOOK_URL  optional: a Discord channel's webhook
// With neither GroupMe nor Discord set, it sends nothing.
import { reviewMessage, type Submission } from "../_shared/review-message.ts";

// Compares secrets without leaking how many leading characters matched through timing.
function secretsMatch(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

function isSubmission(value: unknown): value is Submission {
  const s = value as Submission;
  return (
    typeof s?.id === "string" &&
    ["profile", "project", "internship"].includes(s.target_type) &&
    ["create", "update", "delete"].includes(s.action)
  );
}

async function post(url: string, body: object): Promise<boolean> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.ok;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("NOTIFY_SECRET");
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !secretsMatch(token, secret)) return new Response("Unauthorized", { status: 401 });

  const submission: unknown = await request.json().catch(() => null);
  if (!isSubmission(submission)) return new Response("Bad request", { status: 400 });

  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) {
    console.error("notify-reviewers: SITE_URL is not set");
    return new Response("Not configured", { status: 500 });
  }
  const text = reviewMessage(submission, siteUrl);

  const sends: Promise<boolean>[] = [];
  const groupMeBot = Deno.env.get("GROUPME_BOT_ID");
  if (groupMeBot) sends.push(post("https://api.groupme.com/v3/bots/post", { bot_id: groupMeBot, text }));
  const discord = Deno.env.get("DISCORD_WEBHOOK_URL");
  // allowed_mentions: a title like "@everyone" stays text instead of pinging the whole server.
  if (discord) sends.push(post(discord, { content: text, allowed_mentions: { parse: [] } }));

  const results = await Promise.allSettled(sends);
  const failed = results.filter((r) => r.status === "rejected" || !r.value).length;
  if (failed) console.error(`notify-reviewers: ${failed} of ${results.length} chats didn't accept the message`);
  return Response.json({ sent: results.length - failed, failed }, { status: failed ? 502 : 200 });
});
