import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "node scripts/serve-example.mjs",
    url: "http://127.0.0.1:4173",
    timeout: 15000,
  },
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: { browserName: "chromium", headless: true },
});
