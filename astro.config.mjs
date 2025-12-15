// astro.config.mjs
import { defineConfig } from "astro/config";
import sanity from "@sanity/astro";

import react from "@astrojs/react";

export default defineConfig({
  integrations: [
    sanity({
      projectId: "zo1houh0", // From sanity.cli.ts
      dataset: "production",
      useCdn: false, // Use false for authenticated requests
      apiVersion: "2024-03-15",
    }),
    react(),
  ]
});