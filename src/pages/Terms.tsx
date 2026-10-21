import PolicyPage from "@/components/PolicyPage";
import { terms } from "@/lib/policies";

// The rules for using the site and its accounts. The wording is in src/lib/policies.ts.
export default function Terms() {
  return <PolicyPage policy={terms} />;
}
