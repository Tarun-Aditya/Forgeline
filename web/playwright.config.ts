import { defineConfig } from "@playwright/test";

// Real end-to-end run: needs E2E_REPO, a git repo that already has the factory installed (see e2e/README.md).
// It starts a real `claude` run through the web app, so it uses the Claude subscription and takes minutes.
const PORT = 3100;
const repo = process.env.E2E_REPO;
if (!repo) throw new Error("Set E2E_REPO to a git repo with the factory installed.");

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/results",
  timeout: 25 * 60_000,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    video: { mode: "on", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    trace: "on",
  },
  // A separate server on its own build dir, so it can run beside `npm run dev`.
  webServer: {
    command: `NEXT_DIST_DIR=.next-e2e FORGELINE_REPOS='${repo}' npx next dev -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
