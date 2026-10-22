import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listWorkspaces, parseDecisions, parseOperations, parseSelection, readWorkspace, resolveDecision, setSelection, validName, workspacePath } from "../lib/graphos.ts";
import { buildPrompt, jobKey } from "../lib/runner.ts";

const REPO = path.resolve(import.meta.dirname, "..", "..");

const SELECTION = `contract_version: 2
defaults:
  fields: all
operations:
  "get:/books": { include: true, graphql: { root: query, name: books } }
  "get:/books/{bookId}": { include: true, graphql: { root: query, name: book } }
  "post:/books/search": { include: false, reason: "POST that may be a read; ask" }
  "post:/orders":
    include: true
    graphql: { root: mutation, name: createOrder }
`;

function workspace(root: string, name = "lumen_books") {
  const ws = path.join(root, "graphos", name);
  const fac = path.join(ws, ".factory");
  fs.mkdirSync(path.join(fac, "decisions"), { recursive: true });
  fs.mkdirSync(path.join(fac, "findings"), { recursive: true });
  fs.writeFileSync(path.join(fac, "workspace.yaml"), "service: lumen_books\ndirectory: lumen-books\nintake: spec\nsource_kind: rest\ncontext_mode: generic\n");
  fs.writeFileSync(path.join(fac, "inventory.json"), JSON.stringify({
    api: { title: "Lumen Books API", version: "1.0.0", base_urls: ["http://127.0.0.1:4010"], pagination: { style: "cursor" } },
    operations: [
      { key: "get:/books", operation_id: "listBooks", method: "GET", path: "/books", summary: "List books", tags: ["Catalog"], semantics: "read" },
      { key: "get:/books/{bookId}", operation_id: "getBook", method: "GET", path: "/books/{bookId}", summary: "Get one book", tags: ["Catalog"], semantics: "read" },
      { key: "post:/books/search", operation_id: "searchBooks", method: "POST", path: "/books/search", summary: "Search", tags: ["Catalog"], semantics: "unknown" },
      { key: "post:/orders", operation_id: "createOrder", method: "POST", path: "/orders", summary: "Place an order", tags: ["Orders"], semantics: "write" },
      { key: "delete:/orders/{orderId}", operation_id: "cancelOrder", method: "DELETE", path: "/orders/{orderId}", summary: "Cancel", tags: ["Orders"], semantics: "write", deprecated: true },
    ],
  }));
  fs.writeFileSync(path.join(fac, "selection.yaml"), SELECTION);
  fs.writeFileSync(path.join(fac, "decisions", "D-aaa111-pii.json"), JSON.stringify({
    contract_version: 2,
    decision: { id: "D-aaa111", title: "Expose email?", status: "open", phase: "select", question: "?", choices: [{ id: "expose", label: "Expose" }, { id: "hide", label: "Hide" }] },
  }));
  fs.writeFileSync(path.join(fac, "decisions", "D-bbb222-scope.json"), JSON.stringify({
    contract_version: 2,
    decision: { id: "D-bbb222", title: "Confirm scope", status: "resolved", phase: "scope", choices: [{ id: "confirm", label: "ok" }], resolution: { chosen: ["confirm"], by: "user", at: "2026-10-21" } },
  }));
  return ws;
}

test("workspace names: only plain folder names", () => {
  assert.ok(validName("lumen_books"));
  assert.ok(!validName("../etc"));
  assert.ok(!validName("a b"));
  assert.ok(!validName(""));
});

test("parseSelection reads one-line and block entries", () => {
  const sel = parseSelection(SELECTION);
  assert.deepEqual(sel.get("get:/books"), { include: true, reason: undefined, name: "books", root: "query" });
  assert.equal(sel.get("post:/books/search")?.include, false);
  assert.equal(sel.get("post:/books/search")?.reason, "POST that may be a read; ask");
  assert.equal(sel.get("post:/orders")?.include, true);
  assert.equal(sel.get("post:/orders")?.name, "createOrder");
  assert.equal(sel.get("post:/orders")?.root, "mutation");
  assert.equal(parseSelection(null).size, 0);
});

test("parseSelection ignores the links: section", () => {
  const sel = parseSelection('operations:\n  "get:/a": { include: true }\nlinks:\n  - shape: A\n    include: true\n  "get:/zz": { include: true }\n');
  assert.deepEqual([...sel.keys()], ["get:/a"]);
});

test("parseOperations: operations the selection does not list are null, not false", () => {
  const ops = parseOperations({ operations: [{ key: "get:/a", method: "GET", path: "/a" }, { key: "get:/b", method: "GET", path: "/b" }] }, 'operations:\n  "get:/a": { include: true }\n');
  assert.equal(ops[0].include, true);
  assert.equal(ops[1].include, null);
  const hinted = parseOperations({ operations: [{ key: "post:/s", method: "POST", path: "/s", read_hint: "carries search", support: "needs_review" }] }, null)[0];
  assert.equal(hinted.readHint, "carries search");
  assert.equal(hinted.support, "needs_review");
});

test("readWorkspace puts the pieces together", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "gx-"));
  workspace(repo);
  fs.mkdirSync(path.join(repo, "factory", "scripts"), { recursive: true });
  fs.copyFileSync(path.join(REPO, "factory", "scripts", "graphos_state.py"), path.join(repo, "factory", "scripts", "graphos_state.py"));
  const ws = await readWorkspace(repo, "lumen_books");
  assert.equal(ws.api.title, "Lumen Books API");
  assert.equal(ws.operations.length, 5);
  assert.equal(ws.operations.find((o) => o.operationId === "cancelOrder")?.deprecated, true);
  assert.equal(ws.decisions.filter((d) => d.status === "open").length, 1);
  assert.equal(ws.state.stage, "design");
  assert.equal(ws.state.selection?.included, 3);
  const list = await listWorkspaces(repo);
  assert.deepEqual(list.map((w) => w.name), ["lumen_books"]);
  assert.throws(() => workspacePath(repo, "missing"));
  assert.throws(() => workspacePath(repo, "../x"));
});

test("answers go through the skill's CLI, and only valid ones", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "gx-"));
  const ws = workspace(repo);
  execFileSync("git", ["init", "-q"], { cwd: ws });
  const log = path.join(repo, "calls.log");
  const bin = path.join(repo, "fake-core.sh");
  fs.writeFileSync(bin, `#!/bin/sh\necho "$@" >> "${log}"\n`, { mode: 0o755 });
  process.env.GRAPHOS_FACTORY_CORE_BIN = bin;
  try {
    await resolveDecision(repo, "lumen_books", "D-aaa111", ["hide"], "not needed");
    assert.match(fs.readFileSync(log, "utf8"), /decisions resolve \. --id D-aaa111 --chosen hide --note not needed --by user/);
    await assert.rejects(resolveDecision(repo, "lumen_books", "D-aaa111", ["nope"]), /not a choice/);
    await assert.rejects(resolveDecision(repo, "lumen_books", "D-aaa111", []), /Pick an answer/);
    await assert.rejects(resolveDecision(repo, "lumen_books", "D-aaa111", ["hide", "expose"]), /one answer/);
    await assert.rejects(resolveDecision(repo, "lumen_books", "D-bbb222", ["confirm"]), /already resolved/);
    await assert.rejects(resolveDecision(repo, "lumen_books", "D-x; rm -rf", ["hide"]), /Bad decision id/);
    await setSelection(repo, "lumen_books", [{ key: "post:/books/search", include: true }, { key: "post:/orders", include: false }]);
    const calls = fs.readFileSync(log, "utf8");
    assert.match(calls, /selection set \. --op post:\/books\/search --include true/);
    assert.match(calls, /selection set \. --op post:\/orders --include false/);
    await assert.rejects(setSelection(repo, "lumen_books", [{ key: "get:/not-in-inventory", include: true }]), /Unknown operation/);
  } finally {
    delete process.env.GRAPHOS_FACTORY_CORE_BIN;
  }
});

test("parseDecisions reads the legacy log too", () => {
  const fac = fs.mkdtempSync(path.join(os.tmpdir(), "gx-"));
  fs.writeFileSync(path.join(fac, "decisions.json"), JSON.stringify({ decisions: [{ id: "D-0001", title: "Old", status: "resolved" }] }));
  assert.deepEqual(parseDecisions(fac).map((d) => d.id), ["D-0001"]);
});

test("/graphos commands pass through and lock on the workspace", () => {
  assert.equal(buildPrompt({ text: "/graphos continue lumen_books" }), "/graphos continue lumen_books");
  assert.equal(jobKey("/graphos continue lumen_books"), "gx-lumen_books");
  assert.equal(jobKey("/graphos new orders_api --spec demo/x.json"), "gx-orders_api");
  assert.equal(jobKey("/graphos validate a.b-c"), "gx-a.b-c");
  assert.equal(jobKey("/graphos status"), null);
});
