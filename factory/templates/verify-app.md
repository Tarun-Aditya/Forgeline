---
name: verify-app
description: Start this app and prove a feature works by using it. Use before declaring a UI or runtime change done, and when reviewing one.
---

# Verify the app

This skill belongs to the repository. Keep it true: when the app changes, change it.

## Start
- Command: `<exact command from a file you read>`
- Port: `<port, or take it from the PORT given in your prompt>`
- Ready when: `<URL or log line that shows it is up>`
- Seed data / login: `<how to get a usable state, or "none needed">`

## Stop
- `<how to stop it and free the port>`

## Drive it
Use the `agent-browser` CLI (run `agent-browser skills get core` once). Always pass
`--session <your-session-name>` so other jobs never share your browser. Close the
session when you finish.

## Feature map
One row per user-facing area. Add a row when a feature adds an area.

| Area | URL or command | What a working page shows | What a broken one shows |
| --- | --- | --- | --- |
| `<home>` | `<path>` | `<visible proof>` | `<error, blank, wrong text>` |

## Rules
- Prove it by looking at the real running app, not by reading code.
- Check one failure path for every happy path.
- Report what you saw: the URL, the action, the visible result.
