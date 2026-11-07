import { afterAll, describe, expect, it } from "vitest";
import { call, key, makeUser } from "../helpers/api";
import { createCourseViaApi } from "../helpers/flows";
import * as drafts from "@/app/api/v1/course-drafts/route";
import * as draftById from "@/app/api/v1/course-drafts/[id]/route";
import * as answer from "@/app/api/v1/course-drafts/[id]/answer/route";
import * as back from "@/app/api/v1/course-drafts/[id]/back/route";
import * as propose from "@/app/api/v1/course-drafts/[id]/propose/route";
import * as convert from "@/app/api/v1/course-drafts/[id]/convert/route";
import * as courses from "@/app/api/v1/courses/route";
import * as outline from "@/app/api/v1/courses/[id]/outline/route";
import { closeDb, db } from "@/lib/db/client";

afterAll(closeDb);

describe("course creation", () => {
  it("new account has no courses", async () => {
    const user = await makeUser();
    const r = await call(courses.GET, { user });
    expect(r.status).toBe(200);
    expect(r.json.courses).toEqual([]);
  });

  it("asks exactly one question at a time and honours curiosity intent", async () => {
    const user = await makeUser();
    const r = await call(drafts.POST, { user, body: { topic: "Why are train wheels tapered?", idempotencyKey: key() } });
    expect(r.status).toBe(201);
    const d = r.json.draft;
    expect(d.state).toBe("collecting");
    expect(typeof d.nextQuestion.text).toBe("string");
    expect(d.nextQuestion.options.length).toBeGreaterThan(0);
    expect(d.devModel).toBe(true);

    const r2 = await call(answer.POST, { user, params: { id: d.id }, body: { answer: "Just curious", expectedVersion: d.version, idempotencyKey: key() } });
    const d2 = r2.json.draft;
    // either a single follow-up question or ready — never several
    expect(d2.nextQuestion === undefined || typeof d2.nextQuestion.text === "string").toBe(true);
    const r3 = await call(answer.POST, { user, params: { id: d.id }, body: { answer: "Quick, five minutes", expectedVersion: d2.version, idempotencyKey: key() } });
    const d3 = r3.json.draft;
    expect(d3.state).toBe("ready");
    expect(d3.proposal.intent).toBe("curiosity");
    expect(d3.proposal.initialConceptTitles.length).toBeGreaterThanOrEqual(3);
    expect(d3.proposal.initialConceptTitles.length).toBeLessThanOrEqual(8);
  });

  it("start now skips remaining questions with explicit assumptions", async () => {
    const user = await makeUser();
    const { json } = await call(drafts.POST, { user, body: { topic: "history of ball bearings in bicycles", idempotencyKey: key() } });
    const r = await call(answer.POST, { user, params: { id: json.draft.id }, body: { startNow: true, expectedVersion: json.draft.version, idempotencyKey: key() } });
    expect(r.json.draft.state).toBe("ready");
    expect(r.json.draft.proposal.assumptions.length).toBeGreaterThan(0);
  });

  it("goal topics produce goal courses", async () => {
    const user = await makeUser();
    const { courseId, draft } = await createCourseViaApi(user, "I want to learn Python to automate spreadsheet tasks");
    expect(draft.proposal!.intent).toBe("goal");
    const list = await call(courses.GET, { user });
    expect(list.json.courses).toHaveLength(1);
    expect(list.json.courses[0]).toMatchObject({ id: courseId, intent: "goal" });
    const o = await call(outline.GET, { user, params: { id: courseId } });
    expect(o.json.outline.concepts.length).toBeGreaterThanOrEqual(3);
    expect(o.json.outline.concepts.every((c: { status: string }) => c.status === "not_assessed")).toBe(true);
    expect(o.json.outline.concepts.some((c: { prerequisiteTitles: string[] }) => c.prerequisiteTitles.length > 0)).toBe(true);
  });

  it("draft creation is idempotent by key", async () => {
    const user = await makeUser();
    const k = key();
    const [a, b] = await Promise.all([
      call(drafts.POST, { user, body: { topic: "Chess", idempotencyKey: k } }),
      call(drafts.POST, { user, body: { topic: "Chess", idempotencyKey: k } }),
    ]);
    expect(a.json.draft.id).toBe(b.json.draft.id);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from course_drafts where owner_id = ${user.id}`;
    expect(n).toBe(1);
  });

  it("duplicate answer submissions are applied once; stale versions conflict", async () => {
    const user = await makeUser();
    const { json } = await call(drafts.POST, { user, body: { topic: "Chess", idempotencyKey: key() } });
    const d = json.draft;
    const k = key();
    const first = await call(answer.POST, { user, params: { id: d.id }, body: { answer: "Beat casual friends", expectedVersion: d.version, idempotencyKey: k } });
    const dup = await call(answer.POST, { user, params: { id: d.id }, body: { answer: "Beat casual friends", expectedVersion: d.version, idempotencyKey: k } });
    expect(dup.status).toBe(200);
    expect(dup.json.draft.version).toBe(first.json.draft.version);
    const stale = await call(answer.POST, { user, params: { id: d.id }, body: { answer: "x", expectedVersion: d.version, idempotencyKey: key() } });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe("conflict");
  });

  it("back reopens the previous question and invalidates the proposal", async () => {
    const user = await makeUser();
    const { json } = await call(drafts.POST, { user, body: { topic: "Black holes", idempotencyKey: key() } });
    const q1 = json.draft.nextQuestion.text;
    const r = await call(answer.POST, { user, params: { id: json.draft.id }, body: { answer: "Just curious", expectedVersion: json.draft.version, idempotencyKey: key() } });
    const b = await call(back.POST, { user, params: { id: json.draft.id }, body: { expectedVersion: r.json.draft.version } });
    expect(b.json.draft.nextQuestion.text).toBe(q1);
    expect(b.json.draft.proposal).toBeUndefined();
  });

  it("converts exactly once even under concurrent requests", async () => {
    const user = await makeUser();
    const { json } = await call(drafts.POST, { user, body: { topic: "Black holes", idempotencyKey: key() } });
    const r = await call(answer.POST, { user, params: { id: json.draft.id }, body: { startNow: true, expectedVersion: json.draft.version, idempotencyKey: key() } });
    const id = r.json.draft.id;
    const results = await Promise.all([1, 2, 3].map(() => call(convert.POST, { user, params: { id }, body: {} })));
    const ids = new Set(results.map((x) => x.json.courseId));
    expect(ids.size).toBe(1);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from courses where owner_id = ${user.id}`;
    expect(n).toBe(1);
    const again = await call(draftById.GET, { user, params: { id } });
    expect(again.json.draft.state).toBe("converted");
  });

  it("model timeout during proposal keeps answers and allows retry without duplicates", async () => {
    const user = await makeUser();
    const topic = "Fermentation [[fail-once:compile]]";
    const { json } = await call(drafts.POST, { user, body: { topic, idempotencyKey: key() } });
    const r = await call(answer.POST, { user, params: { id: json.draft.id }, body: { startNow: true, expectedVersion: json.draft.version, idempotencyKey: key() } });
    expect(r.status).toBe(200);
    expect(r.json.draft.state).toBe("collecting");
    expect(r.json.draft.error).toMatchObject({ code: "model_timeout", retryable: true });
    expect(r.json.draft.turns.some((t: { text: string }) => t.text === "Start now")).toBe(true);
    const retry = await call(propose.POST, { user, params: { id: json.draft.id }, body: { expectedVersion: r.json.draft.version } });
    expect(retry.json.draft.state).toBe("ready");
    expect(retry.json.draft.error).toBeNull();
    const c1 = await call(convert.POST, { user, params: { id: json.draft.id }, body: {} });
    const c2 = await call(convert.POST, { user, params: { id: json.draft.id }, body: {} });
    expect(c1.json.courseId).toBe(c2.json.courseId);
  });

  it("adjust recompiles the proposal with the learner's request", async () => {
    const user = await makeUser();
    const { json } = await call(drafts.POST, { user, body: { topic: "Sourdough", idempotencyKey: key() } });
    const r = await call(answer.POST, { user, params: { id: json.draft.id }, body: { startNow: true, expectedVersion: json.draft.version, idempotencyKey: key() } });
    const adj = await call(propose.POST, { user, params: { id: json.draft.id }, body: { adjustment: "starter maintenance", expectedVersion: r.json.draft.version } });
    expect(adj.json.draft.state).toBe("ready");
    expect(adj.json.draft.proposal.initialConceptTitles.join(" ")).toContain("starter maintenance");
  });

  it("validates topic length", async () => {
    const user = await makeUser();
    const r = await call(drafts.POST, { user, body: { topic: "x".repeat(501), idempotencyKey: key() } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("validation_failed");
  });
});
