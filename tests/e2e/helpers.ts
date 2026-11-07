import { expect, type Page } from "@playwright/test";

export async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const r = await page.request.post("/api/v1/auth/signup", { data: { email, password: "password123", timezone: "America/New_York" } });
  expect(r.status()).toBe(201);
  return email;
}

/** Creates a ready course through the API (start-now path) for tests that don't exercise setup. */
export async function apiCourse(page: Page, topic: string) {
  const key = `${Date.now()}-${Math.random()}`;
  const d = await (await page.request.post("/api/v1/course-drafts", { data: { topic, idempotencyKey: key } })).json();
  const a = await (await page.request.post(`/api/v1/course-drafts/${d.draft.id}/answer`, { data: { startNow: true, expectedVersion: d.draft.version, idempotencyKey: `${key}-a` } })).json();
  expect(a.draft.state).toBe("ready");
  const c = await (await page.request.post(`/api/v1/course-drafts/${d.draft.id}/convert`, { data: {} })).json();
  return c.courseId as string;
}

export const sidebarCourses = (page: Page) => page.getByRole("list", { name: "Your courses" }).getByRole("listitem");
