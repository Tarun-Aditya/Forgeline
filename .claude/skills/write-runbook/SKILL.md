---
name: write-runbook
description: Write an operational runbook for a recurring failure or manual procedure, in the format the maintain loop's runbooks.json and a human on call can both follow.
---

# Write a runbook

A runbook is what a tired person does at 3am. It must work without the author.

1. **Title and trigger.** One line: the symptom that means "use this" (the metric
   or alert name, and what it looks like).
2. **Impact and urgency.** Who or what is affected, and how fast it gets worse.
3. **Check first.** Two or three read-only commands that confirm the diagnosis,
   with the output that means yes and the output that means no. Stop here if no.
4. **Fix.** Numbered steps, each one exact command, one action. Mark each step
   `safe` (idempotent, reversible) or `needs a person` (restart, deploy, data
   change). Only `safe` steps may go into `factory/maintain/runbooks.json`, and
   only with `pre_approved: true` after a human has read them.
5. **Verify.** The command or metric that proves it worked, and how long to wait.
6. **Roll back.** How to undo each step that changed something.
7. **Escalate.** Who to wake if verification fails after two attempts, and what to
   tell them.

Test the Check and Verify commands before saving. Save to `docs/runbooks/<name>.md`.
