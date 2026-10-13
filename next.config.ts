import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
  // Cache Components is left off: its request-time rendering hangs on the
  // Cloudflare Workers runtime (OpenNext 1.20). Re-test before enabling.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Makes Cloudflare bindings (Hyperdrive, R2, ...) available to `next dev`.
initOpenNextCloudflareForDev();
