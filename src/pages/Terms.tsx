import PolicyPage from "@/components/PolicyPage";

// The rules for using the site and its accounts. Linked from the footer and the sign-in page, and
// from Google's sign-in screen.
const sections = [
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
];

export default function Terms() {
  return (
    <PolicyPage
      id="terms"
      title="Terms of use"
      updated="Last updated October 20, 2026"
      intro="This website showcases the work of students and faculty in Franciscan University's Department of Engineering and Computing. It is built and run by the department's student web team. By creating an account or submitting anything, you agree to these terms."
      sections={sections}
    />
  );
}
