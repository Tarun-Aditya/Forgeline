import assert from "node:assert/strict";
import test from "node:test";
import { parseAgent } from "../lib/agents.ts";

test("parses frontmatter and trims the prompt", () => {
  const a = parseAgent("builder.md", "---\nname: builder\ndescription: Builds things.\ntools: Read, Bash, Edit\nmodel: opus\n---\n\nYou build one job.\n");
  assert.equal(a.name, "builder");
  assert.deepEqual(a.tools, ["Read", "Bash", "Edit"]);
  assert.equal(a.model, "opus");
  assert.equal(a.prompt, "You build one job.");
  assert.equal(a.file, ".claude/agents/builder.md");
});

test("a file without frontmatter still lists by file name", () => {
  const a = parseAgent("odd.md", "just text");
  assert.equal(a.name, "odd");
  assert.equal(a.description, "");
  assert.equal(a.model, null);
});
