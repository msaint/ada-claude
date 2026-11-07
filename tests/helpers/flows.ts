import { call, key, type TestUser } from "./api";
import * as drafts from "@/app/api/v1/course-drafts/route";
import * as answer from "@/app/api/v1/course-drafts/[id]/answer/route";
import * as convert from "@/app/api/v1/course-drafts/[id]/convert/route";
import * as sessions from "@/app/api/v1/courses/[id]/sessions/route";
import type { CourseDraftView, SessionView } from "@/lib/schemas/dto";

/** Creates a course through the public API: topic → answer every question with the first quick reply → convert. */
export async function createCourseViaApi(user: TestUser, topic: string, answers: string[] = []) {
  let r = await call(drafts.POST, { user, body: { topic, idempotencyKey: key() } });
  let draft: CourseDraftView = r.json.draft;
  let i = 0;
  while (draft.state === "collecting" && draft.nextQuestion) {
    const a = answers[i++] ?? draft.nextQuestion.options[0] ?? "Let Ada decide";
    r = await call(answer.POST, { user, params: { id: draft.id }, body: { answer: a, expectedVersion: draft.version, idempotencyKey: key() } });
    draft = r.json.draft;
  }
  if (draft.state !== "ready") throw new Error(`draft not ready: ${JSON.stringify(draft)}`);
  const c = await call(convert.POST, { user, params: { id: draft.id }, body: {} });
  return { courseId: c.json.courseId as string, draft };
}

export async function startSession(user: TestUser, courseId: string, body: Record<string, unknown> = {}) {
  const r = await call(sessions.POST, { user, params: { id: courseId }, body });
  return r.json.session as SessionView;
}
