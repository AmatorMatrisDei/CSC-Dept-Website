import assert from "node:assert/strict";
import { test } from "node:test";
import { callerIp, passesTurnstile, SITEVERIFY } from "./turnstile.ts";

// A stand-in for Cloudflare that accepts one token, and records what it was asked.
function cloudflare(good = "good-token") {
  const asked: { url: string; form: URLSearchParams }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    const form = new URLSearchParams(String(init.body));
    asked.push({ url, form });
    return Response.json({ success: form.get("response") === good && form.get("secret") === "the-secret" });
  }) as typeof fetch;
  return { send, asked };
}

test("a token Cloudflare accepts passes, and Cloudflare is asked with our secret", async () => {
  const cf = cloudflare();
  assert.equal(await passesTurnstile("the-secret", "good-token", "203.0.113.9", cf.send), true);
  assert.equal(cf.asked[0].url, SITEVERIFY);
  assert.equal(cf.asked[0].form.get("remoteip"), "203.0.113.9");
});

test("a missing, wrong or oversized token fails", async () => {
  const cf = cloudflare();
  assert.equal(await passesTurnstile("the-secret", undefined, null, cf.send), false);
  assert.equal(await passesTurnstile("the-secret", "", null, cf.send), false);
  assert.equal(await passesTurnstile("the-secret", "made-up", null, cf.send), false);
  assert.equal(await passesTurnstile("the-secret", "x".repeat(2049), null, cf.send), false);
  assert.equal(cf.asked.length, 1, "only the made-up token was worth asking about");
});

test("if Cloudflare can't be reached, the request doesn't pass", async () => {
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.equal(await passesTurnstile("the-secret", "good-token", null, down), false);
});

test("with no secret set, there is no CAPTCHA yet and everything passes", async () => {
  const cf = cloudflare();
  assert.equal(await passesTurnstile(undefined, undefined, null, cf.send), true);
  assert.equal(cf.asked.length, 0);
});

test("the caller's address is the first one Supabase passes on", () => {
  assert.equal(callerIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(callerIp(new Headers()), null);
});
