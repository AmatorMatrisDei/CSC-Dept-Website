import PolicyPage from "@/components/PolicyPage";
import { privacy } from "@/lib/policies";

// What the site collects, who sees it and how to remove it. Google requires it before "Continue
// with Google" can be published. The wording is in src/lib/policies.ts.
export default function Privacy() {
  return <PolicyPage policy={privacy} />;
}
