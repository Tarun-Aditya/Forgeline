import { expect, test } from "@playwright/test";

// Use case: ask for a small feature in a real repo, accept the drafted intent, and get a spec back to approve.
test("a feature request becomes a spec waiting for my approval", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Forgeline" })).toBeVisible();
  await expect(page.getByText("No jobs yet")).toBeVisible();

  const box = page.getByPlaceholder(/Describe a task/);
  await box.fill("/factory Add an isIdle boolean property to the limit function. It is true when nothing is running or queued.");
  await box.press("Enter");

  // Step 1: the intent-writer drafts intent.md and the job waits in "Intent" for me to accept it.
  const card = page.getByRole("button", { name: /isIdle/i }).first();
  await expect(card).toBeVisible({ timeout: 6 * 60_000 });
  await card.click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept intent" }).click({ timeout: 6 * 60_000 });
  await page.keyboard.press("Escape");

  // Step 2: the spec-writer runs; the card then lands in "Approve spec" and asks for me.
  await expect(card).toContainText("your call", { timeout: 10 * 60_000 });
  await expect(page.getByRole("button", { name: /^Board\s*1/ })).toBeVisible();

  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/spec-approval/)).toBeVisible();
  await expect(dialog.getByText(/acceptance criteria/i).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Approve spec" })).toBeEnabled();
  await page.waitForTimeout(1500);
});
