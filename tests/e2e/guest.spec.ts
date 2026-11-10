import { expect, test } from "@playwright/test";
import { sidebarCourses } from "./helpers";

test("a first-time visitor creates and starts a course with no account, then signs up and keeps it", async ({ page }) => {
  // No sign-up: straight to the prompt.
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "What would you like to learn?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create free account" })).toBeVisible();

  await page.getByLabel("What would you like to learn?").fill("Why are train wheels tapered?");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\/new\?draft=/);
  await expect(page.getByText(/trying Ada as a guest/)).toBeVisible();
  await page.getByRole("button", { name: /Start now/ }).click();
  await page.getByRole("button", { name: "Start course" }).click();
  await page.waitForURL(/\/app\/courses\//);
  const courseUrl = page.url();
  // The new course opens straight into its first step.
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible();

  // A second course needs an account.
  await page.goto("/app");
  await expect(page.getByText("Guests can try one course.")).toBeVisible();
  await page.getByLabel("What would you like to learn?").fill("Chess");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Save your progress with an account" });
  await expect(dialog).toBeVisible();

  // Sign up from the dialog; the guest course comes along.
  await dialog.getByRole("link", { name: "Create account" }).click();
  await page.waitForURL(/\/login\?mode=signup/);
  await expect(page.getByRole("heading", { name: "Save your progress" })).toBeVisible();
  await page.getByLabel("Email").fill(`guest-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByText(/trying Ada as a guest/)).toHaveCount(0);
  await expect(sidebarCourses(page)).toHaveCount(1);
  await page.goto(courseUrl);
  await expect(page.getByText("step 1")).toBeVisible();

  // Now a second course is allowed.
  await page.goto("/app");
  await page.getByLabel("What would you like to learn?").fill("Chess");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\/new\?draft=/);
});
