import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const systemChromium = ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(
  (p) => fs.existsSync(p)
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    launchOptions: {
      ...(systemChromium ? { executablePath: systemChromium } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  webServer: {
    command: "ALLOW_TEST_HEADERS=1 npm run start || ALLOW_TEST_HEADERS=1 npm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      ALLOW_TEST_HEADERS: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
