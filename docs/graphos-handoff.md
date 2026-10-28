# GraphOS mode: hand-off and context

Written for: engineers and team leads picking up GraphOS mode, including people new to this repo.
Branch: `feat/graphos-mode` (four commits on top of `bc53e82`, not pushed). Date: 2026-10-22.
The use cases and how to use them are in [`graphos-use-cases.md`](graphos-use-cases.md). The demo's own notes are in
[`demo/graphos/README.md`](../demo/graphos/README.md). This file says what was built, why, what is proven, and what to watch for.

## 1. What this is, in one paragraph

GraphOS mode is a second pipeline in the Forgeline web app. You give it a REST API (an OpenAPI/Swagger spec, or only a link to its docs)
and a team of agents turns it into an **Apollo Connectors subgraph** for a GraphOS supergraph. It stops twice for a person (pick the
scope, settle the design questions), runs real validation layers, and leaves a Git workspace that records every decision, finding and
piece of evidence, so a teammate or a different agent can pick the work up, or follow the API when it changes. It wraps Apollo's
third-party **`graphos-factory` skill** (preview); it does not reimplement it.

## 2. How it fits together

```
 Person (browser)                     web-studio  (Next.js, Studio layout)
   |  Factory | GraphOS switch          board, panel, dialog, New connector page
   v                                     |  reads workspace files, answers decisions with the skill's CLI
 /graphos <verb> <workspace> ...         |  starts runs:  claude -p "/graphos ..."
   |                                     v
   +----------------------------> /graphos skill (orchestrator)  .claude/skills/graphos/SKILL.md
                                         |  asks factory/scripts/graphos_state.py "what is next?"
                                         v
        graphos-intake -> graphos-selector -> graphos-author -> graphos-validator -> graphos-reviewer -> graphos-exporter
        (on demand: graphos-recorder, graphos-reconciler, graphos-historian)
                                         |  each drives the Apollo graphos-factory skill one verb at a time
                                         v
                       graphos/<name>/   one standalone Git repo per connector (git-ignored in this repo)
                         .factory/  workspace.yaml, inventory.json, selection.yaml, decisions/, findings/,
                                    memory.md, evidence/latest.json, applied.lock.yaml, sources/ (pinned spec)
                         <name>.graphql   the subgraph, a plain file a person can edit
                         tests/           cases, stubs, live.yaml
```

Three ideas carry the design:

1. **One place decides the stage.** `factory/scripts/graphos_state.py` reads the workspace and returns the stage, whether a person
   must act (`gate`), and the next agent. The `/graphos` skill and the web board both call it, so they cannot disagree.
2. **Questions are decisions, not chat.** An agent that needs an answer records an *open decision* in the workspace and stops. The web
   app (or a terminal) answers it with `graphos-factory-core decisions resolve`. Every answer is a Git commit with who, when and why.
3. **The workspace is the product.** The subgraph is one output. The record (decisions, findings, evidence, history) is the other, and
   it is what makes hand-off and API-change tracking possible.

## 3. What was built, by area

| Area | Where | What |
| --- | --- | --- |
| Pinned third-party skills | `factory/skills/graphos-skills.json` | Apollo `skills` repo at commit `f9843dc` (graphos-factory 0.12.2): `graphos-factory`, `apollo-federation`, `graphql-schema`, `rover`. Installed on demand by `install_helper_skills.py --config ... --apply`, git-ignored, `doctor.py` warns if missing. `apollo-connectors` (deprecated upstream) and `apollo-router` (its docs trip the commit hook's credential check) are deliberately not installed. |
| Agents (9) | `.claude/agents/graphos-*.md` | intake, selector, author, validator, reviewer, recorder, reconciler, exporter, historian. Models pinned in frontmatter. |
| Orchestrator | `.claude/skills/graphos/SKILL.md` | The verbs: `new`, `continue`, `validate`, `fix`, `codify`, `refresh`, `record`, `compose`, `ask`, `review`, `export`, `status`. |
| State script | `factory/scripts/graphos_state.py` | Stage, gate, next agent, review verdict, counts. Pure file reads, no binary needed. |
| Activity tagging | `factory/scripts/activity.py` | A session that touches `graphos/<name>/` or runs `/graphos <verb> <name>` is job `gx-<name>`, so Agents, Activity, Runs and Metrics scope to a connector. |
| Web app | `web-studio/` | See section 4. |
| Demo | `demo/graphos/` | Bookshop API (`server.py`), v1 and v2 specs, docs page, the real golden run (`golden.py`), replay (`build_fixtures.py`, `fake_claude.py`), recorder and the video. |
| Evals and tests | `factory/evals/run_evals.py`, `web-studio/tests/` | 481 offline checks (state script, activity tagging, demo API) and 41 web unit tests. |
| Docs | `USAGE.md` §7c, `CONTEXT.md`, `web-studio/README.md`, these two files | |

### The nine agents

| Agent | Step | Does | Never does |
| --- | --- | --- | --- |
| `graphos-intake` | Inventory | Creates the Git workspace, pins the spec (or reads docs and probes the live API), builds the inventory, and for a customer-specific connector assesses the tenant | Choose scope |
| `graphos-selector` | Scope, Design | Proposes a small read-only scope and opens "Confirm scope"; then records every design question as an open decision | Answer a person's question; write the schema |
| `graphos-author` | Apply | Writes the schema, tests and coverage, edits only the delta, codifies hand edits | Regenerate the schema wholesale |
| `graphos-validator` | Validate | Runs every layer, the live check, local composition, evidence refresh | Edit the schema to make a layer pass |
| `graphos-reviewer` | Validate | Reviews the schema like a pull request, writes `review.md` with a verdict | Edit anything but `review.md` |
| `graphos-recorder` | On demand | Records scrubbed live GET traffic, infers shapes, notes spec-versus-reality gaps | Write a credential to disk |
| `graphos-reconciler` | On demand | Refreshes the pinned spec, classifies changes against the selection, opens decisions | Touch the schema |
| `graphos-exporter` | Export | Exports with the production URL, prints the rover commands | Publish, push, or handle a GraphOS key |
| `graphos-historian` | On demand | Answers questions about a workspace from its record, with citations | Edit anything |

### Stages and gates

`inventory` → `scope` **(you)** → `design` **(you)** → `apply` → `validate` → `export` **(you ask for it)**.
`gate` is true when a person must act. A failed non-gating layer (`write_body_proof`, `json_accounting`) is shown but does not block, as
the skill specifies. A decision a person answered after the last apply reopens `apply`. A current "Upstream changed" finding reopens
`apply`. Markers the agents leave: the "Confirm scope" decision (phase `scope`), findings titled "Design pass complete", "Schema review
complete", "Upstream changed: ...", "Exported".

## 4. The web app (`web-studio/`)

GraphOS is in the **Studio** layout (sidebar, framed main card, scope switcher, docked side panel). The earlier `web/` app was deleted;
it is in history at `bc53e82`.

- **Mode switch** in the sidebar: Factory | GraphOS (remembered in `localStorage`).
- **Board**: six stage columns; a card shows state, counts, validation chips ("N pass", "N fail", "N not run"), "your call", "API changed".
- **Side panel** (click a card): pipeline, next step button, counts. **Open connector** opens the dialog.
- **Dialog** (left nav):
  - *Scope*: filter, per-operation checkboxes, "may be a read" flag, left-out reasons, Save changes (a commit), Confirm scope.
  - *Decisions*: one card per open question (single or multiple choice, the agent's recommendation, a reason that is kept), and a list of settled decisions with who and why.
  - *Validate*: every layer (never a not-run as a pass), per-operation matrix, live check, local composition, the review with an "apply it" button, Export.
  - *Schema*: the subgraph, hand-edit banner and Codify.
  - *Record*: Ask the record, refresh against a newer spec, live recording, findings, Git history, notes.
- **New connector page**: spec or docs source, plain or customer-specific, and a demo-API control (start v1/v2, fill in the demo inputs).
- **Agents**: the nine agents as a pipeline map, scoped to a connector.
- API routes: `app/api/graphos` (list), `app/api/graphos/[name]` (detail; POST selection or resolve), `app/api/graphos-demo`.
  Server logic is `lib/graphos.ts`. Commands run through the existing chat/runner (`lib/runner.ts`), which treats `/graphos ...` like
  `/factory ...` and locks one run per workspace (`gx-<name>`).

## 5. Setup and operation

```bash
# once: the pinned skills, then the binary and toolchain
python3 factory/scripts/install_helper_skills.py --config factory/skills/graphos-skills.json --apply
bash .claude/skills/graphos-factory/scripts/bootstrap.sh                    # graphos-factory binary (~3 MB, GitHub releases)
APOLLO_ELV2_LICENSE=accept bash .claude/skills/graphos-factory/graphos-factory-core/scripts/toolchain.sh   # rover, router, WireMock
# run
cd web-studio && npm install && FORGELINE_ELV2_ACCEPTED=1 npm run dev      # http://127.0.0.1:3000, needs Node 22+, a logged-in claude CLI
python3 demo/graphos/server.py                                              # the demo API on :4010 (or "Start v1" in the app)
```

| Variable | Meaning |
| --- | --- |
| `FORGELINE_ELV2_ACCEPTED=1` | Passes `APOLLO_ELV2_LICENSE=accept` to `/graphos` runs. **Apollo's Elastic License v2 covers the composition plugin and the Router; only a person accepts it.** Without it compose, unit, e2e and live report `not_run`. |
| `FORGELINE_GRAPHOS_DIR` | Folder under the repo for workspaces (default `graphos`). |
| `FORGELINE_DEMO_PORT` | Demo API port (default 4010). |
| `LUMEN_TOKEN` | Demo credential (`lumen-demo-token`), read from the environment, never written to a file. |
| `APOLLO_KEY` + a graph ref | Needed only for the real `supergraph_check`. The tools never ask for it, set it or print it. |

Offline checks: `uv run --python 3.12 python factory/evals/run_evals.py` (481), `cd web-studio && npm test` (41) and `npm run typecheck`.

## 6. What is proven and what is not

**Proven by a real run** on the demo API (17 agent runs, about 57 minutes, about $20 API-equivalent on the subscription), recorded in
`demo/graphos/golden.py` and replayed in the video:
docs-only and spec intake; scope proposal and confirmation; a design pass that produced the real questions (PII, a secret-shaped field,
a POST that reads, mutations, nulls, pagination, links, entities, payment); apply; validation with **67 Connector unit cases, 33
mocked-Router cases, 61 conformance checks, lint, and 8 live cases passing**; a reviewer verdict with concrete findings; recording of
live traffic, which found the planted spec-versus-reality gap; a hand edit detected and codified; a v2 refresh classified against the
selection and re-applied; a customer-specific assessment; a local composition with a second subgraph; export that handed over the rover
commands and published nothing; and a fresh agent answering "who decided the email is hidden" from the record. The final workspace
holds 29 decisions (23 answered by a person), 17 findings, a 618-line schema and 47 commits.

**Not proven or not covered:**
- The agent prompts have no automated evals. They are covered only by these real runs. The selector's questions differ from run to run.
- The real `supergraph_check` never ran: it needs a published graph and a key. The local composition is a stand-in and says so.
- Only REST is built upstream. gRPC, databases and existing GraphQL APIs are "planned, not built" in Apollo's skill; the app shows them as such.
- The reviewer's "changes" verdict was not fully applied before the demo's export (the export is allowed with it, and reports it).
- `write_body_proof` can keep a read gap on a list argument (for example `books(ids)`); it is non-gating and recorded, not hidden.
- The Studio UI has no Playwright tests; it was exercised by the recorder and the unit tests. The older app's Playwright suite went with it.
- Everything was run on one machine (macOS, Chrome, Node 24, Python 3.9 system / 3.12 via `uv` for the evals).

## 7. Decisions worth knowing, and why

- **Wrap the Apollo skill, do not rebuild it.** The skill is preview and says its shape will change; agent prompts are narrow, the skill is pinned,
  and `graphos_state.py` is the only place that knows the file layout it reads.
- **Studio layout, `web/` removed.** You wanted the Studio look; keeping two apps would drift. Cost: features the old app had (list in `CONTEXT.md`).
- **Decisions, not chat, for questions.** It makes answers durable, auditable and answerable from a terminal or another agent.
- **A local composition instead of faking the supergraph check.** It proves entity names and key types agree with other subgraphs without a
  key. It is labelled as not a GraphOS check.
- **`/graphos export` refreshes stale evidence itself, once.** The skill's export gate hashes the findings log, so a finding added after the last
  evidence run (a review verdict, a composition result) makes the evidence stale. The orchestrator re-runs evidence and retries.
- **`export` is the person's go-ahead.** At the export stage the gate means "a person must ask"; the command is that ask, and a CHANGES review is reported, not blocking.
- **Workspaces are standalone Git repos**, git-ignored here, so one can be cloned, handed over or pushed on its own.

## 8. Gotchas we hit (so you do not)

- The repo's commit hook scans the text of any shell command containing the words for a Git commit; avoid putting those words in scripts passed to the shell, and keep credential-looking sample text (`sk_live_`, `password`) out of files you commit. That is why `apollo-router` is not installed.
- `pkill -f` and `pgrep -f` match their own shell command; wait loops built on them never end. Wait on a file or an HTTP status instead.
- The subscription has a **session limit**; long recordings can stop mid-run ("resets at ..."). The golden script saves after each step; re-run the remaining steps.
- `python3 demo/graphos/recorder/check-video.py <mp4>` fails on a cut-off frame or a stalled recording; `run-graphos-demo.sh` runs it. The full lessons table is in `web-studio/.claude/skills/record-demo/SKILL.md`.
- The Mac must stay awake for recordings (`caffeinate -dimsu`); a sleep makes the recorder time out.
- A shared Python dict mutated in `build_specs.py` once deprecated ~30 fields at once. It is fixed and has an eval.
- `graphos-factory-core lock --check` exits non-zero on drift; the web server keeps its JSON output rather than treating it as an error.
- **Headless Chrome (155) records only the top ~89% of the frame** (a grey band below, so bottom captions vanish). The recorder runs Chrome *headed* with the window off-screen
  and rendering kept alive (`recorder/kit.mjs`). After any recording, check the bottom rows are not a flat grey (`recorder/gaps.py` checks silence; look at a frame for the band).
- Playwright for the recorder lives in `web-studio/demo/.pw` (playwright-core 1.64.0, installed once, git-ignored). Piper voice: `~/forgeline-voice`.
- The demo credential `lumen-demo-token` and the fake key `sk_live_demo_do_not_use_*` in the demo API are not real secrets.

## 9. Re-recording the demo video

`demo/graphos/README.md` has the commands. In short: `golden.py` runs the story for real (about an hour), `build_fixtures.py` turns it into a
replay, `run-graphos-demo.sh` records it with the Piper voice, `recorder/gaps.py` measures silent gaps. The agent runs in the video are replays
of the real run (`fake_claude.py`); everything else on screen is the real app writing real commits.

## 10. Suggested next steps

1. Push the branch and open a PR; ask a teammate to run the demo from a clean checkout (setup section 5).
2. Run it on a real, low-risk REST service of your own (3 to 5 read-only endpoints) and time it against hand-writing. This is the number leadership will ask for.
3. Run it once with a real `APOLLO_KEY` and graph ref, to see the real `supergraph_check`, and write down what it shows.
4. Add live agent evals for the nine prompts (the factory has the pattern in `factory/evals/agent_evals.py`).
5. Decide which of the old app's features to bring back into the Studio app (questions on cards, alerts, push updates are the ones people noticed).
6. Add a Playwright smoke test for the GraphOS board and dialog.
7. Watch Apollo's skills repo: the pin is `f9843dc`; read the diff upstream before moving it.
8. If your supergraph uses GraphOS Contracts, record the tag names as a decision before the author applies `@tag` (the skill leaves it off by default).
