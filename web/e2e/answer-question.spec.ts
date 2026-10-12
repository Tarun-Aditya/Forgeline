import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { FAKE_LOG } from "./fixture.ts";

// Use case: an agent stops to ask something. The job card says so, I answer on the card, and the same session carries on.
test("an agent's question shows on the job and my answer resumes the session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Forgeline" })).toBeVisible();
  const card = page.getByRole("button", { name: /001 · add-search/ });

  // Accepting the intent makes the (fake) agent stop and ask which repo.
  await card.click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept intent" }).click();
  await page.keyboard.press("Escape");
  await expect(card).toContainText("needs your answer", { timeout: 20_000 });

  // The question and a reply box are on the job itself.
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Which repo should this job target?")).toBeVisible();
  await dialog.getByLabel("Your answer").fill("use the web repo");
  await dialog.getByRole("button", { name: "Send answer" }).click();

  // The answer went to the same session, and the job moved on so the question is gone.
  await page.keyboard.press("Escape");
  await expect(card).not.toContainText("needs your answer", { timeout: 20_000 });
  const calls = fs.readFileSync(FAKE_LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { args: string[] });
  const answer = calls.at(-1)!;
  expect(answer.args).toContain("--resume");
  expect(answer.args.at(-1)).toBe("use the web repo");
  expect(answer.args[answer.args.indexOf("--resume") + 1]).toBe("fake-session-1");
  await page.waitForTimeout(800);
});
