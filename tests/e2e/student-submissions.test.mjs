// The student submission forms and the review queue, end to end in a real browser: a student
// signs up, asks to be added, submits a project and an internship; a reviewer approves, sends
// back and approves again; a teammate confirms; the public pages change only after review.
//
// Needs the local stack (`npm run db:start`) and Google Chrome. Run with `npm run test:e2e`.
// It starts its own dev server on port 5174 and removes what it created afterwards.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = JSON.parse(
  execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
);
const BASE = "http://localhost:5174";

// The secret key, for setup and cleanup the site itself can't do.
const admin = (path, init = {}) =>
  fetch(API_URL + path, { ...init, headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" } });

// A PNG larger than the site's 2000px limit, so the resize step is exercised.
function makePng(width, height) {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * row + 1 + x * 3;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = 160;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const bigPhoto = { name: "team.png", mimeType: "image/png", buffer: makePng(3000, 2000) };
const smallPhoto = { name: "robot.png", mimeType: "image/png", buffer: makePng(900, 600) };
const heic = { name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("not a photo Chrome can read") };

const tag = randomUUID().slice(0, 6);
const student = { name: `E2E Student ${tag}`, email: `e2e-${tag}@franciscan.edu`, password: "password-e2e-1" };
const projectTitle = `E2E Delivery Robot ${tag}`;

let vite;
let browser;
let context;
let page;
const browserErrors = [];

before(async () => {
  vite = spawn("npx", ["vite", "--port", "5174", "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
});

after(async () => {
  await browser?.close();
  vite?.kill();
  const people = await (await admin(`/rest/v1/profiles?name=eq.${encodeURIComponent(student.name)}&select=id`)).json();
  await admin(`/rest/v1/projects?title=eq.${encodeURIComponent(projectTitle)}`, { method: "DELETE" });
  await admin(`/rest/v1/internships?company=eq.${encodeURIComponent(`Self Review Corp ${tag}`)}`, { method: "DELETE" });
  for (const { id } of people) {
    for (const folder of [`avatars/${id}`, `submissions/${id}`]) {
      const files = await (await admin("/storage/v1/object/list/media", { method: "POST", body: JSON.stringify({ prefix: folder }) })).json();
      if (Array.isArray(files) && files.length) {
        await admin("/storage/v1/object/media", { method: "DELETE", body: JSON.stringify({ prefixes: files.map((f) => `${folder}/${f.name}`) }) });
      }
    }
    await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  }
});

const flash = (text) => page.getByRole("status").filter({ hasText: text }).waitFor();

async function signIn(email, password) {
  await page.goto(`${BASE}/account/sign-in`);
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${BASE}/account`);
}

async function signOut() {
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("link", { name: "Sign in" }).waitFor();
}

async function openSubmission(text) {
  await page.goto(`${BASE}/review`);
  await page.getByRole("listitem").filter({ hasText: text }).filter({ hasText: student.name }).getByRole("link").click();
  await page.waitForURL(/\/review\/[0-9a-f-]{36}$/);
  await page.getByRole("heading", { level: 1, name: text }).waitFor();
}

test("a student creates an account from the request page", async () => {
  await page.goto(`${BASE}/students/request`);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill(student.name);
  await page.getByLabel("University email").fill(student.email);
  await page.getByLabel("Password").fill(student.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/account/profile`);
});

test("a new account is asked to verify its email address before adding anything", async () => {
  const reminder = page.getByRole("status").filter({ hasText: "Verify your email address" });
  await reminder.waitFor();
  await page.getByRole("link", { name: "Verify it now" }).click();
  await page.getByRole("heading", { level: 1, name: "Verify your email address" }).waitFor();
  await page.getByRole("button", { name: "Send the email" }).waitFor();
  // Stands in for clicking the emailed link; the verify-email function's unit tests cover the email.
  const [{ id }] = await (await admin(`/rest/v1/profiles?name=eq.${encodeURIComponent(student.name)}&select=id`)).json();
  const marked = await admin("/rest/v1/rpc/mark_account_verified", { method: "POST", body: JSON.stringify({ account: id, how: "admin" }) });
  assert.equal(marked.status, 204);
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "Your email address is verified" }).waitFor();
  await page.goto(`${BASE}/account/profile`);
  await page.getByLabel("List me in the student directory").waitFor();
  assert.equal(await reminder.count(), 0);
});

test("other email addresses are refused", async () => {
  const visitor = await browser.newContext();
  const p = await visitor.newPage();
  await p.goto(`${BASE}/account/sign-in?mode=sign-up`);
  await p.getByRole("button", { name: "Continue with Google" }).waitFor();
  await p.getByLabel("Your name").fill("Outsider");
  await p.getByLabel("University email").fill(`outsider-${tag}@gmail.com`);
  await p.getByLabel("Password").fill("password-e2e-1");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("alert").filter({ hasText: "Franciscan University email" }).waitFor();
  await visitor.close();
});

test("asking to be added waits for the directory permission, which takes effect at once", async () => {
  assert.ok(await page.getByRole("button", { name: "Ask to be added" }).isDisabled());
  await page.getByLabel("List me in the student directory").check();
  await page.getByLabel("Show my photo").check();
  await page.getByRole("button", { name: "Choose a photo" }).waitFor();
  assert.ok(await page.getByRole("button", { name: "Ask to be added" }).isEnabled());
});

test("the profile, with a photo, is sent for review", async () => {
  await page.getByLabel("Headline").fill("Software Engineering, Class of 2027");
  await page.getByLabel("Major").fill("Software Engineering");
  await page.getByLabel("Class year").fill("2027");
  await page.getByLabel("Background").fill("I like building robots.\n\nAnd web apps.");
  await page.getByLabel("Skills").fill("Python, ROS, React");
  await page.getByLabel("Clubs and roles").fill("ACM, treasurer\nRobotics Club");
  await page.locator('input[type="file"]').first().setInputFiles(bigPhoto);
  await page.locator('img[alt^="Your new photo"]').waitFor();
  await page.getByRole("button", { name: "Ask to be added" }).click();
  await page.waitForURL(`${BASE}/account`);
  await flash("Your request to be added was sent for review.");
});

test("a photo the browser can't read gets a clear message", async () => {
  await page.goto(`${BASE}/account/projects/new`);
  await page.getByLabel("Title").fill(projectTitle);
  await page.getByLabel("Summary").fill("A small robot that carries packages across campus.");
  await page.getByLabel("Description").fill("The problem.\n\nWhat we built.");
  await page.getByLabel("Category").selectOption({ label: "Capstone" });
  await page.getByLabel("Sub-department").selectOption({ label: "Mechanical Engineering" });
  await page.getByLabel("Tags").fill("Robotics, e2e");
  await page.getByLabel("Date started").fill("2026-09-01");
  await page.getByLabel("Role").nth(0).fill("Lead");
  await page.getByRole("button", { name: "Add a team member" }).click();
  await page.getByLabel("Member 2").selectOption({ label: "Sam Student" });
  await page.getByLabel("Role").nth(1).fill("Tester");
  await page.getByRole("button", { name: "Add a team member" }).click();
  await page.getByLabel("Member 3").selectOption({ label: "Someone who isn't a student (mentor, partner…)" });
  await page.getByLabel("Their name").fill("Outside Mentor");
  await page.getByLabel("Role").nth(2).fill("Mentor");
  await page.getByLabel("Dr. Pat Faculty").check();
  await page.getByLabel("Contact email").fill("faculty@franciscan.edu");
  await page.locator('input[type="file"]:not([multiple])').setInputFiles(heic);
  await page.getByLabel("Thumbnail alt text").fill("The robot on the library walkway.");
  await page.getByRole("button", { name: "Send for review" }).click();
  await page.getByRole("alert").filter({ hasText: "Couldn't read that photo" }).waitFor();
});

test("the project, with a thumbnail and gallery, is sent for review", async () => {
  await page.locator('input[type="file"]:not([multiple])').setInputFiles(smallPhoto);
  await page.locator('input[type="file"][multiple]').setInputFiles([smallPhoto, bigPhoto]);
  await page.getByLabel("Photo 1: alt text").fill("The robot on its first test run.");
  await page.getByLabel("Photo 2: alt text").fill("The team with the robot at demo day.");
  await page.getByRole("button", { name: "Send for review" }).click();
  await page.waitForURL(`${BASE}/account`);
  await flash("Your project was sent for review.");
});

test("an internship is sent for review", async () => {
  await page.goto(`${BASE}/account/internships/new`);
  await page.getByLabel("Company").fill("Example Corp");
  await page.getByLabel("Term").fill("Summer 2026");
  await page.getByLabel("What you worked on").fill("Built internal tools.");
  await page.getByRole("button", { name: "Send for review" }).click();
  await flash("Your internship was sent for review.");
  const submissions = page.locator('section[aria-labelledby="submissions"]');
  assert.equal(await submissions.getByText("Waiting for review", { exact: true }).count(), 3);
});

test("nothing is public before review", async () => {
  await page.goto(`${BASE}/projects`);
  await page.getByText(/Showing \d+ of \d+ projects/).waitFor();
  assert.equal(await page.getByText(projectTitle).count(), 0);
  await signOut();
});

test("a reviewer approves the profile and internship and sends the project back with a note", async () => {
  await signIn("reviewer@franciscan.edu", "password123");
  await openSubmission("Request to be added to the directory");
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await flash("Approved: Request to be added to the directory.");

  await openSubmission(`New project: ${projectTitle}`);
  await page.getByRole("button", { name: "Ask for changes" }).click();
  await page.getByRole("alert").filter({ hasText: "Add a note" }).waitFor();
  await page.getByLabel("Note to the student").fill("Please add a link to your poster.");
  await page.getByRole("button", { name: "Ask for changes" }).click();
  await flash("Changes requested");

  await openSubmission("New internship: Example Corp");
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await flash("Approved: New internship: Example Corp.");
  await signOut();
});

test("the student edits the returned project and sends it back", async () => {
  await signIn(student.email, student.password);
  await page.getByText("Please add a link to your poster.").first().waitFor();
  await page.getByRole("link", { name: "Edit and send back" }).first().click();
  assert.equal(await page.getByLabel("Title").inputValue(), projectTitle);
  assert.equal(await page.getByLabel("Photo 2: alt text").inputValue(), "The team with the robot at demo day.");
  await page.getByLabel("Poster").fill("https://example.org/poster.pdf");
  await page.getByRole("button", { name: "Send back for review" }).click();
  await flash("Your project was sent for review.");
  await signOut();
});

let projectUrl;
test("once approved, the project is public with resized photos and only confirmed people", async () => {
  await signIn("reviewer@franciscan.edu", "password123");
  await openSubmission(`New project: ${projectTitle}`);
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await flash(`Approved: New project: ${projectTitle}.`);

  await page.goto(`${BASE}/projects`);
  await page.getByRole("link", { name: projectTitle }).click();
  await page.getByRole("heading", { level: 1, name: projectTitle }).waitFor();
  projectUrl = page.url();
  const main = page.locator("main");
  await main.getByText(student.name).first().waitFor();
  await main.getByText("Outside Mentor").first().waitFor();
  assert.equal(await main.getByText("Sam Student").count(), 0, "teammates appear only after confirming");
  const gallery = main.locator('img[alt="The team with the robot at demo day."]');
  await gallery.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("main img")].every((img) => img.complete));
  const width = await gallery.evaluate((img) => img.naturalWidth);
  assert.equal(width, 2000, "a 3000px photo is stored at 2000px");
  await signOut();
});

test("the teammate confirms and then appears on the project", async () => {
  await signIn("student1@franciscan.edu", "password123");
  await page.getByText(`You were added to ${projectTitle}`).waitFor();
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByText(`You were added to ${projectTitle}`).waitFor({ state: "detached" });
  await page.goto(projectUrl);
  await page.locator("main").getByText("Sam Student").first().waitFor();
  await signOut();
});

test("a profile edit shows the reviewer exactly what changed", async () => {
  await signIn(student.email, student.password);
  await page.getByRole("link", { name: "View your public page" }).click();
  await page.getByText("Software Engineering, Class of 2027").waitFor();
  await page.goto(`${BASE}/account/profile`);
  await page.getByLabel("Headline").fill("Software Engineering, Class of 2027 · Robotics");
  await page.getByRole("button", { name: "Send changes for review" }).click();
  await flash("Your profile changes were sent for review.");
  await signOut();

  await signIn("reviewer@franciscan.edu", "password123");
  await openSubmission("Profile changes");
  const changed = page.locator("section[aria-label='Proposed changes'] > div").filter({ hasText: "Changed" });
  assert.equal(await changed.count(), 1);
  await changed.getByText("Software Engineering, Class of 2027 · Robotics").waitFor();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await flash("Approved: Profile changes.");
  await signOut();
});

test("asking to be removed hides the student at once", async () => {
  await signIn(student.email, student.password);
  await page.getByRole("button", { name: "Remove me from the directory" }).click();
  await page.getByText("You asked to be removed.").waitFor();
  await page.goto(projectUrl);
  await page.locator("main").getByText("Outside Mentor").first().waitFor();
  assert.equal(await page.locator("main").getByText(student.name).count(), 0);
});

test("a reviewer can approve their own submission", async () => {
  await signOut();
  await signIn("reviewer@franciscan.edu", "password123");
  await page.goto(`${BASE}/account/internships/new`);
  await page.getByLabel("Company").fill(`Self Review Corp ${tag}`);
  await page.getByRole("button", { name: "Send for review" }).click();
  await flash("Your internship was sent for review.");
  await page.goto(`${BASE}/review`);
  await page.getByRole("listitem").filter({ hasText: `Self Review Corp ${tag}` }).getByRole("link").click();
  await page.getByText("This is your own submission.").waitFor();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await flash(`Approved: New internship: Self Review Corp ${tag}.`);
});

test("the forms fit a phone screen", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/account/projects/new`);
  await page.getByLabel("Title").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `the page is ${overflow}px wider than the screen`);
  assert.deepEqual(browserErrors, []);
});
