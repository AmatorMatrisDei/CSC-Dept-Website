// Editing page text in a real browser: the Edit bar, drafts only the editor sees, publishing,
// a clash with someone else's change, and the bar folding away.
//
// Needs the local stack (`npm run db:start`) and Google Chrome. Run with `npm run test:e2e:cms`.
// It starts its own dev server on port 5175 and puts the page text back afterwards.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = JSON.parse(
  execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
);
const BASE = "http://localhost:5175";
const KEY = "home.title";
const OTHER_KEY = "about.title";
const LIST_KEY = "about.highlights.items";
const KEYS = [KEY, OTHER_KEY, LIST_KEY];
// A 1x1 PNG, used as the picture to upload.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let faculty = null; // a faculty member whose photo the test changes, as it was before
let project = null; // a project whose photos the test changes, as it was before

const tag = randomUUID().slice(0, 6);
const password = "password-e2e-1";
const adminUser = { name: `E2E Admin ${tag}`, email: `e2e-admin-${tag}@franciscan.edu` };
const secondAdmin = { name: `E2E Admin Two ${tag}`, email: `e2e-admin2-${tag}@franciscan.edu` };
const studentUser = { name: `E2E Student ${tag}`, email: `e2e-cms-student-${tag}@franciscan.edu` };
const firstText = `First wording ${tag}`;
const elsewhereText = `Changed elsewhere ${tag}`;

const api = (path, init = {}) =>
  fetch(API_URL + path, {
    ...init,
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json", ...init.headers },
  });

let vite;
let browser;
let page;
let visitor;
const originals = {}; // the live text of each key before the test, if there was any
const userIds = [];
const browserErrors = [];

async function createUser({ name, email }, role) {
  const res = await api("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
  const { id } = await res.json();
  assert.ok(id, "the test account was created");
  userIds.push(id);
  // Test accounts have verified their email; only verified accounts can be admins.
  await api("/rest/v1/rpc/mark_account_verified", { method: "POST", body: JSON.stringify({ account: id, how: "admin" }) });
  if (role) {
    const promoted = await api(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
    assert.ok(promoted.ok, `the test account became ${role}`);
  }
}

before(async () => {
  [project] = await (await api("/rest/v1/projects?select=id,slug,title,thumbnail_path,thumbnail_alt&thumbnail_path=is.null&limit=1")).json();
  [faculty] = await (await api("/rest/v1/faculty?select=id,slug,photo_path&limit=1")).json();
  for (const key of KEYS) {
    const rows = await (await api(`/rest/v1/site_content?key=eq.${key}&select=value`)).json();
    originals[key] = rows[0]?.value ?? null;
  }

  vite = spawn("npx", ["vite", "--port", "5175", "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY },
    stdio: "ignore",
    shell: process.platform === "win32", // npx is a .cmd file on Windows
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await createUser(adminUser, "admin");
  await createUser(secondAdmin, "admin");
  await createUser(studentUser);

  browser = await chromium.launch({ channel: "chrome", headless: true });
  page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  visitor = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
});

after(async () => {
  await browser?.close();
  vite?.kill();
  for (const key of KEYS) {
    await api(`/rest/v1/site_content_draft?key=eq.${key}`, { method: "DELETE" });
    if (originals[key] === null) await api(`/rest/v1/site_content?key=eq.${key}`, { method: "DELETE" });
    else await api(`/rest/v1/site_content?key=eq.${key}`, { method: "PATCH", body: JSON.stringify({ value: originals[key] }) });
    // Putting the text back is itself recorded as a change; clear the history too.
    await api(`/rest/v1/site_content_history?key=eq.${key}`, { method: "DELETE" });
  }
  if (project) {
    await api(`/rest/v1/record_draft?row_slug=eq.${project.slug}`, { method: "DELETE" });
    await api(`/rest/v1/record_photo_history?project_id=eq.${project.id}`, { method: "DELETE" });
    await api(`/rest/v1/project_images?project_id=eq.${project.id}`, { method: "DELETE" });
    await api(`/rest/v1/projects?id=eq.${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: project.title, thumbnail_path: project.thumbnail_path, thumbnail_alt: project.thumbnail_alt }),
    });
    const files = await (
      await api("/storage/v1/object/list/media", {
        method: "POST",
        body: JSON.stringify({ prefix: `projects/${project.id}`, limit: 100 }),
      })
    ).json();
    const leftover = (Array.isArray(files) ? files : []).map((f) => `projects/${project.id}/${f.name}`);
    if (leftover.length) await api("/storage/v1/object/media", { method: "DELETE", body: JSON.stringify({ prefixes: leftover }) });
  }
  if (faculty) {
    await api(`/rest/v1/record_draft?row_slug=eq.${faculty.slug}`, { method: "DELETE" });
    await api(`/rest/v1/record_history?row_slug=eq.${faculty.slug}`, { method: "DELETE" });
    await api(`/rest/v1/faculty?id=eq.${faculty.id}`, { method: "PATCH", body: JSON.stringify({ photo_path: faculty.photo_path }) });
    const files = await (
      await api("/storage/v1/object/list/media", { method: "POST", body: JSON.stringify({ prefix: `faculty/${faculty.id}`, limit: 100 }) })
    ).json();
    const leftover = (Array.isArray(files) ? files : []).map((f) => `faculty/${faculty.id}/${f.name}`);
    if (leftover.length) await api("/storage/v1/object/media", { method: "DELETE", body: JSON.stringify({ prefixes: leftover }) });
  }
  await api(`/rest/v1/events?title=like.*${tag}`, { method: "DELETE" });
  await api(`/rest/v1/audit_log?actor_id=in.(${userIds.join(",")})`, { method: "DELETE" });
  for (const id of userIds) await api(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
});

async function signIn(p, { email }) {
  await p.goto(`${BASE}/account/sign-in`);
  await p.getByLabel("University email").fill(email);
  await p.getByLabel("Password").fill(password);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL(`${BASE}/account`);
}

const heading = (p) => p.getByRole("heading", { level: 1 });

test("a student does not get the edit bar", async () => {
  const p = await browser.newPage();
  await signIn(p, studentUser);
  await p.goto(BASE);
  await heading(p).waitFor();
  assert.equal(await p.getByRole("toolbar", { name: "Edit tools" }).count(), 0);
  assert.equal(await p.getByRole("button", { name: /^Edit/ }).count(), 0);
  await p.close();
});

test("an admin gets the edit bar, and the header has no edit switch", async () => {
  await signIn(page, adminUser);
  await page.goto(BASE);
  await page.getByRole("toolbar", { name: "Edit tools" }).waitFor();
  assert.equal(await page.getByRole("banner").getByRole("switch").count(), 0);
});

test("an edit is a draft only the editor sees, until it is published", async () => {
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: `Edit ${KEY.replace(".", " ")}` }).click();
  await page.getByLabel(KEY.replace(".", " ")).fill(firstText);
  await page.getByLabel(KEY.replace(".", " ")).press("Enter");

  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();
  await page.getByRole("button", { name: `Edit ${KEY.replace(".", " ")}` }).filter({ hasText: firstText }).waitFor(); // editors see their draft

  await visitor.goto(BASE);
  await heading(visitor).waitFor();
  assert.notEqual((await heading(visitor).textContent())?.trim(), firstText, "visitors still see the old wording");

  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });

  await visitor.reload();
  await visitor.getByRole("heading", { level: 1, name: firstText }).waitFor();
});

test("publishing refuses when the live text changed after the draft was started", async () => {
  await page.getByRole("button", { name: `Edit ${KEY.replace(".", " ")}` }).click();
  await page.getByLabel(KEY.replace(".", " ")).fill(`My draft ${tag}`);
  await page.getByLabel(KEY.replace(".", " ")).press("Enter");
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();

  await api(`/rest/v1/site_content?key=eq.${KEY}`, { method: "PATCH", body: JSON.stringify({ value: elsewhereText }) });

  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByText(/Someone else changed home\.title/).waitFor();
  const live = await (await api(`/rest/v1/site_content?key=eq.${KEY}&select=value`)).json();
  assert.equal(live[0].value, elsewhereText, "the other person's text was not overwritten");

  await page.getByRole("button", { name: "Changes" }).click();
  await page.getByRole("button", { name: "Discard all" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
});

test("turning Edit mode off shrinks the pill to the switch", async () => {
  await page.getByRole("button", { name: "History" }).waitFor();
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "History" }).waitFor({ state: "detached" });
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "History" }).waitFor();
});

test("two editors on different pages: both drafts are shared and published together", async () => {
  const second = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(second, secondAdmin);
  await second.goto(`${BASE}/about`);
  await second.getByRole("switch", { name: "Edit mode" }).click();
  await second.getByRole("button", { name: `Edit ${OTHER_KEY.replace(".", " ")}` }).click();
  await second.getByLabel(OTHER_KEY.replace(".", " ")).fill(`About by two ${tag}`);
  await second.getByLabel(OTHER_KEY.replace(".", " ")).press("Enter");
  await second.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();

  await page.goto(BASE);
  await page.getByRole("switch", { name: "Edit mode" }).waitFor();
  if ((await page.getByRole("switch", { name: "Edit mode" }).getAttribute("aria-checked")) !== "true") {
    await page.getByRole("switch", { name: "Edit mode" }).click();
  }
  await page.getByRole("button", { name: `Edit ${KEY.replace(".", " ")}` }).click();
  await page.getByLabel(KEY.replace(".", " ")).fill(`Home by one ${tag}`);
  await page.getByLabel(KEY.replace(".", " ")).press("Enter");
  await page.getByRole("button", { name: "Changes 2 unpublished" }).waitFor();

  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
  await visitor.goto(`${BASE}/about`);
  await visitor.getByRole("heading", { level: 1, name: `About by two ${tag}` }).waitFor();
  await visitor.goto(BASE);
  await visitor.getByRole("heading", { level: 1, name: `Home by one ${tag}` }).waitFor();

  // The second editor's page still holds the old drafts view; publishing nothing is harmless.
  await second.reload();
  await second.getByRole("switch", { name: "Edit mode" }).waitFor();
  assert.equal(await second.getByText("unpublished").count(), 0);
  await second.close();
});

test("a list can be added to, reordered, trimmed and published", async () => {
  await page.goto(`${BASE}/about`);
  const editSwitch = page.getByRole("switch", { name: "Edit mode" });
  await editSwitch.waitFor();
  if ((await editSwitch.getAttribute("aria-checked")) !== "true") await editSwitch.click();
  // Each change is saved on its own; wait for the save and the reload of drafts before the next step.
  const saved = async (action) => {
    const response = page.waitForResponse((r) => r.url().includes("save_site_draft"));
    await action();
    await response;
    await page.waitForLoadState("networkidle");
  };
  const addButton = page.getByRole("button", { name: "Add a highlight" });
  await addButton.waitFor();
  await saved(() => addButton.click());
  await page.getByLabel("Item 1: title").fill(`First ${tag}`);
  await saved(() => page.getByLabel("Item 1: title").blur());
  await saved(() => addButton.click());
  await page.getByLabel("Item 2: title").fill(`Second ${tag}`);
  await saved(() => page.getByLabel("Item 2: title").blur());
  await saved(() => page.getByRole("button", { name: "Move Item 2 up" }).click());
  await page.waitForFunction(
    (want) => document.querySelector('[aria-label="Item 1: title"]')?.value === want,
    `Second ${tag}`,
  );
  await saved(() => addButton.click());
  await page.getByLabel("Item 3: title").fill(`Third ${tag}`);
  await saved(() => page.getByLabel("Item 3: title").blur());
  await saved(() => page.getByRole("button", { name: "Remove Item 3" }).click());
  await page.getByLabel("Item 3: title").waitFor({ state: "detached" });

  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
  await visitor.goto(`${BASE}/about`);
  const shown = await visitor.getByRole("main").locator("ul").first().innerText();
  assert.ok(shown.indexOf(`Second ${tag}`) < shown.indexOf(`First ${tag}`), "reordered");
  assert.ok(!shown.includes(`Third ${tag}`), "removed item is gone");
});

test("an earlier version can be restored from the history", async () => {
  await page.goto(BASE);
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "History" }).click();
  const restore = page.getByRole("button", { name: /^Restore Home, title from/ }).first();
  await restore.waitFor();
  await restore.click();
  await page.getByText("Put back as a draft").waitFor();
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();
  await page.getByRole("button", { name: "Discard all" }).click(); // restoring opens the Changes panel
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
});

test("an admin's project edits and photos wait as a draft until Publish", async () => {
  await page.goto(`${BASE}/projects/${project.slug}`);
  const editSwitch = page.getByRole("switch", { name: "Edit mode" });
  await editSwitch.waitFor();
  if ((await editSwitch.getAttribute("aria-checked")) !== "true") await editSwitch.click();
  const picture = { name: "photo.png", mimeType: "image/png", buffer: PNG };
  const rows = async (table, query) => (await api(`/rest/v1/${table}?${query}`)).json();
  const newTitle = `Draft title ${tag}`;
  const photoCard = page.getByRole("region", { name: "Photos" });

  // Title
  await page.getByRole("button", { name: "Edit title" }).click();
  await page.getByLabel("title").fill(newTitle);
  await page.getByLabel("title").press("Enter");
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();

  // Cover photo
  await page.getByLabel("Description for screen readers").fill(`Cover ${tag}`);
  await photoCard.locator('input[type="file"]').first().setInputFiles(picture);
  await page.getByRole("button", { name: "Replace cover photo" }).waitFor();

  // Gallery: add two, describe one, reorder, remove one
  await photoCard.locator('input[type="file"]').nth(1).setInputFiles(picture);
  await page.getByLabel("Photo 1: description for screen readers").waitFor();
  await photoCard.locator('input[type="file"]').nth(1).setInputFiles(picture);
  await page.getByLabel("Photo 2: description for screen readers").waitFor();
  await page.getByLabel("Photo 2: description for screen readers").fill(`Second ${tag}`);
  await page.getByLabel("Photo 2: caption (optional)").fill(`Caption ${tag}`);
  await page.getByLabel("Photo 2: caption (optional)").blur();
  await page.getByRole("status").filter({ hasText: "Saving" }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Move photo 2 up" }).click();
  await page.waitForFunction(
    (want) => document.querySelector('[aria-label="Photo 1: description for screen readers"]')?.value === want,
    `Second ${tag}`,
  );

  // An empty description is refused, not saved
  await page.getByLabel("Photo 1: description for screen readers").fill("");
  await page.getByLabel("Photo 1: description for screen readers").blur();
  await page.getByText("needs a description").waitFor();

  await page.getByRole("button", { name: "Remove photo 2" }).click();
  await page.getByLabel("Photo 2: description for screen readers").waitFor({ state: "detached" });

  // Nothing is live yet
  let [live] = await rows("projects", `id=eq.${project.id}&select=title,thumbnail_path,thumbnail_alt`);
  assert.equal(live.title, project.title, "the title is still the published one");
  assert.equal(live.thumbnail_path, project.thumbnail_path, "the cover photo is still the published one");
  assert.equal((await rows("project_images", `project_id=eq.${project.id}&select=id`)).length, 0, "no gallery photo is live");
  const [draft] = await rows("record_draft", `row_slug=eq.${project.slug}&select=patch,gallery`);
  assert.equal(draft.patch.title, newTitle);
  assert.equal(draft.gallery.length, 1);
  await visitor.goto(`${BASE}/projects/${project.slug}`);
  await visitor.getByRole("heading", { level: 1 }).waitFor();
  assert.notEqual((await visitor.getByRole("heading", { level: 1 }).textContent())?.trim(), newTitle);
  assert.equal(await visitor.getByRole("main").locator("figure img").count(), project.thumbnail_path ? 1 : 0, "visitors see no new photo (only the live cover, if any)");

  // Publish puts it all live
  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
  [live] = await rows("projects", `id=eq.${project.id}&select=title,thumbnail_path,thumbnail_alt`);
  assert.equal(live.title, newTitle);
  assert.ok(live.thumbnail_path.startsWith(`projects/${project.id}/`));
  assert.equal(live.thumbnail_alt, `Cover ${tag}`);
  const gallery = await rows("project_images", `project_id=eq.${project.id}&select=alt_text,caption,sort_order&order=sort_order`);
  assert.equal(gallery.length, 1);
  assert.equal(gallery[0].alt_text, `Second ${tag}`);
  assert.equal(gallery[0].caption, `Caption ${tag}`);
  assert.equal((await rows("record_draft", `row_slug=eq.${project.slug}&select=row_slug`)).length, 0);

  await visitor.reload();
  await visitor.getByRole("heading", { level: 1, name: newTitle }).waitFor();
  await visitor.getByRole("main").locator("figure img").first().waitFor();
  assert.equal(await visitor.getByRole("main").locator("figure img").count(), 1);
});

test("clicking a photo replaces it as a draft, and an earlier title can be restored from the history", async () => {
  const picture = { name: "photo2.png", mimeType: "image/png", buffer: PNG };
  const rows = async (table, query) => (await api(`/rest/v1/${table}?${query}`)).json();
  await page.goto(`${BASE}/projects/${project.slug}`);
  const editSwitch = page.getByRole("switch", { name: "Edit mode" });
  await editSwitch.waitFor();
  if ((await editSwitch.getAttribute("aria-checked")) !== "true") await editSwitch.click();
  const [liveBefore] = await rows("project_images", `project_id=eq.${project.id}&select=storage_path,alt_text`);

  // The picture in the page grid, not the Photos card
  await page.locator("ul input[type=file]").first().setInputFiles(picture);
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();
  const [draft] = await rows("record_draft", `row_slug=eq.${project.slug}&select=gallery`);
  assert.equal(draft.gallery.length, 1);
  assert.notEqual(draft.gallery[0].path, liveBefore.storage_path, "the draft points at the new file");
  assert.equal(draft.gallery[0].alt_text, liveBefore.alt_text, "the description is kept");
  const [stillLive] = await rows("project_images", `project_id=eq.${project.id}&select=storage_path`);
  assert.equal(stillLive.storage_path, liveBefore.storage_path, "the live photo is unchanged until Publish");

  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
  const [nowLive] = await rows("project_images", `project_id=eq.${project.id}&select=storage_path`);
  assert.equal(nowLive.storage_path, draft.gallery[0].path);

  // History: the title the earlier publish replaced
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: new RegExp(`Restore Project: ${project.slug}`) }).first().click();
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();
  const [restored] = await rows("record_draft", `row_slug=eq.${project.slug}&select=patch`);
  assert.equal(restored.patch.title, project.title);
  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
  const [back] = await rows("projects", `id=eq.${project.id}&select=title`);
  assert.equal(back.title, project.title);

  // History: the photo the replacement kept comes back as a draft, and goes live on Publish
  const [kept] = await rows("record_photo_history", `project_id=eq.${project.id}&select=storage_path`);
  assert.equal(kept.storage_path, liveBefore.storage_path, "the replaced photo is kept");
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: new RegExp(`Restore Photo of ${project.slug}`) }).first().click();
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();
  const [photoDraft] = await rows("record_draft", `row_slug=eq.${project.slug}&select=gallery`);
  assert.ok(photoDraft.gallery.some((g) => g.path === liveBefore.storage_path), "the draft has the old photo back");
  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
  const live = await rows("project_images", `project_id=eq.${project.id}&select=storage_path`);
  assert.ok(live.some((r) => r.storage_path === liveBefore.storage_path), "the old photo is live again");
});

test("a faculty photo is a draft until Publish, and the replaced one can be restored", async () => {
  const picture = { name: "portrait.png", mimeType: "image/png", buffer: PNG };
  const rows = async (table, query) => (await api(`/rest/v1/${table}?${query}`)).json();
  await page.goto(`${BASE}/faculty/${faculty.slug}`);
  const editSwitch = page.getByRole("switch", { name: "Edit mode" });
  await editSwitch.waitFor();
  if ((await editSwitch.getAttribute("aria-checked")) !== "true") await editSwitch.click();

  await page.locator("input[type=file]").first().setInputFiles(picture);
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();
  const [draft] = await rows("record_draft", `row_slug=eq.${faculty.slug}&select=patch`);
  assert.match(draft.patch.photo_path, new RegExp(`^faculty/${faculty.id}/`));
  const [stillLive] = await rows("faculty", `id=eq.${faculty.id}&select=photo_path`);
  assert.equal(stillLive.photo_path, faculty.photo_path, "the live photo is unchanged until Publish");

  await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
  const [nowLive] = await rows("faculty", `id=eq.${faculty.id}&select=photo_path`);
  assert.equal(nowLive.photo_path, draft.patch.photo_path);

  if (faculty.photo_path) {
    const kept = await rows("record_history", `row_slug=eq.${faculty.slug}&select=before`);
    assert.ok(kept.some((r) => r.before.photo_path === faculty.photo_path), "the replaced photo is kept");
    await page.getByRole("button", { name: "History" }).click();
    await page.getByRole("button", { name: new RegExp(`Restore Faculty: ${faculty.slug}`) }).first().click();
    await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();
    await page.getByRole("button", { name: /^Publish \(/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
    await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
    const [back] = await rows("faculty", `id=eq.${faculty.id}&select=photo_path`);
    assert.equal(back.photo_path, faculty.photo_path, "the old photo is live again");
  }
});

const eventTitle = `E2E showcase ${tag}`;
const dayOf = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const longDay = (iso) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

async function startEditing(p) {
  await p.goto(`${BASE}/events`);
  const editSwitch = p.getByRole("switch", { name: "Edit mode" });
  await editSwitch.waitFor();
  if ((await editSwitch.getAttribute("aria-checked")) !== "true") await editSwitch.click();
}

// The list view, narrowed to this run's events.
async function openList(p) {
  await p.getByRole("button", { name: "List", exact: true }).click();
  await p.getByLabel("Search events").fill(tag);
}

test("an admin adds an upcoming event with a pasted AI answer and a past event by hand", async () => {
  await startEditing(page);

  // The answer is wrapped in chat text and a code fence, as chatbots do; nothing is saved by pasting.
  await page.getByRole("button", { name: "Add an event" }).click();
  await page.getByText("Fill in from an AI's answer (optional)").click();
  const answer = { title: eventTitle, date: dayOf(10), last_day: "", starts: "18:00", ends: "", place: "Science Hall", link: "", description: `Pasted ${tag}`, area: "" };
  await page.getByLabel("The AI's answer").fill(`Sure! Here you go:\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\``);
  await page.getByRole("button", { name: "Fill in the form" }).click();
  await page.getByText("Form filled in.").waitFor();
  assert.equal(await page.getByLabel(/^Title/).inputValue(), eventTitle);
  assert.equal(await page.getByLabel(/^Date/).inputValue(), dayOf(10));
  assert.equal(await page.getByLabel(/^Starts/).inputValue(), "18:00");
  assert.equal(await page.getByLabel(/^Place/).inputValue(), "Science Hall");
  const before = await (await api(`/rest/v1/events?title=eq.${encodeURIComponent(eventTitle)}&select=id`)).json();
  assert.equal(before.length, 0, "pasting alone saves nothing");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByRole("button", { name: "Add an event" }).waitFor();
  const [saved] = await (await api(`/rest/v1/events?title=eq.${encodeURIComponent(eventTitle)}&select=place,start_time,description`)).json();
  assert.equal(saved.place, "Science Hall");
  assert.equal(saved.description, `Pasted ${tag}`);

  // Something that is not event details is explained, and the form stays as it was.
  await page.getByRole("button", { name: "Add an event" }).click();
  await page.getByText("Fill in from an AI's answer (optional)").click();
  await page.getByLabel("The AI's answer").fill("I could not find an event in that.");
  await page.getByRole("button", { name: "Fill in the form" }).click();
  await page.getByText("No event details found.").waitFor();
  assert.equal(await page.getByLabel(/^Title/).inputValue(), "");

  await page.getByLabel(/^Title/).fill(`Old ${eventTitle}`);
  await page.getByLabel(/^Date/).fill(dayOf(-10));
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByRole("button", { name: "Add an event" }).waitFor();
  await page.getByText("Saved. It's live now.").waitFor();
  const old = await (await api(`/rest/v1/events?title=eq.${encodeURIComponent(`Old ${eventTitle}`)}&select=id`)).json();
  assert.equal(old.length, 1);
});

test("visitors get a calendar to move around in, with the day's events listed under it", async () => {
  await visitor.goto(`${BASE}/events`);
  const calendarButton = visitor.getByRole("button", { name: "Calendar", exact: true });
  await calendarButton.waitFor();
  assert.equal(await calendarButton.getAttribute("aria-pressed"), "true", "the page opens on the calendar");
  const month = visitor.locator("h2", { hasText: /^[A-Z][a-z]+ \d{4}$/ });
  await month.waitFor();
  const thisMonth = await month.innerText();
  assert.equal(await visitor.locator('[aria-current="date"]').count(), 1, "today is marked");

  await visitor.getByRole("button", { name: /^Next month/ }).click();
  assert.notEqual(await month.innerText(), thisMonth);
  await visitor.getByRole("button", { name: /^Previous month/ }).click();
  assert.equal(await month.innerText(), thisMonth);
  await visitor.getByRole("button", { name: /^Next month/ }).click();
  await visitor.getByRole("button", { name: "Today", exact: true }).click();
  assert.equal(await month.innerText(), thisMonth, "Today comes back to this month");

  // The event is ten days away, which may be in next month's grid.
  const eventDay = dayOf(10);
  const dayButton = visitor.getByRole("button", { name: new RegExp(`^${longDay(eventDay)}, \\d+ events?$`) });
  if (!(await dayButton.count())) await visitor.getByRole("button", { name: /^Next month/ }).click();
  await dayButton.hover();
  const preview = visitor.locator("td", { has: dayButton }).locator(".day-in");
  await preview.waitFor({ state: "visible" });
  assert.match(await preview.innerText(), new RegExp(eventTitle), "pointing at a day previews its events");
  await dayButton.click();
  assert.equal(await dayButton.getAttribute("aria-pressed"), "true");
  const panel = visitor.getByRole("region", { name: longDay(eventDay) });
  await panel.getByRole("heading", { level: 3, name: eventTitle }).waitFor();

  // "Next event" jumps to the first upcoming day.
  await visitor.getByRole("button", { name: "Today", exact: true }).click();
  await visitor.getByRole("button", { name: "Next event", exact: true }).click();
  const chosen = visitor.locator('td button[aria-pressed="true"]');
  assert.match(await chosen.getAttribute("aria-label"), /, \d+ events?$/, "it lands on a day that has an event");
  assert.equal(await visitor.getByRole("button", { name: /^Edit/ }).count(), 0, "visitors get no edit buttons");

  await visitor.goto(BASE);
  await visitor.getByRole("region", { name: "Upcoming events" }).getByRole("heading", { level: 3, name: eventTitle }).waitFor();
});

test("visitors can search and filter the list, and save an upcoming event to their calendar", async () => {
  await visitor.goto(`${BASE}/events`);
  await openList(visitor);
  const upcoming = visitor.getByRole("region", { name: "Upcoming events" });
  const past = visitor.getByRole("region", { name: "Past events" });
  const status = visitor.getByRole("status");
  await upcoming.getByRole("heading", { level: 3, name: eventTitle }).waitFor();
  assert.equal(await past.count(), 0, "past events are hidden until asked for");
  assert.match(await status.innerText(), /^Showing 1 of \d+ events$/);

  const when = visitor.getByLabel("When");
  await when.selectOption({ label: "Upcoming and past" });
  await past.getByRole("heading", { level: 3, name: `Old ${eventTitle}` }).waitFor();
  assert.equal(await upcoming.getByText(`Old ${eventTitle}`).count(), 0, "a past event is not listed as upcoming");
  assert.match(await status.innerText(), /^Showing 2 of \d+ events$/);
  assert.equal(await past.getByRole("button", { name: /Add to calendar/ }).count(), 0, "a past event cannot be added to a calendar");

  await when.selectOption({ label: "Past events" });
  await past.getByRole("heading", { level: 3, name: `Old ${eventTitle}` }).waitFor();
  assert.equal(await upcoming.count(), 0);
  await when.selectOption({ label: "Upcoming" });

  // The header's links open the list already filtered.
  await visitor.goto(`${BASE}/events#past`);
  await visitor.getByRole("region", { name: "Past events" }).getByRole("heading", { level: 3, name: `Old ${eventTitle}` }).waitFor();
  assert.equal(await visitor.getByLabel("When").inputValue(), "past");
  await visitor.goto(`${BASE}/events#upcoming`);
  await visitor.getByRole("region", { name: "Upcoming events" }).getByRole("heading", { level: 3, name: eventTitle }).waitFor();
  assert.equal(await visitor.getByLabel("When").inputValue(), "upcoming");

  // Searching by words in the place or the description, not only the title.
  await visitor.getByLabel("Search events").fill(`Pasted ${tag}`);
  await upcoming.getByRole("heading", { level: 3, name: eventTitle }).waitFor();
  await visitor.getByLabel("Search events").fill(`nothing matches ${tag}`);
  await visitor.getByText("No events match those filters.").waitFor();
  await visitor.getByLabel("Search events").fill(tag);
  await upcoming.getByRole("heading", { level: 3, name: eventTitle }).waitFor();

  const year = visitor.getByLabel("Year");
  await year.selectOption(dayOf(10).slice(0, 4));
  await upcoming.getByRole("heading", { level: 3, name: eventTitle }).waitFor();
  await year.selectOption({ label: "All" });

  // These events are for the whole department, so picking one department leaves none.
  const area = visitor.getByLabel("Related to");
  if ((await area.locator("option").count()) > 1) {
    await area.selectOption({ index: 1 });
    await visitor.getByText("No events match those filters.").waitFor();
    await area.selectOption({ label: "All" });
    await upcoming.getByRole("heading", { level: 3, name: eventTitle }).waitFor();
  }

  const [download] = await Promise.all([
    visitor.waitForEvent("download"),
    upcoming.getByRole("button", { name: `Add to calendar ${eventTitle}`, exact: true }).click(),
  ]);
  assert.equal(download.suggestedFilename(), `e2e-showcase-${tag}.ics`);
  const file = await readFile(await download.path(), "utf8");
  assert.match(file, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(file.includes(`SUMMARY:${eventTitle}`));
  assert.ok(file.includes(`DTSTART;TZID=America/New_York:${dayOf(10).replaceAll("-", "")}T180000`));
  assert.ok(file.includes("LOCATION:Science Hall"));
});

test("an editor's form opens right under the event it is for, and an editor can delete an event", async () => {
  await startEditing(page);
  await openList(page);
  const upcoming = page.getByRole("region", { name: "Upcoming events" });
  const card = upcoming.getByRole("heading", { level: 3, name: eventTitle, exact: true });
  await card.waitFor();

  // Editing swaps the card for its form, in the same place.
  await upcoming.getByRole("button", { name: `Edit ${eventTitle}`, exact: true }).click();
  const form = upcoming.locator("#event-form");
  await form.waitFor();
  assert.equal(await form.getByLabel(/^Title/).inputValue(), eventTitle);
  assert.equal(await card.count(), 0, "the card is replaced by its form");
  await form.getByRole("button", { name: "Cancel" }).click();
  await card.waitFor();
  assert.equal(await form.count(), 0);

  // Copying keeps the card and opens a form beneath it, without the dates.
  await upcoming.getByRole("button", { name: `Copy ${eventTitle} as a new event`, exact: true }).click();
  await form.waitFor();
  assert.equal(await card.count(), 1, "the original stays");
  assert.equal(await form.getByLabel(/^Title/).inputValue(), eventTitle);
  assert.equal(await form.getByLabel(/^Date/).inputValue(), "", "a copy needs its own date");
  assert.equal(await form.getByLabel(/^Place/).inputValue(), "Science Hall");
  const cardBox = await card.boundingBox();
  const formBox = await form.boundingBox();
  assert.ok(formBox.y > cardBox.y, "the form is below the event it was copied from");
  await form.getByRole("button", { name: "Cancel" }).click();

  await upcoming.getByRole("button", { name: `Edit ${eventTitle}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await form.waitFor({ state: "detached" });
  await card.waitFor({ state: "detached" });
  assert.equal(await card.count(), 0, "the deleted event's card does not come back");
  const left = await (await api(`/rest/v1/events?title=eq.${encodeURIComponent(eventTitle)}&select=id`)).json();
  assert.equal(left.length, 0, "the event is gone from the database");
});

test("the Changes panel describes a draft, asks before publishing, and undoes it", async () => {
  await page.goto(BASE);
  const edit = async () => {
    if ((await page.getByRole("switch", { name: "Edit mode" }).getAttribute("aria-checked")) !== "true") {
      await page.getByRole("switch", { name: "Edit mode" }).click();
    }
  };
  await edit();
  await page.getByRole("button", { name: `Edit ${KEY.replace(".", " ")}` }).click();
  await page.getByLabel(KEY.replace(".", " ")).fill(`Card ${tag}`);
  await page.getByLabel(KEY.replace(".", " ")).press("Enter");
  await page.getByRole("button", { name: "Changes 1 unpublished" }).waitFor();

  await page.getByRole("button", { name: "Changes 1 unpublished" }).click();
  const panel = page.getByRole("dialog", { name: "Unpublished changes" });
  await panel.getByText("Home, title", { exact: true }).first().waitFor();
  await panel.getByText(`Card ${tag}`).waitFor();

  await panel.getByRole("button", { name: "Publish…" }).click();
  await page.getByRole("heading", { name: "Publish 1 change?" }).waitFor();
  await page.getByRole("button", { name: "Not yet" }).click();
  await page.getByRole("heading", { name: "Publish 1 change?" }).waitFor({ state: "detached" });

  await panel.getByRole("button", { name: /^Undo/ }).click();
  await page.getByRole("button", { name: /^Changes \d+ unpublished/ }).waitFor({ state: "detached" });
});

test("nothing threw in the browser", () => {
  assert.deepEqual(browserErrors, []);
});
