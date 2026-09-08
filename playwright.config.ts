import { defineConfig } from "@playwright/test";
import { qaEnvironment, QA_ORIGIN } from "./scripts/qa-environment";

const baseURL = QA_ORIGIN;
const localFixtureEnv = qaEnvironment();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    browserName: "chromium",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: false,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: "off",
    trace: "off",
  },
  projects: [320, 375, 390, 414, 768, 1440].map((width) => ({
    name: `chromium-${width}`,
    // Layout at every width; full interactions and axe at phone/desktop; HTTP checks once.
    grep: width === 1440 ? /@responsive|@a11y|@interaction|@http/
      : width === 390 ? /@responsive|@a11y|@interaction/ : /@responsive/,
    use: {
      viewport: { width, height: width >= 768 ? 1000 : 844 },
      screenshot: width === 390 || width === 1440 ? "only-on-failure" as const : "off" as const,
      trace: width === 390 || width === 1440 ? "retain-on-failure" as const : "off" as const,
    },
  })),
  webServer: {
    command: "node ./node_modules/next/dist/bin/next start --hostname localhost --port 3100",
    cwd: process.cwd(),
    url: baseURL,
    env: localFixtureEnv,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});