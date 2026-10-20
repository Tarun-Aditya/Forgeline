import { expect, test } from "@playwright/test";

// Use case: a finished job's agents can be replayed, with what each handed to the next and the checks it passed.
test("the Agents tab replays a finished job and shows each hand-off", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Agents" }).click();
  await page.getByLabel("Job", { exact: true }).selectOption("002-dark-mode");

  // A finished job is a replay, not "Live".
  await expect(page.getByRole("button", { name: /Pause|Replay/ })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
  await expect(page.getByText("9 agents").or(page.getByText(/\d+ agents/)).first()).toBeVisible();

  // Jump to the end: everyone is done and the hand-off labels are drawn.
  await page.getByRole("slider", { name: "Job time" }).fill("1000");
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
  await expect(page.getByText("spec: 2 acceptance criteria")).toBeVisible();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  for (const name of ["Intent writer", "Spec writer", "Planner", "Builder", "Approver"]) await expect(page.getByText(name, { exact: true })).toBeVisible();

  // Scrub back to the start: the later hand-offs are not there yet.
  await page.getByRole("slider", { name: "Job time" }).fill("0");
  await expect(page.getByText("spec: 2 acceptance criteria")).toHaveCount(0);
  await page.waitForTimeout(800);
});
