// Several people editing page text at the same time, against the local Supabase stack. Each case
// uses two signed-in admins and calls the database the way the site does. Run with
// `npm run test:api:cms` after `npm run db:start`. It removes the text and accounts it creates;
// audit log entries stay, because the audit log is append-only (`npm run db:reset` clears them).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = JSON.parse(
  execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
);

const tag = randomUUID().slice(0, 6);
const key = (name) => `home.cc-${tag}-${name}`;
const users = [];

async function call(path, { method = "GET", token, secret, json } = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      apikey: secret ? SECRET_KEY : PUBLISHABLE_KEY,
      Authorization: `Bearer ${secret ? SECRET_KEY : token}`,
      ...(json !== undefined && { "Content-Type": "application/json" }),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function makeAdmin(label) {
  const email = `cc-${label}-${tag}@franciscan.edu`;
  const res = await call("/auth/v1/signup", { method: "POST", json: { email, password: "password123", data: { full_name: `CC ${label}` } } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const { id } = res.data.user;
  users.push(id);
  await call(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", secret: true, json: { role: "admin" } });
  // Sign in again so the token is issued for the admin role.
  const signedIn = await call("/auth/v1/token?grant_type=password", { method: "POST", json: { email, password: "password123" } });
  return signedIn.data.access_token;
}

const rpc = (token, name, args = {}) => call(`/rest/v1/rpc/${name}`, { method: "POST", token, json: args });
const save = (token, k, value, seen = null) => rpc(token, "save_site_draft", { draft_key: k, draft_value: value, seen_updated_at: seen });
const publish = (token, keys = null) => rpc(token, "publish_site_drafts", { only_keys: keys });
const live = async (k) => (await call(`/rest/v1/site_content?key=eq.${k}&select=value,updated_at`, { secret: true })).data[0];
const draft = async (k) => (await call(`/rest/v1/site_content_draft?key=eq.${k}&select=value,base_updated_at`, { secret: true })).data;
const history = async (k) => (await call(`/rest/v1/site_content_history?key=eq.${k}&select=value&order=id`, { secret: true })).data;

let a;
let b;

before(async () => {
  a = await makeAdmin("a");
  b = await makeAdmin("b");
});

after(async () => {
  for (const table of ["site_content_draft", "site_content", "site_content_history"]) {
    await call(`/rest/v1/${table}?key=like.home.cc-${tag}-*`, { method: "DELETE", secret: true });
  }
  for (const id of users) await call(`/auth/v1/admin/users/${id}`, { method: "DELETE", secret: true });
});

test("two editors saving different texts at the same moment both keep their drafts", async () => {
  const results = await Promise.all([save(a, key("one"), "From A"), save(b, key("two"), "From B")]);
  assert.deepEqual(results.map((r) => r.status), [204, 204]);
  assert.equal((await publish(a)).data.published >= 2, true);
  assert.equal((await live(key("one"))).value, "From A");
  assert.equal((await live(key("two"))).value, "From B");
});

test("two editors saving the same text at the same moment leave one draft, with no error", async () => {
  const results = await Promise.all([save(a, key("same"), "A's words"), save(b, key("same"), "B's words")]);
  assert.deepEqual(results.map((r) => r.status), [204, 204]);
  const rows = await draft(key("same"));
  assert.equal(rows.length, 1);
  assert.ok(["A's words", "B's words"].includes(rows[0].value));
  await rpc(a, "discard_site_drafts", { only_keys: [key("same")] });
});

test("an editor working from an out-of-date page cannot overwrite a newer published change", async () => {
  await save(a, key("stale"), "Version 1");
  await publish(a, [key("stale")]);
  const seenByA = (await live(key("stale"))).updated_at; // A's page loaded here

  await save(b, key("stale"), "Version 2 from B", seenByA); // B edits and publishes meanwhile
  await publish(b, [key("stale")]);

  await save(a, key("stale"), "Version from A's old page", seenByA);
  const result = await publish(a, [key("stale")]);
  assert.deepEqual(result.data.conflicts, [key("stale")]);
  assert.equal((await live(key("stale"))).value, "Version 2 from B", "B's change is still live");
  await rpc(a, "discard_site_drafts", { only_keys: [key("stale")] });
});

test("two editors publishing at once publish each draft exactly once", async () => {
  await save(a, key("race"), "Raced");
  const results = await Promise.all([publish(a, [key("race")]), publish(b, [key("race")])]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  const published = results.map((r) => r.data.published).sort();
  assert.deepEqual(published, [0, 1]);
  assert.equal((await live(key("race"))).value, "Raced");
  assert.equal((await draft(key("race"))).length, 0);
});

test("a draft saved while another editor publishes is never lost", async () => {
  for (let i = 0; i < 8; i++) {
    const k = key(`during${i}`);
    await save(a, key("busy"), `Busy ${i}`, (await live(key("busy")))?.updated_at ?? null);
    await Promise.all([publish(a), save(b, k, `Saved during publish ${i}`)]);
    const isLive = (await live(k))?.value === `Saved during publish ${i}`;
    const isDraft = (await draft(k)).length === 1;
    assert.ok(isLive || isDraft, `round ${i}: the draft was neither published nor kept`);
    await publish(a);
  }
});

test("twenty editors' worth of saves at once all arrive", async () => {
  const token = [a, b];
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => save(token[i % 2], key(`bulk${i}`), `Text ${i}`)));
  assert.ok(results.every((r) => r.status === 204));
  const rows = await call(`/rest/v1/site_content_draft?key=like.home.cc-${tag}-bulk*&select=key`, { secret: true });
  assert.equal(rows.data.length, 20);
  const result = await Promise.all([publish(a), publish(b)]);
  assert.deepEqual(result.flatMap((r) => r.data.conflicts), []);
  assert.equal(result.reduce((n, r) => n + r.data.published, 0), 20, "each of the 20 went live once between them");
});

test("the history records each replaced text once, in order, even when edits overlap", async () => {
  await save(a, key("hist"), "H1");
  await publish(a, [key("hist")]);
  for (const text of ["H2", "H3"]) {
    await save(b, key("hist"), text, (await live(key("hist"))).updated_at);
    await publish(b, [key("hist")]);
  }
  assert.deepEqual((await history(key("hist"))).map((h) => h.value), ["H1", "H2"]);
});

// Project, student and faculty edits are drafts too. A faculty record is the smallest to use.
let person;
const saveRecord = (token, patch, seen = null) =>
  rpc(token, "save_record_draft", { draft_table: "faculty", draft_slug: person.slug, draft_patch: patch, draft_gallery: null, seen_updated_at: seen });
const livePerson = async () => (await call(`/rest/v1/faculty?slug=eq.${person.slug}&select=title,updated_at`, { secret: true })).data[0];

async function resetPerson() {
  await call(`/rest/v1/record_draft?row_slug=eq.${person.slug}`, { method: "DELETE", secret: true });
  await call(`/rest/v1/record_history?row_slug=eq.${person.slug}`, { method: "DELETE", secret: true });
  await call(`/rest/v1/faculty?slug=eq.${person.slug}`, { method: "PATCH", secret: true, json: { title: person.title } });
}

test("an editor working from an out-of-date record page cannot overwrite a newer change", async () => {
  person = (await call("/rest/v1/faculty?select=slug,title&limit=1", { secret: true })).data[0];
  try {
    const seenByA = (await livePerson()).updated_at;
    await saveRecord(b, { title: `B ${tag}` }, seenByA);
    assert.equal((await publish(b)).data.records, 1);

    await saveRecord(a, { title: `A's old page ${tag}` }, seenByA);
    const result = await publish(a);
    assert.deepEqual(result.data.conflicts, [`faculty/${person.slug}`]);
    assert.equal((await livePerson()).title, `B ${tag}`, "B's change is still live");
  } finally {
    await resetPerson();
  }
});

test("two editors publishing the same record draft at once publish it exactly once", async () => {
  try {
    await saveRecord(a, { title: `Raced ${tag}` }, (await livePerson()).updated_at);
    const results = await Promise.all([publish(a), publish(b)]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    assert.equal(results.reduce((n, r) => n + r.data.records, 0), 1);
    assert.equal((await livePerson()).title, `Raced ${tag}`);
    const kept = await call(`/rest/v1/record_history?row_slug=eq.${person.slug}&select=before`, { secret: true });
    assert.equal(kept.data.length, 1, "the replaced title was kept once");
  } finally {
    await resetPerson();
  }
});

test("two editors saving edits to the same record at the same moment keep both columns", async () => {
  try {
    const seen = (await livePerson()).updated_at;
    const results = await Promise.all([saveRecord(a, { title: `T ${tag}` }, seen), saveRecord(b, { email: `x${tag}@franciscan.edu` }, seen)]);
    assert.deepEqual(results.map((r) => r.status), [204, 204]);
    const [row] = (await call(`/rest/v1/record_draft?row_slug=eq.${person.slug}&select=patch`, { secret: true })).data;
    assert.deepEqual(Object.keys(row.patch).sort(), ["email", "title"]);
  } finally {
    await resetPerson();
  }
});
