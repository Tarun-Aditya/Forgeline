INTENT: DRAFT

# Surface agent questions on the job

- Origin: idea
- Ticket: none
- Originator: not given

## In the originator's words
> Show agent questions on the job. When an agent stops to ask something, like the "which repo?" refusal, it shows only in the right-hand chat, so the job looks stuck. A "needs your answer" badge and a reply box on the job card would fix that. This is the biggest gap.

## Problem
When an agent stops to ask the person a question (for example the "which repo?" refusal), the question appears only in the right-hand chat. The job itself shows no change, so it looks stuck and the person does not know it is waiting on them.

## Who is affected
People running jobs in the Forgeline web app. Frequency is unknown (guess: any job where an agent needs information it was not given).

## Constraints
- Agents never merge, push or deploy; this must not change.
- Human approval gates (intent accepted, spec approved) must keep working as they do today.
- Existing answers given through the chat must keep working.

## Success criteria
- A job whose agent is waiting on a question is visibly marked on the job card (a "needs your answer" indication) within a few seconds of the agent stopping (target: under 5 s, or the next refresh).
- The question text is readable from the job card without opening the chat.
- The person can answer from the job card and the job continues without them switching to the chat.
- Once answered, the marker clears.
- In a manual check of the "which repo?" case, a first-time user can tell the job is waiting on them and what it asks.

## Assumptions
- (guess) "Job card" means the job's entry or view in the web app.
- (guess) The badge and reply box are the originator's proposed remedy; the real need is that waiting questions are visible and answerable at the job level.
- (guess) The "which repo?" refusal is one example; any agent stop that asks the person something counts.
- (guess) The chat remains available and shows the same question.
- (guess) "Biggest gap" is the originator's opinion, not a measured ranking.

## Open questions
- Which agent stops count as a question: only explicit questions, or also refusals and blockers? [All stops that need a human reply.]
- Should the badge also appear in the job list, not just on the card? [Yes.]
- If several questions are pending on one job, show all or only the latest? [All, oldest first.]
- Should the person be notified outside the page (sound, browser notification)? [No, badge only.]
- Can a question be dismissed without answering? [No.]
- Is an answer from the card and from the chat the same thing, so answering in one clears both? [Yes.]
- Is there any recorded decision against this? [None found in factory/out-of-scope.md.]
