# Web changelog

What changed in `web/`, newest first. Each item is one commit on `main`.

## 2026-10-12

**Show it, and show it fast**
- Agents view: the animated flow, replay of a finished job, a Timeline view and a Compare view.
- Hand-off labels on the lines ("spec: 13 acceptance criteria", reviewer verdicts) read from the job files.
- Plain-language action pills ("Editing index.js", "Running tests"); retried tool errors are a quiet line.
- Estimated cost per agent on the flow, in the Agents header and in Metrics.
- Code changes (diff and the builder's checks) in the job dialog.
- Updates are pushed over server-sent events instead of polled: about 3 requests in 20 seconds idle,
  down from about 30, and a new job shows up in about 0.2 seconds.

**Run more, miss less**
- Several runs at once (`POST /api/runs`, a run list in the side panel, per-job locking).
- "Starting a new job" cards until the agent has created the job.
- Alerts (sound and notification) and a counted tab title; keyboard shortcuts.
- Repo notes for a dirty checkout, wrong branch, missing docs and no verify commands.
- The orchestrator's closing message on the job card, and a one-click "Rebase onto main".
- Resume button for a job with no agent running.

**Fixes**
- The Activity tab failed on Python 3.9 (timestamps had four fractional digits); evals added.
- Buttons now lock after one click and say an agent is working; polling no longer shows the previous
  file or job while the next loads.
- Board columns that are empty are narrow, so Merged is no longer off-screen.
- A build was killed after 10 minutes by `claude -p`'s background-agent limit; runs now wait.
- An agent that never logged a stop, or a merged job, no longer shows as live or running.

**Look and feel**
- Light and dark themes with an orange accent; a phone layout with a "New task" sheet.

**Tests**
- Unit tests for the lane, hand-off, cost, diff, alert, repo-check and change-watch logic.
- Playwright tests with video: an offline pair (agent question, Agents replay) using a fake `claude`,
  and an opt-in real-claude test (`E2E_REPO`).

Also merged from the factory itself: job 003, agent questions on the job card.
