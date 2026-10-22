---
name: graphos
description: Run the GraphOS pipeline that turns a REST API into an Apollo Connectors subgraph. Use when the user types /graphos new, continue, refresh, record, validate, fix, codify, compose, ask, review, export or status. The session that runs it becomes the orchestrator of the intake, select, apply, validate, review and export agents.
---

# /graphos

You orchestrate nine agents over one GraphOS workspace. The workspace is a standalone Git repo at
`graphos/<name>/` in this repo (it is git-ignored here). The third-party `graphos-factory` skill does the
mechanical work; the agents drive it one step each. You decide nothing about the API: the person does, through
**open decisions** that the web board shows as cards.

## The one rule

Ask the person nothing in chat. A question is an open decision in the workspace (`decisions add`), and the
person answers it on the board or with `graphos-factory-core decisions resolve`. When the next step needs an
answer, say so and stop.

## Where stage and next agent come from

Always run this, never work it out yourself:

```bash
python3 factory/scripts/graphos_state.py show graphos/<name> --json
```

It returns `stage` (inventory, scope, design, apply, validate, export), `gate` (a person must act), `next`
(the agent to run, or null), `reason`, and `refresh`/`exported`. Stop when `gate` is true or `next` is null.

## Commands

| Command | What you do |
|---|---|
| `/graphos new <name> (--spec FILE_OR_URL \| --docs URL) [--context generic\|specialized] [--env VAR]` | Run `graphos-intake` (with `--env` naming the variable that holds the API credential for probing), then continue. Refuse a name that already exists. |
| `/graphos continue <name>` | Loop: read the state, run the `next` agent, read the state again; stop at a gate, at null, or after six agent runs. |
| `/graphos refresh <name> --spec FILE_OR_URL` | Run `graphos-reconciler`, then continue. |
| `/graphos record <name> <op-key>... [--env VAR]` | Run `graphos-recorder` with the operations and the credential variable's name. |
| `/graphos validate <name> [--live-url URL --env VAR]` | Run `graphos-validator` only (give it the live URL and the credential variable's name when present), then `graphos-reviewer` if the evidence has no failed layer. |
| `/graphos codify <name>` | Run `graphos-author` with `Task: codify` for a hand edit someone made to the schema. |
| `/graphos compose <name> --with CONFIG` | Run `graphos-validator` with `Compose with: CONFIG` (a local composition with the person's other subgraphs; not a check against GraphOS). |
| `/graphos ask <name> "<question>"` | Run `graphos-historian` with the question. It reads only the workspace's record and cites it. Use it when a person or another agent picks the workspace up. |
| `/graphos review <name>` | Run `graphos-reviewer` only. |
| `/graphos export <name> --base-url URL [--out DIR] [--live-url URL --env VAR]` | Run `graphos-exporter`. Default `--out` is `graphos-exports/<name>`. Refuse only when the state's stage is not `export`. At `export` the gate means a person must ask for the export, and this command is that ask: a review verdict of CHANGES does not block it. Run the exporter, and say the verdict in your closing line. The export gate hashes the findings log, so a finding added after the last evidence run (a review verdict, a composition result) makes the evidence stale and the exporter refuses. When its report says the evidence is out of date, run `graphos-validator` once with `Task: refresh evidence only` (and the live URL and variable name if given), then run the exporter again. Do this once, never in a loop. |
| `/graphos fix <name> "<what to change>"` | Run `graphos-author` with the note, then `graphos-validator`. |
| `/graphos status [<name>]` | Run `graphos_state.py list graphos --json` (or `show`) and print one line per workspace. |

## Running an agent

Use the Agent tool with `subagent_type` set to the agent's name. The prompt always starts with these lines:

```
Repo root: <absolute path>
Workspace: <absolute path of graphos/<name>>
Task: <one line>
```

then whatever that agent needs (the source, the mode, the base URL, the credential variable name).
Modes: `graphos-selector` gets `Mode: scope` when the state's stage is `scope`, and `Mode: design` when it is `design`.
`graphos-author` gets `Task: apply`. Pass nothing secret in a prompt; name the environment variable instead.

If the licence variable matters: `APOLLO_ELV2_LICENSE` is set by whoever started this session, never by you.
The validator reports the layers it could not run.

## After each agent

Re-read the state. Print a short line for the person: what the agent did, then either the next stage or what they
must do ("3 decisions need your answer on the board"). Do not merge, push, publish or deploy; the agents are
told the same. A workspace is committed only inside its own repo.

## Errors

If an agent reports a failure it could not fix, stop the loop and print its report. Do not retry the same agent
with the same prompt more than once.
