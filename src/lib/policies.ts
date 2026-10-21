import { paragraphs } from "./format.ts";

// The wording of the privacy and terms pages. The site draws it (src/components/PolicyPage.tsx),
// and the build also writes it as plain HTML, privacy.html and terms.html (see vite.config.ts), so
// the policies can be read without JavaScript, as Google's sign-in review reads them. Cloudflare
// serves those files at /privacy and /terms, and the site takes over the page once it loads.
//
// The privacy page must match what the site really does: update it with any change to accounts,
// profiles, sign-in or the services it lists, and change `updated` with every edit. Wording changes
// go through a pull request, so there is a record of each version.

export type PolicySection = { id: string; title: string; body: string };

export type Policy = {
  path: "privacy" | "terms";
  title: string;
  updated: string;
  intro: string;
  sections: PolicySection[]; // paragraphs are separated by blank lines
};

export const privacy: Policy = {
  path: "privacy",
  title: "Privacy",
  updated: "Last updated October 21, 2026",
  intro:
    "This website is run for Franciscan University's Department of Engineering and Computing by the department's student web team. This page explains what the site collects, why, who can see it, and how to have it removed.",
  sections: [
    {
      id: "collect",
      title: "What we collect",
      body: `When you create an account, we keep your name, your university email address and a password. Passwords are handled by our sign-in service and stored only in scrambled (hashed) form, so nobody on the team can see yours. If you sign in with Google or GitHub instead, see "Signing in with Google or GitHub" below for what that service sends us.

If you fill in your profile, we keep what you enter: your major, class year, headline, background, skills, clubs and roles, links (such as LinkedIn, GitHub or a personal website), a photo, and a contact email address and phone number.

If you submit projects or internships, we keep their details: titles, descriptions, dates, photos, team members and advisors. If you use the degree planner while signed in, we keep your program, the year you started, your plan and the courses you mark as completed. If you aren't signed in, the planner saves nothing.

We also keep a record of the permissions you give (for example, to be listed in the directory), of each submission and the reviewer's decision, and of changes made by reviewers and site admins.`,
    },
    {
      id: "public",
      title: "What appears on the site",
      body: `Nothing you submit appears on the site until a reviewer approves it. Your profile is listed only if you ask to be added and agree to be listed, and your photo, email address and phone number appear only if you separately agree to show each one. You can withdraw any of these permissions at any time from your account page.

Your degree plan is never shown to anyone else.`,
    },
    {
      id: "access",
      title: "Who can see what",
      body: `Visitors see approved projects and the profiles of students who agreed to be listed. Reviewers (teaching assistants and faculty) and site admins can also see submissions waiting for review, so they can approve them. Site admins can see the email address each account signs in with, so they can manage who reviews.

When something is submitted, the reviewers' group chat on GroupMe gets a short notice saying what kind of submission it is and, for a project or internship, its title. It never includes your name or contact details.`,
    },
    {
      id: "google",
      title: "Signing in with Google or GitHub",
      body: `When you choose "Continue with Google" or "Continue with GitHub", we ask that service only for your basic profile, and it sends us your name, email address, account ID and the link to your profile picture. We don't ask for, and can't see, anything else in that account, such as your email, files, contacts or code.

We use your email address to sign you in and to confirm that it is a Franciscan University address, and your name to start your profile, which you can change. We don't use the account ID or the picture link. All four are stored with your account in Supabase.

We don't sell this information, share it with anyone, or use it for advertising. Your name appears on the site only if you are listed in the directory or confirmed on a project, and your sign-in email address is seen only by site admins. It is deleted when your account is deleted (see "Removing your information" below).

Our use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.`,
    },
    {
      id: "services",
      title: "Services we use",
      body: `Supabase stores the database, accounts and photos, in the United States. Cloudflare hosts the website. Google Firebase sends account verification and password-reset emails, so it receives your email address. Google and GitHub sign you in if you choose them. GroupMe carries the reviewer notices described above.

We don't use advertising, analytics or tracking tools, and we don't sell or share your information with anyone else.`,
    },
    {
      id: "browser",
      title: "Your browser",
      body: `The site stores two things in your browser: your sign-in session, so you stay signed in, and your choice of light or dark mode. Nothing is used to track you on other sites.`,
    },
    {
      id: "removal",
      title: "Removing your information",
      body: `To leave the student directory, use "Remove me from the directory" on your account page. Your profile is hidden at once, and a reviewer then clears it.

To delete your account entirely, email franciscan.eac@gmail.com from your university address. We'll delete your account, profile, place on projects, internships, submissions and saved plans. Projects you worked on with others stay on the site without you. The record of permissions you gave and of reviewers' decisions is kept as the site's audit trail.`,
    },
    {
      id: "contact",
      title: "Questions and changes",
      body: `Questions or requests about your information: franciscan.eac@gmail.com. If this page changes, the date at the top changes too.`,
    },
  ],
};

export const terms: Policy = {
  path: "terms",
  title: "Terms of use",
  updated: "Last updated October 20, 2026",
  intro:
    "This website showcases the work of students and faculty in Franciscan University's Department of Engineering and Computing. It is built and run by the department's student web team. By creating an account or submitting anything, you agree to these terms.",
  sections: [
    {
      id: "accounts",
      title: "Accounts",
      body: `Accounts are for current Franciscan University students, faculty and staff. Use your own name and university email address, keep your password to yourself, and don't share your account.`,
    },
    {
      id: "submissions",
      title: "What you submit",
      body: `Submit only information that is accurate and that you have the right to share: your own work, or work your team has agreed to show. Don't post confidential or proprietary information, or personal information about other people, such as other students' grades or contact details.

Reviewers may edit, return or decline submissions, and site admins may remove anything that breaks these terms.`,
    },
    {
      id: "ownership",
      title: "Your work",
      body: `You keep ownership of what you submit. By submitting it, you give the department permission to show it on this site.`,
    },
    {
      id: "planner",
      title: "The degree planner",
      body: `The planner is a planning aid built from the university catalog. It is not an official record, and it doesn't replace your academic advisor or the Registrar.`,
    },
    {
      id: "warranty",
      title: "No guarantees",
      body: `The site is a student-built project. We do our best to keep it accurate and available, but we can't promise it always will be.`,
    },
    {
      id: "contact",
      title: "Questions and changes",
      body: `We may update these terms; the date at the top shows when. Questions: franciscan.eac@gmail.com.`,
    },
  ],
};

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The plain-HTML copy of a policy, for the build: the page's own structure and classes, inside the
// site's usual main area, with links to the home page and both policies.
export function policyHtml(policy: Policy): string {
  const paras = (text: string) => paragraphs(text).map((p) => `<p>${escape(p)}</p>`).join("");
  const sections = policy.sections.map(
    (s) => `<section class="flex flex-col gap-3"><h2 class="text-2xl font-semibold">${escape(s.title)}</h2>${paras(s.body)}</section>`,
  );
  return [
    `<main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">`,
    `<article class="flex max-w-3xl flex-col gap-8">`,
    `<header class="flex flex-col gap-3"><h1 class="text-3xl font-semibold">${escape(policy.title)}</h1>`,
    `<p class="text-sm text-muted">${escape(policy.updated)}</p>${paras(policy.intro)}</header>`,
    ...sections,
    `<p><a class="underline" href="/">Engineering &amp; Computing</a> · <a class="underline" href="/privacy">Privacy</a> · <a class="underline" href="/terms">Terms of use</a></p>`,
    `</article></main>`,
  ].join("\n");
}
