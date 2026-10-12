import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { FAKE_LOG } from "./fixture.ts";

// Use case: work started in the terminal or VS Code shows up in the web app, and a question from it can be answered there.
test("sessions started outside the app are listed, and their question can be answered", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator("aside");

  // Listed with where they ran.
  await expect(panel.getByRole("button", { name: /terminal.*Add dark mode/ })).toBeVisible();
  await panel.getByRole("button", { name: /terminal.*Add dark mode/ }).click();
  await expect(panel.getByText("claude --resume s-demo")).toBeVisible();
  await expect(panel.getByText("/factory add dark mode", { exact: false }).first()).toBeVisible();

  // Job 003's VS Code session ended on a question: the badge is on the card, and the answer resumes that session.
  const card = page.getByRole("button", { name: /003 · add-export/ });
  await expect(card).toContainText("needs your answer");
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Which file format should the export use?")).toBeVisible();
  await dialog.getByLabel("Your answer").fill("use CSV");
  await dialog.getByRole("button", { name: "Send answer" }).click();
  await page.keyboard.press("Escape");
  await expect(card).not.toContainText("needs your answer", { timeout: 20_000 });

  const calls = fs.readFileSync(FAKE_LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { args: string[] });
  const answer = calls.find((c) => c.args.includes("s-ask"))!;
  expect(answer.args[answer.args.indexOf("--resume") + 1]).toBe("s-ask");
  expect(answer.args.at(-1)).toBe("use CSV");
  await page.waitForTimeout(800);
});
