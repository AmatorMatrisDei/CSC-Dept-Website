import PolicyPage from "@/components/PolicyPage";

// What the site collects, who sees it and how to remove it. Google requires this page before the
// "Continue with Google" sign-in can be published, and it must match what the site really does:
// update it with any change to accounts, profiles, sign-in or the services listed here.
const sections = [
  {
    id: "collect",
    title: "What we collect",
    body: `When you create an account, we keep your name, your university email address and a password. Passwords are handled by our sign-in service and stored only in scrambled (hashed) form, so nobody on the team can see yours. If you sign in with Google or GitHub instead, we receive your name and email address from that service and nothing else from your account there.

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
    body: `Visitors see approved projects and the profiles of students who agreed to be listed. Reviewers (teaching assistants and faculty) and site admins can also see submissions waiting for review, so they can approve them.

When something is submitted, the reviewers' group chat on GroupMe gets a short notice saying what kind of submission it is and, for a project or internship, its title. It never includes your name or contact details.`,
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
];

export default function Privacy() {
  return (
    <PolicyPage
      id="privacy"
      title="Privacy"
      updated="Last updated October 20, 2026"
      intro="This website is run for Franciscan University's Department of Engineering and Computing by the department's student web team. This page explains what the site collects, why, who can see it, and how to have it removed."
      sections={sections}
    />
  );
}
