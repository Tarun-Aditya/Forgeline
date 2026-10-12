import { defineConfig } from "@playwright/test";
import path from "node:path";
import { DATA, FAKE_LOG, FIXTURE, PROJECTS } from "./e2e/fixture.ts";

// Two kinds of test:
//  - "fixture": offline and free. A throwaway repo and a fake `claude`, on port 3100. Always runs.
//  - "real": a real `claude` job in a real repo, on port 3101. Only runs when E2E_REPO is set (see e2e/README.md).
const real = process.env.E2E_REPO;
const FAKE = path.join(process.cwd(), "e2e", "fake-claude.mjs");
const server = (port: number, repos: string, env = "") => ({
  // Own build dir, so these run beside `npm run dev`.
  command: `NEXT_DIST_DIR=.next-e2e-${port} ${env} FORGELINE_REPOS='${repos}' npx next dev -H 127.0.0.1 -p ${port}`,
  url: `http://127.0.0.1:${port}`,
  reuseExistingServer: false,
  timeout: 120_000,
});

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/results",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  use: {
    video: { mode: "on", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    trace: "on",
  },
  projects: [
    { name: "fixture", testMatch: ["answer-question.spec.ts", "agents-replay.spec.ts", "terminal-sessions.spec.ts"], use: { baseURL: "http://127.0.0.1:3100" } },
    ...(real ? [{ name: "real", testMatch: "feature-to-spec.spec.ts", timeout: 25 * 60_000, use: { baseURL: "http://127.0.0.1:3101" } }] : []),
  ],
  webServer: [
    server(3100, FIXTURE, `FORGELINE_WEB_DATA='${DATA}' CLAUDE_BIN='${FAKE}' FAKE_CLAUDE_LOG='${FAKE_LOG}' CLAUDE_PROJECTS_DIR='${PROJECTS}'`),
    ...(real ? [server(3101, real)] : []),
  ],
});
