import { defineConfig } from "@playwright/test";
import { INTEGRATION_ORIGIN, INTEGRATION_WIDTHS, integrationEnvironment } from "./tests/integration/fixtures";

// The parent owns local Supabase, migrations, identities and the production
// build. Never build, seed, reset, load an env file, or reuse another server here.
integrationEnvironment();
// Playwright otherwise takes an automatic accessibility snapshot on failure
// even with screenshot/trace/video off. That can contain populated login fields.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/admin-workflow.spec.ts",
  outputDir: "./test-results/integration",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  forbidOnly: true,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  // No HTML/JSON report, state file, HAR, trace, video or automatic screenshot
  // containing credentials, private editor content, Auth responses or cookies.
  reporter: [["list", { printSteps: true }]],
  use: {
    baseURL: INTEGRATION_ORIGIN,
    browserName: "chromium",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    acceptDownloads: false,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: INTEGRATION_WIDTHS.map((width, index) => ({
    name: `integration-${width}`,
    // Dependencies also prevent overlapping Chapra lifecycles if a caller
    // selects a later project. Runtime guards reject a workers/retries override.
    ...(index > 0 ? { dependencies: [`integration-${INTEGRATION_WIDTHS[index - 1]}`] } : {}),
    use: { viewport: { width, height: width >= 768 ? 1000 : 844 } },
  })),
  webServer: {
    command: "node ./node_modules/next/dist/bin/next start --hostname localhost --port 3200",
    cwd: __dirname,
    url: `${INTEGRATION_ORIGIN}/admin/login`,
    // Keep every supplied value, including real local Auth/Storage keys. This
    // intentionally does not use qaEnvironment() or SHAGUN_TEST_FIXTURES=true.
    env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "ignore",
    stderr: "ignore",
  },
});