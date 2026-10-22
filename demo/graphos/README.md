# GraphOS demo: the Lumen Books API

A small bookshop REST API, plus everything needed to show Forgeline's GraphOS mode on it: a spec and a docs page for
it, a "v2" of the API for the change-detection demo, a script that runs the whole story for real, and the recording
pipeline for the demo video.

| File | What it is |
| --- | --- |
| `server.py` | The API (standard library, in memory, deterministic). `--api-version 2` serves the changed API. |
| `build_specs.py` | Writes `openapi.v1.json` and `openapi.v2.json`. v2 adds an endpoint, removes one, deprecates one, adds a field and an enum value. |
| `docs.html` | Served at `/docs`. The only description of the API for the "docs only, no spec" start. |
| `golden.py` | Runs the whole story for real through the web app's API and logs each step. |
| `build_fixtures.py`, `fake_claude.py` | Turn that real run into a replay, so the video needs no model. |
| `video/` | The recorder (`record.mjs`), voice and mux scripts. `run-graphos-demo.sh` runs it end to end. |

## What the API has, on purpose

Each thing is there so one use case has something real to show.

- Page-number pagination (`/books`) and cursor pagination (`/orders`).
- A POST that only reads (`/books/search`): the select step flags it and asks.
- Personal data (`customer.email`, `phone`) and a credential-shaped field (`integration.apiKey`).
- Links between types by id (`book.authorId`, `order.customerId`): relationship fields.
- A polymorphic `payment` (card or bank), a free-form `metadata` object, a 204 delete, a PATCH.
- A spec-versus-reality gap: `order.payment` comes back `null` for a cancelled order though the spec does not allow null.
- Bearer auth: every route but `/health`, `/docs` and `/openapi.json` needs `Authorization: Bearer lumen-demo-token`.
- `v2`: `GET /books/{id}/reviews` added, `PATCH /orders/{id}` removed for `POST /orders/{id}/refund`, `POST /books/search`
  deprecated for `GET /books?q=`, `Book.isbn` deprecated for `isbn13`, `refunded` added to `OrderStatus`.

## Try it by hand

```bash
python3 demo/graphos/server.py          # the API on :4010 (or use "Start v1" in the web app)
cd web-studio && FORGELINE_ELV2_ACCEPTED=1 LUMEN_TOKEN=lumen-demo-token npm run dev
```

Open http://127.0.0.1:3000, switch to **GraphOS**, open **New connector**, click **spec** (it fills in
`demo/graphos/openapi.v1.json`) and **Start**. The composition, router and WireMock tools are installed once with
`bash .claude/skills/graphos-factory/graphos-factory-core/scripts/toolchain.sh` after you have read and accepted
Apollo's Elastic License v2 (`APOLLO_ELV2_LICENSE=accept`); the web app passes that on when `FORGELINE_ELV2_ACCEPTED=1`.

## The 16 things the mode covers, and where the demo shows each

| # | Use case | Where |
| --- | --- | --- |
| 1 | New subgraph from an OpenAPI/Swagger spec | start box, "spec" |
| 2 | New subgraph from a docs link only (no spec) | start box, "docs only" |
| 3 | Choose scope: which operations, with reasons for what is left out | Scope tab |
| 4 | A POST that may be a read, and the unsupported sources greyed out | Scope tab, start box |
| 5 | Relationships between types (links), entities | Decision cards |
| 6 | Design decisions with alternatives: PII, secrets, mutations, nulls, pagination, payment | Decisions tab |
| 7 | Generic wrapper or customer-specific fields | start box checkbox |
| 8 | Write the schema, editing only what changed | Apply stage, Schema tab |
| 9 | Hand edits detected and codified | Schema tab banner |
| 10 | Validation layers: compose, Connector tests, mocked Router, conformance, lint | Validate tab |
| 11 | Check against your own supergraph (only with your graph and key, else "not run") | Validate tab |
| 12 | Record live traffic as fixtures; spec-versus-reality findings | Record tab |
| 13 | Follow an API change: refresh, classify against your scope, reapply | Record tab, "API changed" |
| 14 | Export with the production URL (never publishes) | Validate tab |
| 15 | Hand the workspace to a teammate or another agent (Git record, resume) | Record tab, Runs |
| 16 | Schema review (naming, nullability, fan-out, security) | Validate tab |

Use case 11 is shown honestly as "not run": it needs a published GraphOS graph and an `APOLLO_KEY`, which a local demo
does not have, and the skill never asks for or prints a key.

## Re-record the video

```bash
# 1. the real run (about an hour, uses the Claude subscription): start the web app and the demo API first
python3 demo/graphos/golden.py
# 2. fixtures from it
python3 demo/graphos/build_fixtures.py
# 3. record (needs ffmpeg, Chrome, and optionally the Piper voice; Playwright is installed once for the factory demo too)
npm install --no-save --prefix web-studio/demo/.pw playwright-core@1.56.1 monaco-editor@0.52.2
VO_PY=$HOME/forgeline-voice/venv/bin/python VO_MODEL=$HOME/forgeline-voice/en_US-hfc_female-medium.onnx \
  caffeinate -dimsu demo/graphos/run-graphos-demo.sh
```

The agent runs in the video are replays of step 1 (`fake_claude.py`), sped up so no run lasts longer than `DEMO_MAX_SECS`.
Everything else on screen is the real web app writing real commits. The recorder's captions, cursor, voice and sync-flash
code is the same as the factory demo's (`web-studio/demo/record-sample.mjs`); see `.claude/skills/record-demo/` there for
the pitfalls (keep the Mac awake, `NO_MUSIC=1` for voice only, measure gaps with `gaps.py`).
