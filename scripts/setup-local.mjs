// Gets a fresh clone ready to work against the local Supabase stack (npm run db:start first):
//   - creates supabase/functions/.env from the example, for `npm run functions:serve`
//   - creates .env.local with the local URL and publishable key
// It never overwrites a file that exists, and it only reads the publishable key, never a secret one.
//
//   npm run setup:local
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";

const functionsEnv = "supabase/functions/.env";
if (existsSync(functionsEnv)) {
  console.log(`${functionsEnv} already exists, left as it is.`);
} else {
  copyFileSync("supabase/functions/.env.example", functionsEnv);
  console.log(`Created ${functionsEnv} (the defaults work locally).`);
}

let status;
try {
  status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.error("\nThe local database isn't running. Start Docker, run `npm run db:start`, then run this again.");
  process.exit(1);
}
const value = (name) => status.match(new RegExp(`^${name}="?([^"\r\n]+)"?`, "m"))?.[1];
const url = value("API_URL");
const key = value("PUBLISHABLE_KEY");
if (!url || !key) {
  console.error("\nCouldn't read the local URL and key from `npx supabase status`. Is the stack fully started?");
  process.exit(1);
}

if (existsSync(".env.local")) {
  console.log(`\n.env.local already exists, left as it is. For the local database it needs:\n  VITE_SUPABASE_URL=${url}\n  VITE_SUPABASE_PUBLISHABLE_KEY=${key}`);
} else {
  writeFileSync(".env.local", `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\nVITE_TURNSTILE_SITE_KEY=\n`);
  console.log("Created .env.local for the local database.");
}
console.log("\nNext: `npm run dev`. Sign in as admin@franciscan.edu / password123. For the edge functions, run `npm run functions:serve` in a second terminal.");
