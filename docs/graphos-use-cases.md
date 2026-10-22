# GraphOS mode: the 17 use cases, and how to use them

Written for: engineers and team leads who will use GraphOS mode on their own REST services, and anyone deciding whether it is worth a pilot.
Setup and architecture are in [`graphos-handoff.md`](graphos-handoff.md). The demo used throughout is the bookshop API in
[`demo/graphos/`](../demo/graphos/README.md); the video `demo/graphos/videos/forgeline-graphos-demo.mp4` shows all of these in order.

**How to read this.** Each use case has: *What it is*, *In the app* (the clicks), *What you get* (what is left in the workspace),
*In practice* (variations for real work), and *Watch for*. In the variations, **[shown]** means we ran it for real on the demo API;
**[plausible]** means it follows from how the tool works but we did not run it. Treat [plausible] as hypotheses to test in a pilot.

## At a glance

| # | Use case | Who acts | Stage | Verb |
| --- | --- | --- | --- | --- |
| 1 | Subgraph from an OpenAPI/Swagger spec | you start it | Inventory | `new --spec` |
| 2 | Subgraph from a docs link only (no spec) | you start it | Inventory | `new --docs` |
| 3 | Choose the scope | **you** | Scope | (board) |
| 4 | A POST that may be a read; unsupported sources | **you** | Scope, Design | (board) |
| 5 | Relationships between types, and federation entities | **you** | Design | (board) |
| 6 | Design decisions with alternatives and recorded reasons | **you** | Design | (board) |
| 7 | Plain wrapper or customer-specific API | you start it | Inventory | `new --context specialized` |
| 8 | Write the schema, tests and coverage, editing only the delta | agents | Apply | `continue` |
| 9 | Keep a hand edit: detect, then codify | you + author | Apply | `codify` |
| 10 | Validation in layers | agents | Validate | `validate` |
| 11 | Live check against the real service | you start it | Validate | `validate --live-url` |
| 12 | Record live traffic; spec-versus-reality | you start it | any | `record` |
| 13 | Compose with other subgraphs (and the real supergraph check) | you start it | Validate | `compose` |
| 14 | Follow an API change | you start it | any | `refresh` |
| 15 | Export | **you ask** | Export | `export` |
| 16 | Hand-off: ask the record | you or another agent | any | `ask` |
| 17 | Schema review | agents | Validate | `review` |

A rule of thumb for the whole mode: **two gates are yours (Scope, Design), the export is yours to ask for, and everything else the agents
do and show you the evidence for.** Nothing is published, pushed or merged by the agents.

---

## 1. Subgraph from an OpenAPI/Swagger spec

**What it is.** The usual start: you have a spec. The workspace is created as its own Git repo, the spec is pinned byte for byte, and
every operation and type is listed in an inventory.
**In the app.** New connector → **OpenAPI / Swagger** → name (snake_case) → spec file or URL → **Start**. (Demo: click **spec** to fill in
`demo/graphos/openapi.v1.json`.) Equivalent: `/graphos new lumen_books --spec demo/graphos/openapi.v1.json --context generic`.
**What you get.** `graphos/<name>/` with `.factory/workspace.yaml`, `inventory.json`, `sources/` (the pinned vendor copy), `sources.lock.yaml`,
a skeleton schema, and a first commit. 11 operations and 17 shapes for the demo spec. Then a scope proposal appears (use case 3).
**In practice.**
- A stable partner or SaaS API with a published spec, where you need 3 to 5 endpoints in your graph, not all 30. **[shown on the demo; plausible for a real SaaS API]**
- A spec that is wrong in places: patch the *working copy*, and the pinned vendor copy keeps the original so the patch is a recorded, reapplied edit. **[shown: a spec patch was recorded during apply]**
- Swagger 2.0 specs are supported by the skill. **[plausible; the demo used OpenAPI 3.0]**
**Watch for.** Only REST is built. A spec with many `needs_review` or `unsupported` operations will show them in the Scope list; read the badge.

## 2. Subgraph from a docs link only

**What it is.** No spec. The intake agent reads the docs page, then probes the live service with safe GET requests to learn the shapes,
and builds the inventory from what it saw. What it could not confirm is recorded as unconfirmed.
**In the app.** New connector → **Docs link, no spec** → name → docs URL → optionally a **credential variable** name (for example
`LUMEN_TOKEN`) → Start. The credential is read from that environment variable of the process that starts agents and is never written to a file.
**What you get.** A workspace with `intake: discovered`, recorded samples under `.factory/samples/`, an inventory (7 operations for the demo docs page), and notes in `memory.md`.
**In practice.**
- A legacy internal service whose OpenAPI file was never written, but has a docs page and a test environment. **[plausible]**
- A vendor API documented only as a web page. **[plausible; the demo's docs page was ours]**
- Use it to *generate a first spec-like inventory*, then ask the owning team to confirm it. **[plausible]**
**Watch for.** Probing only sends GETs unless you say otherwise. Anything behind a write (POST bodies) is inferred from the docs and marked "not probed".

## 3. Choose the scope

**What it is.** The selector proposes a small read-only starting scope and opens one decision, "Confirm scope". You adjust and confirm.
**In the app.** Click the card (Scope column, "your call") → **Open connector** → *Scope*. Tick or untick operations, **Save N changes**
(this is a Git commit), then **Confirm scope (N)**, which starts the design pass. Operations left out show the reason next to them.
**What you get.** `.factory/selection.yaml` with every operation listed, `include: true|false`, a GraphQL root and a name for each, and a resolved scope decision.
**In practice.**
- Start narrow: 3 to 5 read-only endpoints first, add writes in a later pass. **[shown: the selector proposed 3 reads; we then switched the rest on]**
- Expose an operation later: toggle it on, Save, and run the next step; only the delta is applied (use case 8). **[plausible]**
- Keep an "internal only" list of endpoints with a written reason, so the next engineer does not re-open the question. **[shown: reasons are saved per operation]**
**Watch for.** Scope is a decision with a record; changing it after the design pass reopens work (new questions for new operations).

## 4. A POST that may be a read; unsupported sources

**What it is.** Many APIs use POST for search. The inventory flags a POST whose name suggests a read ("may be a read") and the tool never
guesses: it becomes a decision (Query or Mutation). The start form also greys out gRPC, databases and existing GraphQL, because Apollo's skill has not built them.
**In the app.** In *Scope*, the badge **may be a read** on `POST /books/search`; the question arrives in *Decisions* ("searchBooks: query or mutation").
**What you get.** A resolved decision and the chosen root in `selection.yaml`.
**In practice.**
- Search, filter and report endpoints that take a body but change nothing: choose Query so callers and caches treat them as safe. **[shown]**
- A POST that triggers work (export job, recalculation): keep it a Mutation. **[plausible]**
**Watch for.** A POST that reads *and* has side effects (an audit log write): the agent cannot know; this is exactly what the question is for.

## 5. Relationships between types, and federation entities

**What it is.** Two related design questions. **Links:** a `Book` has an `authorId`; exposing `Book.author` means one extra request per parent,
so the tool asks which links to keep. **Entities:** whether a type has `@key`, so other subgraphs can reference or extend it.
**In the app.** *Decisions* tab: "Relationship links" (multiple choice) and "Federation entities" (none / catalog types / all).
**What you get.** Link fields authored with `$this` lookups and tests (including the null-parent case), and `@key` plus a by-id lookup connector for each entity.
**In practice.**
- Another team's subgraph already references your `Book`: choose the catalog entities and verify with use case 13. **[shown: catalog chosen, then composed with a reviews subgraph]**
- A high-traffic list endpoint: drop the link that would make N+1 calls, or accept it and add `@listSize` (the author did, after the review). **[shown]**
- Keep the first version entity-free and add entities when a second subgraph needs them. **[plausible]**
**Watch for.** Each link multiplies upstream calls (a list of orders with items and books is 1 + orders x items x 2 requests). The reviewer flags this; decide on demand control (`@listSize`) with your router team.

## 6. Design decisions, with alternatives and recorded reasons

**What it is.** The heart of the mode. For everything a person should decide, the selector records an open decision with real alternatives and a
recommendation. Examples from the demo: show or hide a customer's email and phone; exclude a credential-shaped field (`apiKey`);
what an explicit `null` argument sends; page-number versus cursor pagination and whether to return page info; the shape of a polymorphic payment;
batching; whether to type a free-form JSON field or drop it.
**In the app.** *Decisions* tab. Pick an answer, type **why** (kept in the record), **Save answer**. Each answer is a Git commit. Some cards allow several answers.
**What you get.** `.factory/decisions/D-*.json` with the question, choices, the chosen ones, `by`, `at` and your note. The author must honour every resolved decision.
**In practice.**
- **Privacy review (GDPR, internal data classification):** the decision log is the evidence of what was exposed and why. Reviewers read decisions, not code. **[shown for PII and a secret; the compliance use itself is plausible]**
- **Security review:** "who can read `apiKey`?" has a dated answer and an owner. **[shown]**
- **Standard answers across many connectors:** keep a house style (always hide contact data, always cursor pagination) and apply it consistently, because each answer is a typed reason. **[plausible]**
**Watch for.** The selector's questions vary run to run. Answer what is asked; if a question you expected is missing, run `/graphos ask` or add it as a decision by hand.

## 7. Plain wrapper or customer-specific API

**What it is.** Some APIs have fields that differ per customer (custom objects, tenant metadata). Ticking **Customer-specific fields** makes the intake
agent assess that before anything is written: what would be tenant-specific here, and what it would need from you.
**In the app.** New connector → tick **Customer-specific fields** → Start. The card carries a **customer-specific** badge.
**What you get.** `context_mode: specialized`, a `context.yaml`, **open decisions** for anything only you can supply (the demo produced "live tenant access"
and "tenant `Book.metadata` fields"), and a finding "Customer context assessed". Nothing is fetched or asked for by the agent itself.
**In practice.**
- CRM or CMS style APIs (custom objects, content types) where the spec describes only the standard model. **[plausible; the demo's tenant was synthetic]**
- Multi-tenant SaaS where each customer's schema differs: record the tenant model export as a dependency, and keep the subgraph a generic wrapper until you supply it. **[plausible]**
**Watch for.** If you are not sure, leave it off: a plain wrapper is the default and nothing blocks on it. The assessment is recorded; the actual modelling needs the artifacts you choose to provide.

## 8. Write the schema, tests and coverage, editing only the delta

**What it is.** The author turns the confirmed scope and the settled decisions into the subgraph (Apollo Connectors `@source`/`@connect`), a test case and stub
per operation (including documented error statuses), and a coverage check that every field the API offers is either mapped or left out on purpose with a reason.
After the first commit it **never regenerates**: it computes the difference and edits only that.
**In the app.** After the last decision, the card shows **Run next step** (author). Watch it on *Agents* (the author tile lights up).
**What you get.** `<name>.graphql` (618 lines for the demo's 12 operations after v2), `tests/` (cases, stubs, `*.connector.yaml`), `applied.lock.yaml`, a commit `apply: ...`.
**In practice.**
- Because only the delta is edited, schema review diffs stay small and hand edits survive (use case 9). **[shown]**
- Treat the schema file as the artifact: PR it like code; the decisions file is its design record. **[plausible]**
**Watch for.** An answer you give after an apply reopens Apply ("Apply your N new answer(s)"); run the next step to carry it into the schema.

## 9. Keep a hand edit: detect, then codify

**What it is.** An engineer edits the schema by hand. A generator would normally destroy that on the next run. Here the tool detects it (Schema tab banner),
stops, and the author records *why* the edit exists and what must stay true, so later applies keep it.
**In the app.** *Schema* tab → the banner "The schema was edited by hand" → **Codify the edit**.
**What you get.** An override in `selection.yaml` with the reason and assertions, and a commit `decide: codify ...`.
**In practice.**
- Reordering fields for a dashboard, adding a doc comment, tuning a mapping for a quirk of one customer's data. **[shown: a comment pinned on a lookup field]**
- A fix to the vendor's spec: it becomes a recorded patch to the pinned working copy and is re-applied on refresh. **[shown: one spec patch]**
**Watch for.** An uncodified hand edit blocks the next apply on purpose; codify it or revert it.

## 10. Validation in layers

**What it is.** Every layer reports separately: composition, Connector unit tests, a mocked Router run, conformance against the spec, lint, JSON accounting,
write-body proof, and the live layer. **A layer that did not run is never shown as a pass.**
**In the app.** *Validate* tab: the layer table, a per-operation matrix (unit, e2e, conformance, live), and notes for what did not run. **Run validation** re-runs it.
**What you get.** `.factory/evidence/latest.json`, which fingerprints the files it ran against, so it goes stale when they change.
**In practice.**
- A CI-style gate: no export until composition and Connector tests pass. **[shown as the export gate; the CI wiring is plausible]**
- Show the table to a reviewer who will not read the schema. **[plausible]**
**Watch for.** `write_body_proof` and `json_accounting` are *non-gating*: a failure is shown in red and recorded, not hidden, but does not block. Without Apollo's licence accepted (`FORGELINE_ELV2_ACCEPTED=1`), compose, unit, e2e and live say `not_run`.

## 11. Live check against the real service

**What it is.** Everything before this ran against stubs. The live layer calls every selected read against the real service and compares with the spec. Writes are listed as excluded with the reason.
**In the app.** *Validate* → **Live check against the real API** → base URL and the **name** of the environment variable holding the credential → **Run live check**.
**What you get.** `tests/live.yaml` (cases and exclusions, naming the variable, never the secret) and a live layer result (8 live cases passing for the demo).
**In practice.**
- Run it against a **test tenant** before every export, especially after an API refresh. **[shown against the v2 demo service]**
- Run it from CI with the credential supplied as a secret. **[plausible]**
**Watch for.** The credential lives in the environment of the process that starts agents. If the variable is unset the layer reports `not_run`, not a pass.

## 12. Record live traffic; spec-versus-reality

**What it is.** A recorder calls the read operations, scrubs the samples, infers shapes, and compares what the API *really* returns with the spec.
**In the app.** *Record* tab → credential variable → **Record**.
**What you get.** Scrubbed samples in `.factory/samples/`, findings, and notes in `memory.md`. In the demo, the planted gap showed up in the record as the finding
"Live: Order.payment is null for a cancelled order" (the spec does not allow null), and the recorded run states that the API otherwise matched the spec for the seven recorded GETs.
**In practice.**
- Document the real behaviour of a vendor API in the record, so the next person does not rediscover it. **[shown]**
- Feed the samples to the mocked-Router tests as fixtures. **[shown: fixtures are built from recordings]**
**Watch for.** GET only unless you say otherwise. Samples are scrubbed before they touch disk, but check what your API returns before recording production data.

## 13. Compose with other subgraphs (and the real supergraph check)

**What it is.** Two different things, kept apart on purpose.
(a) **Local composition**: the validator renders this subgraph without placeholders, points your supergraph config at it, and asks `rover` to compose it with the
other subgraphs. It proves shared entity names and key types agree. It needs no key and is **not** a GraphOS check.
(b) **`supergraph_check`**: `rover subgraph check` against your published variant. It needs `APOLLO_KEY` and a graph ref in your environment; the tools never ask for, set or print the key. Otherwise it is `not_run` and the page says the subgraph has not been checked against your supergraph.
**In the app.** *Validate* → **Compose with your other subgraphs** → the path of your supergraph config (the demo's is `demo/graphos/others/supergraph.demo.yaml`) → **Compose**. The result is a finding ("Composed with ...: pass").
**What you get.** A finding and a commit; in the demo, a `Lumen_Books_Book` entity shared with a "reviews" subgraph composed with matching keys.
**In practice.**
- Before a platform team accepts your subgraph, show that it composes with theirs. **[shown with a demo second subgraph]**
- When you have the key: run the real check from the validator with `GRAPHOS_FACTORY_GRAPH_REF=<graph>@<variant>` set. **[plausible; never run here]**
**Watch for.** Composition failing on a key type (`ID!` versus `String!`) is the typical finding; the validator names the entity. The author, not the validator, fixes it.

## 14. Follow an API change

**What it is.** The upstream team ships a new version. You give the reconciler the newer spec; it refreshes the pinned copy, compares old and new **against what you selected**
(not in general), opens decisions for anything needing a call, and marks the card "API changed". Then the author applies only the difference.
**In the app.** *Record* → **Check for API changes** → the new spec (file or URL) → **Refresh**. Answer the new decisions, then **Run next step**.
**What you get.** A finding "Upstream changed: 1.0.0 to 2.0.0" with the classified list, new decisions (a removed endpoint, a deprecated field, a new enum value, a new endpoint), and a re-applied schema.
In the demo: `PATCH /orders/{id}` was removed and `refundOrder` added, `Book.isbn` deprecated for `isbn13`, `refunded` added to the status enum, `searchBooks` deprecated for `GET /books?q=`.
**In practice.**
- Run the refresh on a schedule or in CI against the vendor's current spec, and treat "API changed" as a ticket. **[plausible; the refresh itself was shown]**
- A removed or new endpoint that you did **not** select should be reported as non-breaking, so you only act on what you use. **[plausible: in the demo the removed `PATCH` was one we had selected, so it was a decision, not a non-event]**
**Watch for.** Re-validate (live) after the apply: the evidence is stale until you do, and the new endpoint has to answer against the real service.

## 15. Export

**What it is.** Writes the subgraph with your production base URL and prints the `rover` commands for **you** to run. It never publishes, pushes or touches a GraphOS key.
**In the app.** *Validate* → **Export the subgraph** → production base URL → **Export**. The export gate refuses an unvalidated workspace; if a finding was added after the last
evidence run it refreshes the evidence once and retries.
**What you get.** `graphos-exports/<name>/<name>.graphql` and the printed commands (`rover subgraph check ...`, `rover subgraph publish ...`), the router's credential variables, and a list of what is not verified. A finding "Exported" is committed.
**In practice.**
- Hand the exported file and the commands to the platform team's pipeline. **[plausible]**
- Export is allowed with a review verdict of CHANGES; the verdict is reported with the export. **[shown]**
**Watch for.** Export is the person's go-ahead. Read the "not verified" list: a missing `supergraph_check` means the subgraph was not checked against your graph.

## 16. Hand-off: ask the record

**What it is.** The workspace is its own Git repo, so a teammate (or another agent) can clone it. **Ask the record** starts a fresh agent that was not there and answers from the workspace alone, citing decisions, findings and commits.
**In the app.** *Record* → **Ask the record** → a question → **Ask** (the answer streams on the New connector page). Or in a terminal: clone the workspace and read `.factory/decisions`, `findings`, `memory.md` and `git log`.
**What you get.** An answer such as: the email is hidden because decision D-4yyj7v (Customer personal data, chosen "expose name, hide email and phone") was answered by a person with the note "Nobody consuming this graph needs them.", and an agent applied it as an omit.
**In practice.**
- Onboarding: "why is this field here?" answered without asking the author. **[shown]**
- Audits: "who decided to expose X, and when?" **[plausible]**
- A different agent (Claude Code, Codex, an IDE plugin) continuing the work from the clone. **[plausible; the skill is agent-neutral, we ran Claude Code only]**
**Watch for.** The answer is only as good as the reasons people typed. Empty or placeholder notes produce "the record does not say".

## 17. Schema review

**What it is.** The reviewer reads the subgraph the way a person would review a pull request: naming, nullability, pagination and list sizes, error modelling, entity keys, security, and what the evidence says did not run. It writes `review.md` with `VERDICT: PASS` or `VERDICT: CHANGES` and severity-ranked findings.
**In the app.** The *Validate* tab shows the review and its verdict. If it says CHANGES, **Have the author apply it** applies what the decisions allow and re-validates.
**What you get.** `review.md`, a finding "Schema review complete", a commit `review: ...`.
**In practice.**
- A pre-merge check on every schema change, as a checklist before human review. **[plausible]**
- Surfacing fan-out risk from link fields before it reaches production (the demo's review did). **[shown]**
**Watch for.** CHANGES does not block export; it is advice. Items that would overturn a decision are left for you.

---

## Playbooks: using the use cases together

**A. One-week pilot on a low-risk REST service.** Pick 3 to 5 read-only endpoints you know well. Day 1: use cases 1 or 2, 3. Day 2: 4, 5, 6 (answer with reasons). Day 3: 8, 10, 17. Day 4: 11, 12, 13. Day 5: 15, 16. Record the wall-clock time and the number of decisions against what hand-writing would have cost.
**B. API-change watch.** Keep the connector's workspace in a repo, run use case 14 whenever the vendor ships, answer the (few) new decisions, re-validate live (11), export (15). The "Upstream changed" finding is the changelog.
**C. A governance gate for privacy and security.** Make use case 6's decision log the artifact reviewers sign off, together with use case 17's verdict. Require a reason on every decision about personal data or credentials.
**D. Compare coding agents on the same task.** Give two agents the same API and workspace contract; compare decisions, evidence and rework. The skill is agent-neutral (use case 16); only Claude Code was run here. **[plausible]**
**E. Onboarding and audits.** Use case 16 over any existing workspace answers "why" questions with citations.

## What this does not do (so you do not expect it)

- It does not publish, push, merge or deploy, and never handles your GraphOS key.
- It builds REST connectors only. gRPC, database and existing-GraphQL sources are planned upstream, not built.
- It does not replace a human review of PII, secrets and fan-out; it makes the decisions explicit and recorded.
- It has not been evaluated on a large or messy real-world API yet. The recorded run is on a deliberately varied demo service (12 operations after v2).
