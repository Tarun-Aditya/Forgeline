VERDICT: PASS

## Findings
None.

## Notes
Looked at it in the browser (dev server on 5131, fixture repo with a fake finished run at `build` whose final message is a long list of questions; agent-browser at desktop and 375px width). No forms were submitted.
- Board: the Build card shows the "needs your answer" badge in the `bg-call` style, with a highlighted border. The question text sits in a scrolling box about 12rem high, and there is a reply textarea and a "Send answer" button below it. The open-the-drawer button and the reply box are siblings, as the spec asks. Pressing Enter in the reply box did not open the drawer. "Send answer" is disabled while the box is empty. The Board tab count shows 1.
- Drawer: the badge is in the title, and the question box, reply box and button show above the files. The accessible name of the dialog heading includes "needs your answer". The reply box has an `aria-label`. Focus order is natural.
- At 375px the board still scrolls sideways, as it did before this change. The card works inside that scroll.
- Not checked in the browser: the send path (the fake CLI and the `--resume` run), the badge clearing while a run is alive, and the Agents panel. The fixture did not load jobs I had placed at `intent` and `spec-approval`, so I did not check the "Which repo?" case at `intent`. The rule is covered by the unit tests, which I did not run.
- Nit: the reply box has only a placeholder and an `aria-label`, no visible label. This is acceptable because the badge and the question sit directly above it.
- Nit: the badge appearing is not announced to screen readers (no live region). The Board count and the card still make it visible.
