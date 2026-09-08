import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { qaEnvironment, QA_ORIGIN } from "./qa-environment";

const mode = process.argv[2];
if (mode !== "build" && mode !== "start") throw new Error("Use npm run build:qa or npm run preview:qa.");
const args = mode === "build" ? ["build"] : ["start", "--hostname", "localhost", "--port", "3100"];
console.log(`Local synthetic QA ${mode}: ${QA_ORIGIN}. No database, contacts or analytics.`);
const result = spawnSync(process.execPath, [resolve("node_modules/next/dist/bin/next"), ...args], {
  cwd: process.cwd(), stdio: "inherit", env: { ...process.env, ...qaEnvironment() },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;