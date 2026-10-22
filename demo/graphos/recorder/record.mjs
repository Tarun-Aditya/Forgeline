// Records the GraphOS demo: the Studio web app (web-studio/) in GraphOS mode taking a REST API (the Lumen Books demo service) to a validated,
// exported Apollo subgraph, covering all 16 things the mode does, in one video.
//
// The agents' runs are replays of the real golden run (fake_claude.py + fixtures/), so no model is called and every
// take is the same. Everything on screen is the real web app, and the buttons, cards and Git commits are real.
// Run it through demo/graphos/run-graphos-demo.sh.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKit } from "./kit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:3111";
const REPO = process.env.DEMO_REPO ?? "/tmp/gx-demo-repo";
const FIX = process.env.DEMO_FIXTURES ?? path.join(HERE, "..", "fixtures");
const OUT = process.env.DEMO_OUT ?? path.join(HERE, "out");
const NAME = process.env.DEMO_NAME ?? "forgeline-graphos-demo";
const WS = "lumen_books";
const DOCS = "lumen_docs";
const timeline = JSON.parse(fs.readFileSync(path.join(FIX, "timeline.json"), "utf8"));
const answers = timeline.answers; // what the golden run chose, by decision id
const handEdit = timeline.handEdit;
const stepOf = (name) => timeline.steps.find((s) => s.name === name);

const k = await createKit({ out: OUT });
const { page, hold, cap, capTop, card, glide, click, nav, finish, closeDialog, until, log, finishUp } = k;

// ---- small helpers over the real UI ---------------------------------------------------------
const api = (p) => page.evaluate(async (u) => (await fetch(u)).json(), p);
const repoQ = encodeURIComponent(REPO);
const runsIdle = async () => (await api("/api/runs")).runs.every((r) => r.status !== "running");
const wsState = async (n) => (await api(`/api/graphos/${n}?repo=${repoQ}`)).state;
const stageIs = (n, ...s) => async () => s.includes((await wsState(n))?.stage);
const decisions = async (n) => (await api(`/api/graphos/${n}?repo=${repoQ}`)).decisions;
const wsFull = (n) => api(`/api/graphos/${n}?repo=${repoQ}`);
// Numbers in the narration are read from the replayed workspace at the moment they are spoken, so they match the screen.
const facts = async (n = WS) => {
  const w = await wsFull(n);
  const layers = w.evidence?.layers ?? {};
  const find = (re) => w.findings.find((f) => re.test(`${f.title} ${f.body ?? ""}`));
  return {
    ops: w.operations.length,
    schemaLines: w.schema ? w.schema.text.split("\n").length : 0,
    unit: layers.connector_unit?.cases ?? 0,
    e2e: layers.wiremock_e2e?.cases ?? 0,
    live: layers.live?.cases ?? 0,
    should: (w.review?.match(/\*\*should\*\*/g) ?? []).length,
    nullFinding: find(/null/i)?.title ?? "A response did not match the spec.",
  };
};
// A card docks a side panel; "Open connector" opens the full dialog.
const open = async (n) => {
  await nav("Board");
  await click(page.getByTestId(`gx-card-${n}`));
  await click(page.getByTestId("gx-open"));
};
const tab = (t) => click(page.getByTestId(`gx-tab-${t}`));
const dialog = () => page.getByTestId("gx-dialog");
const quiet = () => until("the replay to finish", runsIdle);
// Never wait on a bare screen: say something useful while a run is still going, and stop the moment it is done.
async function fill(lines, done = runsIdle) {
  for (const [title, text, vo] of lines) {
    if (await done()) break;
    await cap(title, text, vo);
    await finish(100);
  }
  await until("the replay to finish", done);
}

// A decision card answered the way the golden run answered it (its choices, by position), with a reason typed in.
async function answer(id, why, { slow = false } = {}) {
  const a = answers[id];
  const cardEl = page.getByTestId(`gx-decision-${id}`);
  await cardEl.scrollIntoViewIfNeeded();
  for (const c of a.chosen) {
    const label = cardEl.locator("label").nth(a.choices.indexOf(c));
    if (slow) await click(label); else await label.click();
  }
  if (why) {
    const box = cardEl.getByLabel("Reason");
    if (slow) await click(box); else await box.click();
    await box.fill(why);
  }
  if (slow) await hold(500);
  const save = page.getByTestId(`gx-answer-${id}`);
  if (slow) await click(save); else await save.click();
  await hold(slow ? 900 : 350);
}
const openDecisions = async (n) => (await decisions(n)).filter((d) => d.status === "open" && d.phase !== "scope");
const byTitle = (list, re) => list.find((d) => re.test(d.title) || re.test(d.question ?? ""));

try {
  await page.goto(BASE);
  await hold(800);

  // ================================================================ 0. what this is
  await card("GraphOS mode", "A REST API in. An Apollo subgraph out. Every decision on record.",
    "Forgeline has a second mode. It is called GraphOS.\n\nYou give it a REST API.\nIt gives you an Apollo subgraph, and a record of every decision behind it.", "Forgeline · GraphOS");
  await finish(300);
  await card();

  await cap("The software factory", "The mode you already know.",
    "This is Forgeline as you know it. The software factory. Jobs move across a board.");
  await finish(200);
  await click(page.getByTestId("mode-graphos"));
  await hold(900);
  await cap("Same app, new pipeline", "GraphOS is one switch away. Same tabs, same runs, same alerts.",
    "Now I switch to GraphOS.\nSame app. Same tabs. Same runs panel and alerts.\nBut a different pipeline.");
  await finish(200);
  await cap("Six stages, two of them yours", "Inventory, Scope, Design, Apply, Validate, Export.",
    "Six stages. Inventory. Scope. Design. Apply. Validate. And Export.\n\nTwo of them are yours. Scope, where you choose what goes in. And Design, where you settle the hard questions.\nThe agents do the rest, and stop for you at those two.");
  await finish(300);

  // ================================================================ 1. sources, and what is not built
  await nav("New connector");
  await cap("What it can start from", "An OpenAPI or Swagger spec, or only a docs link. gRPC, databases and GraphQL are not built yet.",
    "You can start from an OpenAPI or Swagger spec.\nOr from nothing but a link to the docs.\n\nThese greyed-out sources, gRPC, databases, and existing GraphQL APIs, are planned in Apollo's skill but not built yet. So the app says so, instead of faking it.");
  await glide(page.getByRole("button", { name: /gRPC/ }));
  await finish(300);

  await nav("New connector");
  await cap("A real service to work on", "A small bookshop API, running locally. Version one.",
    "For the demo there is a small bookshop API. Books, authors, customers, orders. I start version one of it right here.");
  await click(page.getByRole("button", { name: "Start v1" }));
  await until("demo api", async () => (await api(`/api/graphos-demo?repo=${repoQ}`)).running);
  await finish(200);

  // ================================================================ 2. docs only (use case: no spec)
  await cap("Start from docs only", "No OpenAPI file. Just a link to a docs page.",
    "First, the hard case. No spec at all. Only a docs page.");
  await click(page.getByTestId("gx-fill-docs"));
  await finish(150);
  await click(page.getByTestId("gx-start"));
  await cap("The intake agent", "It reads the page, then probes the live service with GET requests.",
    `The intake agent reads the docs. Then, because there is no spec, it asks the real service. Only read requests. The credential comes from an environment variable, and is never written down.\n\nIt builds the inventory of what the API offers from what it saw.`);
  await fill([
    ["Unproven stays unproven", "What it could not confirm is written down as such.",
      "Anything it could not confirm, it writes down as unconfirmed. A guess is never recorded as a fact."],
  ], stageIs(DOCS, "scope"));
  await finish(200);
  await open(DOCS);
  await cap("The inventory, from docs", `${(await facts(DOCS)).ops} operations found, with no spec.`,
    `${(await facts(DOCS)).ops} operations, found from a docs page and a few safe requests. That is enough to start.`);
  await finish(200);
  await closeDialog();

  // ================================================================ 3. customer-specific, then the plain spec
  const TENANT = "lumen_tenant";
  await nav("New connector");
  await cap("Generic or customer-specific", "Some APIs have fields that differ per customer. Tick this and the agents assess that first.",
    "One question up front. Is this a plain wrapper, or does your tenant add custom fields, like custom objects or analytics?\nIf it does, you tick this box, and the agents assess that before they write anything.");
  await click(page.getByTestId("gx-fill-spec"));
  await page.getByLabel("Connector name").fill(TENANT);
  await click(page.getByLabel(/Customer-specific fields/));
  await finish(150);
  await click(page.getByTestId("gx-start"));
  await cap("The assessment", "Before authoring, the agents decide what the tenant model would add, and what they would need from you.",
    "The intake agent reads the spec, and then assesses the tenant. What would be customer-specific here, and what would it need from me? Metadata exports, custom objects, credentials. It records the answer first, and does not ask for any of it unless it must.");
  await until("tenant workspace", stageIs(TENANT, "scope"));
  await quiet();
  await finish(200);
  await open(TENANT);
  await tab("record");
  await cap("Recorded, not assumed", "The assessment is saved in the workspace, with the card marked customer-specific.",
    "And the assessment is saved in the workspace, in the record. The card is marked customer-specific, so nobody mistakes it for a plain wrapper.");
  await finish(300);
  await closeDialog();

  await nav("New connector");
  await cap("Start from a spec", "The usual case: an OpenAPI file, a plain wrapper.",
    "Now the usual case. An OpenAPI file, and a plain wrapper.");
  await click(page.getByTestId("gx-fill-spec"));
  await finish(100);
  await click(page.getByTestId("gx-start"));
  await cap("Inventory", "A Git workspace is created. The spec is pinned.",
    "The workspace is created as its own Git repository. The spec is pinned byte for byte, so we can tell later what the API team changed.\n\nThen every operation and type is listed.");
  await until("spec workspace", stageIs(WS, "scope"));
  await quiet();
  await finish(300);

  // ================================================================ 4. scope
  await cap("Scope, your call", "The card is pink: it is waiting on you.",
    "And the card turns pink. It is waiting on me.");
  await finish(200);
  await open(WS);
  await cap("Pick what goes in", "The selector proposed a small read-only start.",
    "The selector has proposed a small starting scope. Read-only things it can explain in a sentence. Everything else is left out, with the reason written next to it.");
  await finish(200);
  await cap("A POST that may be a read", "Flagged, so a person decides.",
    "See this one. A POST, called search. It might only read. The tool does not guess. It flags it, and the question comes later.");
  await glide(page.getByTestId("gx-op-searchBooks"));
  await finish(200);
  await cap("Switch the rest on", `${(await facts()).ops} operations in all: reads, writes, one that returns personal data, one with a secret.`,
    "For this demo I want the whole picture. So I switch on the rest. The customer, with its personal data. The orders. The writes. And the integration, which carries a secret.");
  const boxes = dialog().getByRole("checkbox");
  const total = await boxes.count();
  for (let i = 0; i < total; i++) {
    if (!(await boxes.nth(i).isChecked())) { await glide(boxes.nth(i)); await boxes.nth(i).check(); await hold(220); }
  }
  await finish(150);
  await click(page.getByTestId("gx-save-scope"));
  await hold(1200);
  await cap("Saved as a commit", "Every change to scope is a Git commit in the workspace.",
    "Saving writes the selection into the workspace, and commits it. Nothing about the scope lives only in a screen.");
  await finish(200);
  await click(page.getByTestId("gx-confirm-scope"));
  await hold(800);
  await closeDialog();

  // ================================================================ 5. design pass
  await nav("Agents");
  await cap("The design pass", "The selector now asks every question that a person should answer.",
    "With the scope confirmed, the selector goes through every included operation, and asks about everything a person should decide.\n\nIt does not guess. And it does not chat. Each question becomes a decision, saved in the workspace.");
  await until("design stage", stageIs(WS, "design"));
  await quiet();
  await finish(300);
  await nav("Board");
  await finish(100);
  await open(WS);
  await tab("decisions");
  const open1 = await openDecisions(WS);
  await cap("Decision cards", `${open1.length} questions, each with real alternatives and a recommendation.`,
    `${open1.length} questions are waiting. Each one has real alternatives, and the agent's recommendation. Let me take a few.`);
  await finish(200);

  const pii = byTitle(open1, /personal data|email|phone/i);
  const secret = byTitle(open1, /apiKey|credential|secret/i);
  const post = byTitle(open1, /searchBooks|query or mutation/i);
  const paging = byTitle(open1, /pagination/i);
  if (pii) {
    await capTop("Personal data", "Expose, hide or mask the customer's email and phone?",
      "A customer has an email and a phone number. Expose them, hide them, or mask them? The recommendation is to hide them, unless a consumer needs them. I hide them, and say why.");
    await answer(pii.id, "Nobody consuming this graph needs them.", { slow: true });
  }
  if (secret) {
    await capTop("A secret", "A field called apiKey. Expose it to every caller?",
      "An integration returns an API key. Anyone allowed to query that field could read the secret. So I exclude it.");
    await answer(secret.id, "A secret must not be readable by every caller.", { slow: true });
  }
  if (post) {
    await capTop("The POST that reads", "Query or mutation?",
      "The search endpoint is a POST, but it only reads. As a query, callers and caches can treat it as safe. I choose query.");
    await answer(post.id, "It only reads.", { slow: true });
  }
  if (paging) {
    await capTop("Pagination", "Expose the paging arguments and the page info?",
      "And pagination. The recommendation is to expose the arguments and return the page information, so a caller knows when to stop.");
    await answer(paging.id, "Callers need to reach later pages.", { slow: true });
  }
  const links = byTitle(open1, /relationship|link/i);
  if (links) {
    await capTop("Links between types", "Each link is one extra request per parent. Keep which?",
      "Relationships between types. A book has an author. An order item has a book. Each link is one more request to the service for every parent, so the tool asks which to keep.");
    await answer(links.id, "The links callers need most.", { slow: true });
  }
  const ent = byTitle(open1, /entit|@key|federation/i);
  if (ent) {
    await capTop("Federation entities", "Can other subgraphs reference or extend these types?",
      "And one question that only matters in a federated graph. Should a type be an entity? If it is, other teams' subgraphs can reference it, and extend it. Every entity needs a lookup by its key. The recommendation depends on whether another team already needs it.");
    await answer(ent.id, "Other teams' graphs reference books and authors.", { slow: true });
  }
  await cap("The rest, the same way", "Mutations to keep, null handling, links between types, payment details, entities.",
    "The others are the same kind of thing. Which writes to keep. What a null argument sends. Which relationships to expose, each one an extra request. How to show payment details. Whether any type is a federation entity.\n\nI answer them, and every answer is saved with its reason.");
  for (const d of await openDecisions(WS)) await answer(d.id, null);
  await hold(800);
  await cap("Every answer is a Git commit", "The reason is kept. This is the answer to why a field exists.",
    "Each answer is a commit in the workspace. A year from now, anyone can ask why a field exists, or why one was left out, and the answer is here, with who decided it and why.");
  await finish(300);

  // ================================================================ 6. apply
  await cap("Apply", "The author writes the schema, the tests, and the coverage.",
    "Now every question is settled, and the next step is not mine. The author.");
  await click(page.getByTestId("gx-continue"));
  await hold(500);
  await closeDialog();
  await nav("Agents");
  await cap("The author", "It writes only what the decisions allow, and edits only what changed.",
    "The author writes the subgraph. It honours every decision. A hidden field is not selected. A secret is not there. A chosen root is the root.\n\nAnd it never regenerates the schema from scratch. After the first commit, it works out the difference, and edits only that. That is how hand edits survive.");
  await fill([
    ["Tests for every operation", "Including the error answers, and a check that nothing the API offers is silently dropped.",
      "While it works, it also writes tests. One for every operation, and for the documented errors too.\nThen a coverage check. Every field the API offers is either mapped, or left out on purpose, with a recorded reason. Nothing is dropped by accident."],
    ["Evidence, not claims", "Each test runs against a stand-in for the real API.",
      "Each test runs against a stand-in for the real service, so a run costs nothing, and gives the same answer every time."],
  ], stageIs(WS, "validate", "export"));
  await cap("Validator and reviewer", "Each layer runs for real: composition, Connector tests, a mocked Router, conformance, lint.",
    "Then the validator runs every layer. Then the reviewer reads the schema the way a person would review a pull request.");
  await quiet();
  await finish(300);
  await nav("Board");
  await open(WS);
  await tab("schema");
  await cap("The subgraph", `${(await facts()).schemaLines} lines of Apollo Connectors schema. One file, editable by hand.`,
    "This is the result. A subgraph, written with Apollo Connectors. Each field says exactly which REST call it makes, and how the response maps. It is a plain file. A person can edit it.");
  await hold(1200);
  await page.getByTestId("gx-schema").locator("pre").evaluate((el) => el.scrollTo({ top: 1200, behavior: "smooth" }));
  await finish(300);

  // ================================================================ 7. validate
  await tab("validate");
  const f1 = await facts();
  await cap("Validate", "Every layer, with its own result. Nothing that did not run is shown as a pass.",
    `Validation, layer by layer. The composition check. ${f1.unit} Connector unit cases. ${f1.e2e} runs through a mocked Router. Conformance against the spec. Lint.\n\nAnd look at the ones that did not run. They say so. A layer that did not run is never shown as a pass.`);
  await finish(200);
  await cap("A failure, shown", "Write-body proof fails. It is reported as an open finding, never as a pass.",
    "One layer shows a failure. The write body proof. It could not place one argument on the request. The tool treats that layer as informational, so it does not block. But it is shown in red, and nobody can say it passed.");
  await finish(200);
  await cap("Your own supergraph", "Checked only if you provide a graph and a key. Otherwise it says not run.",
    "One layer is worth a word. Checking this subgraph against your own supergraph needs your graph and your key. The tool never asks for the key. So here it says not run, and the page says plainly that the subgraph has not been checked against your supergraph.");
  await finish(300);
  await page.getByTestId("gx-validate").evaluate((el) => el.scrollIntoView());
  await cap("The review", `A verdict, and ${f1.should} things it would change.`,
    `Below, the reviewer's verdict. It says changes, with ${f1.should} things worth fixing. Fan-out from the link fields. A payment key that could send a null. Live checks not yet run.\n\nIt is a review, not a rubber stamp.`);
  await page.getByTestId("gx-review").scrollIntoViewIfNeeded();
  await finish(300);
  // ================================================================ 8. live check
  await cap("Live check", "Run every read against the real service and compare with the spec.",
    "So far everything ran against stubs. Now the real service. Every read operation is called for real, and compared with what the spec promised. The credential comes from an environment variable. Writes are left alone.");
  await click(page.getByTestId("gx-live-go"));
  await closeDialog();
  await nav("Agents");
  await fill([
    ["Reads only", "Writes are listed as excluded, with the reason.",
      "Only read operations are called. Every write is listed as excluded, with the reason, so nothing changes in the real service."],
    ["Ids from the lists", "Each by-id read uses an id the list call returned.",
      "Each lookup by id uses an id that a list call returned a moment before, so the test never depends on a made-up value."],
  ]);
  await finish(300);
  await nav("Board");
  await open(WS);
  await tab("validate");
  const f2 = await facts();
  await cap("Live: pass", `${f2.live} live cases passed against the running API.`,
    `And the live layer passes. ${f2.live} real calls, matching the spec.`);
  await finish(300);

  await page.getByTestId("gx-review").scrollIntoViewIfNeeded();
  await click(page.getByTestId("gx-apply-review"));
  await cap("Apply the review", "One click sends the author back, then validation runs again.",
    "I can send it back. One click, and the author applies what the decisions allow, and validation runs again.");
  await closeDialog();
  await nav("Agents");
  await fill([
    ["Only what the decisions allow", "Anything that would change a decision is left for you.",
      "The author reads the review, and applies only the fixes that the decisions already allow. If a fix would overturn something I decided, it leaves that for me."],
    ["Validation runs again", "So the evidence always matches the schema it describes.",
      "Then validation runs again. Evidence is only true for the schema it ran against, so it is never reused."],
  ]);
  await finish(300);

  // ================================================================ 9. record traffic
  await nav("Board");
  await open(WS);
  await tab("record");
  await cap("Record real traffic", "Scrubbed samples of what the API really returns, and where it differs from the spec.",
    "Next, record real traffic. A recorder calls the read operations, scrubs the samples, and builds test fixtures from them.\n\nMore important, it compares what the API really does with what the spec says.");
  await click(page.getByTestId("gx-record-go"));
  await closeDialog();
  await nav("Agents");
  await fill([
    ["Scrubbed first", "Credentials are removed before anything touches disk.",
      "Every sample is scrubbed before it is written. Credentials never reach the workspace."],
  ]);
  await finish(300);
  await nav("Board");
  await open(WS);
  await tab("record");
  const f3 = await facts();
  await cap("Spec versus reality", "Where the real API differs from the spec.",
    `And it found something. ${f3.nullFinding.replace(/[`*_]/g, "")}. The spec says one thing. The service does another. That is now a finding in the workspace, so the next person does not rediscover it.`);
  await finish(400);

  // ================================================================ 10. hand edit
  await tab("schema");
  await cap("A hand edit", "An engineer changes the schema directly.",
    "Now a real-life thing. An engineer opens the schema file, and changes it by hand.");
  await finish(100);
  const sf = path.join(REPO, "graphos-demo", WS, handEdit.file);
  const lines = fs.readFileSync(sf, "utf8").split("\n");
  const at = lines.findIndex((l) => l.includes(handEdit.find));
  lines[at] = lines[at].replace(/\s+$/, "") + handEdit.append;
  fs.writeFileSync(sf, lines.join("\n"));
  await page.getByTestId("gx-handedit").waitFor({ timeout: 20000 });
  await cap("Detected, not lost", "The skill noticed. Record why, and the next apply keeps it.",
    "The tool notices. A hand edit is the thing a generator usually destroys, so it stops, and asks for the reason. I click codify, and the author records why the edit exists, and what must stay true, so a later apply keeps it.");
  await click(page.getByTestId("gx-codify"));
  await closeDialog();
  await nav("Agents");
  await quiet();
  await finish(300);

  // ================================================================ 11. the API changes
  await nav("Board");
  await cap("The API changes", "Another team ships version two, and nobody tells you.",
    "Now the thing that hurts most. The team behind the API ships a new version, and nobody tells you. I start version two of the service.");
  await nav("New connector");
  await click(page.getByRole("button", { name: "Start v2" }));
  await until("v2", async () => (await api(`/api/graphos-demo?repo=${repoQ}`)).apiVersion === 2);
  await finish(200);
  await open(WS);
  await tab("record");
  await cap("Check for API changes", "Give it the newer spec. It compares against what you selected.",
    "I give it the new spec. The reconciler refreshes the pinned copy, and compares it with the old one. Not in general. Against what I selected.");
  await page.getByLabel("New spec").fill("demo/graphos/openapi.v2.json");
  await click(page.getByTestId("gx-refresh"));
  await closeDialog();
  await nav("Agents");
  await quiet();
  await finish(200);
  await nav("Board");
  await cap("API changed", "The card says so, and the questions are back.",
    "The card now says API changed. And the questions are back. A removed endpoint. A new one. A deprecated field. A new value in an enum.");
  await open(WS);
  await tab("decisions");
  const open2 = await openDecisions(WS);
  await cap("Answer what changed", `${open2.length} decisions about the change, each classified against your scope.`,
    `${open2.length} decisions, only about what changed. Nothing is regenerated, and nothing is decided for me.`);
  await finish(200);
  for (const d of open2) await answer(d.id, null);
  await hold(500);
  await click(page.getByTestId("gx-continue"));
  await closeDialog();
  await nav("Agents");
  await cap("Reconcile, don't regenerate", "The author edits only the difference, then validation runs again.",
    "Now the author applies only the difference. The hand edit survives. And the validation runs again.");
  await fill([
    ["A removed endpoint, replaced", "The old call is gone upstream, and a new one takes its place.",
      "The old endpoint is gone upstream, and a new one takes its place. The author swaps one for the other, and nothing else moves."],
    ["Your hand edit survives", "It was recorded with a reason, so the author keeps it.",
      "The hand edit from earlier is still there. It was recorded with its reason, so the author knew to keep it, and checks that it still holds."],
  ]);
  await finish(300);

  // Applying a change can raise one more question or leave the live layer unrun. Do what a person would, until it is ready.
  for (let round = 0; round < 8; round++) {
    const w = await wsFull(WS);
    const st = w.state;
    const todo = w.decisions.filter((d) => d.status === "open" && d.phase !== "scope");
    const live = w.evidence?.layers?.live?.status;
    if (todo.length) {
      await open(WS);
      await tab("decisions");
      await cap("One more question", "Applying the change surfaced one more thing only a person can decide.",
        "Applying the change surfaced one more thing only a person can decide. I answer it.");
      for (const d of todo) await answer(d.id, null);
      await finish(200);
      await closeDialog();
    } else if (st.next) {
      await open(WS);
      await cap("Apply it", "The author applies the answers.", "The next step is not mine. The author applies what I just answered.");
      await click(page.getByTestId("gx-continue"));
      await nav("Agents");
      await fill([
        ["Only the difference", "The author edits the schema where the answers say, and nothing else.",
          "The author edits the schema where those answers say, and nowhere else. Then validation runs again."],
        ["Tests for the change", "Each change gets its own tests.", "Each change gets its own tests, so the evidence always matches the schema it describes."],
      ]);
    } else if (st.stage === "export" && live !== "pass") {
      await open(WS);
      await tab("validate");
      await cap("Check version two for real", "The live layer runs against the running service again.",
        "Because the API is now version two, I run the live check again, against the real service.");
      await click(page.getByTestId("gx-live-go"));
      await nav("Agents");
      await fill([
        ["Why the live layer matters", "A stub can only repeat what you already believed.",
          "This is why the live layer matters. A stub can only repeat what you already believed. The real service has to answer the new endpoint itself."],
        ["Version two, for real", "Every read is called against the running service.",
          "Every read operation is called against the running version two. And the new reviews endpoint has to answer."],
      ]);
    } else {
      break;
    }
  }
  await finish(300);

  // ================================================================ 11b. compose with other subgraphs (a local stand-in for the supergraph check)
  await open(WS);
  await tab("validate");
  await cap("Your supergraph, locally", "Compose with the other subgraphs in your graph. No key needed.",
    "Earlier I said the check against my own supergraph could not run. Here is what can run. Compose this subgraph with the other teams' subgraphs, locally. A reviews subgraph extends the same book entity. If the names or the key types disagreed, composition would fail here.");
  await finish(100);
  await click(page.getByTestId("gx-compose-go"));
  await nav("Agents");
  await fill([
    ["A second team's subgraph", "It extends the Book entity with a review count.",
      "The second subgraph is another team's. It extends the same Book entity with a review count. The tool renders this one without its placeholders, points the supergraph config at it, and asks rover to compose."],
    ["Local, and honest about it", "This is not a check against GraphOS.",
      "This is a local composition. It is not a check against GraphOS, and the page says so. The real check needs your graph and your key."],
  ]);
  await open(WS);
  await tab("validate");
  await page.getByTestId("gx-compose").scrollIntoViewIfNeeded();
  await cap("Composed", "The result is saved as a finding.", "And the result is saved in the workspace, as a finding.");
  await finish(300);
  await closeDialog();

  // ================================================================ 12. export
  await nav("Board");
  await open(WS);
  await tab("validate");
  await cap("Export", "The production URL goes in here. It never publishes.",
    "When I am ready, export. I give it the production base URL. It writes the subgraph, and prints the rover commands. It never publishes anything itself. That step is mine.");
  await page.getByLabel("Production base URL").fill("https://api.lumenbooks.example");
  await hold(500);
  await click(page.getByTestId("gx-export-go"));
  await fill([
    ["The hand-over", "Two rover commands, and the credential variables the router needs.",
      "The exporter writes the subgraph with that production address, and prints two rover commands for me to run, a check, and a publish. It also lists the router's credential variables, and everything it could not verify."],
    ["It never publishes", "Publishing needs your graph and your key, and it never touches either.",
      "It never runs those commands, and it never handles my GraphOS key. Publishing is my step."],
  ]);
  await nav("Board");
  await cap("Exported", "A finding records the hand-over.",
    "Exported. And the hand-over is itself recorded in the workspace.");
  await finish(300);

  // ================================================================ 13. hand-off: a fresh reader asks the record
  await open(WS);
  await tab("record");
  await cap("A record someone else can pick up", "Decisions, findings, notes and the full history, in the workspace's own Git repo.",
    "And this is what is left behind. Every decision with its reason. Every finding. The notes. The full history, in the workspace's own Git repository.\n\nA teammate can clone it. Another agent, in Claude Code, Codex, or an editor, can pick it up from exactly here.");
  await page.getByText(/History in Git/).scrollIntoViewIfNeeded();
  await finish(300);
  await page.getByTestId("gx-ask").scrollIntoViewIfNeeded();
  await cap("Ask the record", "A fresh agent that was not here reads only the workspace, and answers with citations.",
    "To show that, I ask it a question, the way a new teammate would. Why is the customer's email not in the schema, and who decided that?\n\nA fresh agent, that was not here for any of this, reads only the workspace.");
  await click(page.getByTestId("gx-ask-go"));
  await fill([
    ["Only the record", "Decisions, findings, notes and Git history. Nothing else.",
      "It reads the decisions, the findings, the notes, and the Git history. Nothing else, and nothing from my memory."],
  ]);
  await cap("The answer cites the decision", "Who decided, when, and the reason that was typed in.",
    "And the answer cites the decision. Who made it, when, and the reason that was typed in at the time. That is what the record is for.");
  await finish(1500);
  await nav("Runs");
  await cap("Resume anywhere", "Every run keeps its session. Pick it up in a terminal.",
    "Every run also keeps its session, so you can pick any of them up in a terminal.");
  await finish(300);

  // ================================================================ 14. the list
  await cap();
  await card("Sixteen things, one video", "Docs-only and spec intake. Customer-specific. Scope. POST that reads. Links and entities. Design decisions. Apply. Hand edits. Validation layers. Supergraph composition. Live traffic. API changes. Export. Hand-off. Review.",
    "That was the whole mode.\n\nStart from a spec, or from docs alone. Say whether it is plain or customer-specific. Choose the scope. Decide the reads, the links, and the sensitive fields. Apply. Keep hand edits. Validate in layers. Compose with your other subgraphs. Record real traffic. Follow the API when it changes. Export. And leave a record anyone can pick up.\n\nForgeline, in GraphOS mode.", "Forgeline · GraphOS");
  await finish(2200);
  log("demo finished");
} catch (e) {
  log("FAILED", e.message);
  await page.screenshot({ path: path.join(OUT, "failure.png") });
  process.exitCode = 1;
} finally {
  await finishUp(NAME);
}
