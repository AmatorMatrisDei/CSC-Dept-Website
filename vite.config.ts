import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { policyHtml, privacy, terms } from "./src/lib/policies.ts";

// Writes the privacy and terms pages as plain HTML too, so they can be read without JavaScript
// (see src/lib/policies.ts). Each is the built index.html with the policy already inside the page,
// and Cloudflare Pages serves privacy.html at /privacy. The site's script then takes over as usual.
function plainPolicies(): Plugin {
  let outDir = "dist";
  return {
    name: "plain-policies",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const shell = readFileSync(resolve(outDir, "index.html"), "utf8");
      for (const policy of [privacy, terms]) {
        const page = shell
          .replace(/<title>[^<]*<\/title>/, `<title>${policy.title} | Engineering &amp; Computing</title>`)
          .replace('<div id="root"></div>', () => `<div id="root">\n${policyHtml(policy)}\n</div>`);
        if (!page.includes(`<div id="root">\n<main`)) throw new Error(`plain-policies: no empty #root in index.html for ${policy.path}`);
        writeFileSync(resolve(outDir, `${policy.path}.html`), page);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), plainPolicies()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
