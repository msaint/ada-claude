import { expect, test } from "@playwright/test";
import { apiCourse, sidebarCourses, signUp } from "./helpers";

test("curiosity journey: topic → one-at-a-time setup → course → assessment → feedback → reload resumes", async ({ page }) => {
  await signUp(page);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "What would you like to learn?" })).toBeVisible();
  await expect(page.getByText("Your courses will appear here")).toBeVisible();
  await expect(page.getByText(/Development model active/)).toBeVisible();

  await page.getByLabel("What would you like to learn?").fill("Why are train wheels tapered?");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\/new\?draft=/);

  // Exactly one question visible at a time
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await page.getByRole("button", { name: "Just curious" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/quick explanation or a deeper/);
  // Refresh mid-setup resumes the same question
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/quick explanation or a deeper/);
  await page.getByRole("button", { name: "Quick, five minutes" }).click();

  await expect(page.getByText("Your starting path")).toBeVisible();
  await expect(page.getByText("Curiosity course")).toBeVisible();
  await page.getByRole("button", { name: "Start course" }).click();
  await page.waitForURL(/\/app\/courses\//);
  await expect(sidebarCourses(page)).toHaveCount(1);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Make a prediction")).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // explanation → continue → a check question
  await expect(page.getByText("Learn", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Check your understanding")).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().includes("/draft") && r.request().method() === "PUT");
  await page.getByRole("radio").nth(1).check();
  await saved;
  const promptText = await page.locator("article").innerText();

  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeVisible();
  expect(await page.locator("article").innerText()).toBe(promptText);
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible();

  // Evidence shows up in the outline
  await page.getByRole("link", { name: "Outline" }).click();
  await expect(page.getByText("Developing").first()).toBeVisible();
  await expect(page.getByText(/provisional/)).toBeVisible();

  // Curiosity branch extends the same course
  await page.getByLabel("Curious about something related?").fill("wheel wear");
  await page.getByRole("button", { name: "Add to this course" }).click();
  await page.waitForURL(/focus=/);
  await expect(sidebarCourses(page)).toHaveCount(1);
  await page.getByRole("link", { name: "Outline" }).click();
  await expect(page.getByText("Curiosity branch")).toBeVisible();
});

test("goal journey: clarifications (incl. free text) → first lesson → evidence-based progress", async ({ page }) => {
  await signUp(page);
  await page.goto("/app");
  await page.getByLabel("What would you like to learn?").fill("I want to learn Python to automate spreadsheet tasks");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/app\/new/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/experience/);
  // Unexpected free-text answer instead of a quick reply
  await page.getByLabel("Or answer in your own words").fill("I wrote a few Excel macros years ago");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/time/);
  await page.getByRole("button", { name: "1 hour" }).click();
  await expect(page.getByText("Goal course")).toBeVisible();
  await expect(page.getByText(/You'll know it's working when/)).toBeVisible();
  await page.getByRole("button", { name: "Start course" }).click();
  await page.waitForURL(/\/app\/courses\//);

  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page.getByText(/Estimated readiness for/)).toBeVisible();
  await expect(page.getByText("Not enough evidence yet").first()).toBeVisible();

  // New goal courses open with a placement diagnostic: no teaching, no hints, answers withheld.
  await page.getByRole("link", { name: "Learn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Find your starting point" })).toBeVisible();
  await page.getByRole("button", { name: "Start placement" }).click();
  const results = page.getByRole("heading", { name: "Here's where you stand" });
  for (let i = 0; i < 6; i++) {
    await expect(page.getByText("Placement — answer what you can").or(results)).toBeVisible();
    if (await results.isVisible()) break;
    await expect(page.getByRole("button", { name: "Hint" })).toHaveCount(0);
    if ((await page.getByRole("radio").count()) > 0) await page.getByRole("radio").first().check();
    else await page.getByLabel("Your answer").fill("It works because each step leads to the next, which means the script runs.");
    await page.getByRole("button", { name: "Check answer" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  }
  await expect(results).toBeVisible();
  await page.getByRole("button", { name: /^Start (with|learning)/ }).click();

  // The lesson begins where placement suggested; work to the first question, then use a hint.
  const hintButton = page.getByRole("button", { name: "Hint" });
  const continueButton = page.getByRole("button", { name: "Continue" });
  for (let i = 0; i < 3; i++) {
    await expect(hintButton.or(continueButton).first()).toBeVisible();
    if (await hintButton.isVisible()) break;
    await continueButton.click(); // past an explanation
    await expect(continueButton).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "Harder" })).toBeVisible();
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.getByText("Help used")).toBeVisible();
  if ((await page.getByRole("radio").count()) > 0) await page.getByRole("radio").first().check();
  else await page.getByLabel("Your answer").fill("It works because each step leads to the next, which means the script runs.");
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible();

  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page.getByText(/Assisted answers and lesson views don't count|Not enough evidence yet/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("%");
});

test("sidebar lists exactly one item per course and never sessions", async ({ page }) => {
  await signUp(page);
  const a = await apiCourse(page, "Black holes");
  await apiCourse(page, "Chess");
  await page.goto(`/app/courses/${a}`);
  await expect(sidebarCourses(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  await page.goto("/app");
  await expect(sidebarCourses(page)).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Courses" }).first()).not.toContainText(/chat|session|lesson \d/i);
  await expect(page.getByText(/Pick up where you left off/)).toBeVisible();

  // Delete one course from the sidebar menu; the other stays
  await page.getByRole("button", { name: "Options for Chess" }).click();
  await page.getByRole("menuitem", { name: "Delete course" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete course" }).click();
  await expect(sidebarCourses(page)).toHaveCount(1);
  await expect(sidebarCourses(page).first()).toContainText("Black Holes");
});

test("model failure during proposal keeps answers and retry creates one course", async ({ page }) => {
  await signUp(page);
  await page.goto("/app");
  await page.getByLabel("What would you like to learn?").fill("Fermentation [[fail-once:compile]]");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\/new/);
  await page.getByRole("button", { name: /Start now/ }).click();
  const alert = page.getByRole("alert").filter({ hasText: /took too long/ });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Your starting path")).toBeVisible();
  await page.getByRole("button", { name: "Start course" }).dblclick();
  await page.waitForURL(/\/app\/courses\//);
  await expect(sidebarCourses(page)).toHaveCount(1);
  const list = await (await page.request.get("/api/v1/courses")).json();
  expect(list.courses).toHaveLength(1);
});
