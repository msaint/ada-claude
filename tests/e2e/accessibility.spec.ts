import { expect, test, devices } from "@playwright/test";
import { apiCourse, sidebarCourses, signUp } from "./helpers";

test("keyboard-only: create a course, answer with radios, pause and resume", async ({ page }) => {
  await signUp(page);
  await page.goto("/app");
  // Prompt is autofocused
  await expect(page.getByLabel("What would you like to learn?")).toBeFocused();
  await page.keyboard.type("Black holes");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\/new/);
  // Focus moves to the question heading; tab to the first quick reply
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Just curious" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/quick explanation/);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Start course" })).toBeVisible();
  await page.getByRole("button", { name: "Start course" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\/courses\//);

  // A newly created course opens straight into its first step (no extra Start click).
  const first = page.getByRole("radio").first();
  await expect(first).toBeVisible();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Check answer" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible();
  // Continue receives focus after feedback
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("step 2")).toBeVisible();

  // Escape closes dialogs
  await page.getByRole("button", { name: "Course options" }).click();
  await page.getByRole("menuitem", { name: "Change goal" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test.describe("mobile", () => {
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  void _ignored;
  test.use(iphone);
  test("drawer navigation and no horizontal scroll", async ({ page }) => {
    await signUp(page);
    const id = await apiCourse(page, "A very long course topic name that should truncate gracefully without breaking the layout at all");
    await page.goto(`/app/courses/${id}`);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(sidebarCourses(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#mobile-drawer")).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: "New course" }).click();
    await page.waitForURL(/\/app$/);
    await expect(page.locator("#mobile-drawer")).toBeHidden();
    await expect(page.getByLabel("What would you like to learn?")).toBeVisible();
  });
});

test("another user's course is not reachable by URL", async ({ page, browser }) => {
  await signUp(page);
  const id = await apiCourse(page, "Chess");
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signUp(other);
  const res = await other.goto(`/app/courses/${id}`);
  expect(res?.status()).toBe(404);
  const api = await other.request.get(`/api/v1/courses/${id}`);
  expect(api.status()).toBe(404);
  await ctx.close();
});
