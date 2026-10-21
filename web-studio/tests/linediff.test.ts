import assert from "node:assert/strict";
import test from "node:test";
import { addedLines } from "../lib/linediff.ts";

test("lines added in the middle are marked by their number in the new file", () => {
  assert.deepEqual(addedLines("a\nb\nc\n", "a\nX\nb\nY\nZ\nc\n"), [2, 4, 5]);
});

test("an unchanged file has no marks; a new file marks every line", () => {
  assert.deepEqual(addedLines("a\nb\n", "a\nb\n"), []);
  assert.deepEqual(addedLines("", "a\nb"), [1, 2]);
});

test("a changed line counts as added and a removed line marks nothing", () => {
  assert.deepEqual(addedLines("a\nold\nc\n", "a\nnew\nc\n"), [2]);
  assert.deepEqual(addedLines("a\nb\nc\n", "a\nc\n"), []);
});

test("a huge rewrite is not marked, so the view never freezes", () => {
  const big = Array.from({ length: 4100 }, (_, i) => `line ${i}`).join("\n");
  assert.equal(addedLines("start\n" + big, "other\n" + big.replaceAll("line", "row")), null);
});
