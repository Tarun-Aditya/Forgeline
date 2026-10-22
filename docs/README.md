# Documentation

All project documentation lives in this folder, and new documentation is added here (not beside the code it describes).
Short entry points stay at the repo root: `README.md`, `USAGE.md` (user guide), `CONTEXT.md` (state and what is proven), `AUDIT.md` (evidence).

| Document | What it is |
| --- | --- |
| [`graphos-handoff.md`](graphos-handoff.md) | GraphOS mode: what was built, how it fits together, setup, what is proven and not, decisions, gotchas, next steps. |
| [`graphos-use-cases.md`](graphos-use-cases.md) | The 17 GraphOS use cases: how to use each in the app, and real-world variations (tagged shown / plausible). |
| [`adr/`](adr/) | Architecture decision records, one file per decision, numbered `NNNN-title.md`. |

Related, kept beside what they describe: `demo/graphos/README.md` (the demo API, golden run, replay and video), `web-studio/README.md` (the web app's settings).

## Conventions

- One topic per file, named `<area>-<topic>.md` (for example `graphos-handoff.md`). Decisions go in `adr/`.
- Start a document with who it is written for, then what it covers. Say what is proven and what is not.
- Add every new document to the table above in the same change.
