import { afterAll, afterEach, describe, expect, it } from "vitest";
import { call, key, makeUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as login from "@/app/api/v1/auth/login/route";
import * as cron from "@/app/api/cron/cleanup/route";
import * as drafts from "@/app/api/v1/course-drafts/route";
import * as answer from "@/app/api/v1/course-drafts/[id]/answer/route";
import * as background from "@/app/api/v1/course-drafts/[id]/background/route";
import * as convert from "@/app/api/v1/course-drafts/[id]/convert/route";
import * as next from "@/app/api/v1/sessions/[id]/next/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import { closeDb, db } from "@/lib/db/client";
import { resetEnvCache } from "@/lib/env";
import { setModelOverride } from "@/lib/ai";
import { MockLearningModel } from "@/lib/ai/mock-model";
import type { ActivityContext, CourseDraftContext, CurriculumContext } from "@/lib/ai/model-adapter";
import type { SessionView } from "@/lib/schemas/dto";

afterAll(closeDb);
const savedEnv = { ...process.env };
afterEach(() => {
  setModelOverride(undefined);
  process.env = { ...savedEnv };
  resetEnvCache();
});

describe("sign-in attempt limit", () => {
  it("blocks further attempts for an email after repeated failures, without affecting other accounts", async () => {
    const victim = await makeUser();
    const other = await makeUser();
    for (let i = 0; i < 8; i++) {
      const r = await call(login.POST, { body: { email: victim.email, password: "wrong-password" } });
      expect(r.status).toBe(401);
    }
    const blocked = await call(login.POST, { body: { email: victim.email, password: "correct horse battery" } });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("rate_limited");
    const fine = await call(login.POST, { body: { email: other.email, password: "correct horse battery" } });
    expect(fine.status).toBe(200);
    // The window passes: sign-in works again.
    await db()`update auth_attempts set created_at = now() - interval '20 minutes'`;
    expect((await call(login.POST, { body: { email: victim.email, password: "correct horse battery" } })).status).toBe(200);
    const [{ raw }] = await db()<{ raw: number }[]>`select count(*)::int as raw from auth_attempts where email_hash like '%@%'`;
    expect(raw).toBe(0); // emails are stored hashed
  });
});

describe("scheduled cleanup", () => {
  const get = (headers: Record<string, string> = {}) => cron.GET(new Request("http://localhost:3000/api/cron/cleanup", { headers }));
  it("refuses without the secret and runs with it", async () => {
    expect((await get()).status).toBe(401); // no secret configured
    process.env.CRON_SECRET = "a-long-enough-cron-secret";
    resetEnvCache();
    expect((await get({ authorization: "Bearer wrong" })).status).toBe(401);
    await db()`insert into auth_attempts (email_hash, ok, created_at) values ('old', false, now() - interval '3 days')`;
    const ok = await get({ authorization: "Bearer a-long-enough-cron-secret" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).authAttempts).toBeGreaterThanOrEqual(1);
  });
});

class RecordingModel extends MockLearningModel {
  clarify: CourseDraftContext[] = [];
  compile: CurriculumContext[] = [];
  activity: ActivityContext[] = [];
  async clarifyCourse(c: CourseDraftContext) {
    this.clarify.push(c);
    return super.clarifyCourse(c);
  }
  async compileCurriculum(c: CurriculumContext) {
    this.compile.push(c);
    return super.compileCurriculum(c);
  }
  async generateActivity(c: ActivityContext) {
    this.activity.push(c);
    const r = await super.generateActivity(c);
    return c.webGrounding ? { ...r, info: { ...r.info, sources: [{ url: "https://example.org/tides", title: "Tides explained", retrievedAt: null }] } } : r;
  }
}

describe("pasted background", () => {
  it("is saved, sent to setup model calls, re-plans a ready proposal, and is kept with the course", async () => {
    const model = new RecordingModel();
    setModelOverride(model);
    const user = await makeUser();
    const d0 = (await call(drafts.POST, { user, body: { topic: "Machine learning evaluation", idempotencyKey: key() } })).json.draft;
    const ready = (await call(answer.POST, { user, params: { id: d0.id }, body: { startNow: true, expectedVersion: d0.version, idempotencyKey: key() } })).json.draft;
    expect(ready.state).toBe("ready");
    const compilesBefore = model.compile.length;
    const withBg = await call(background.POST, { user, params: { id: d0.id }, body: { text: "  10 years as a product manager; shipped two ML products.  ", expectedVersion: ready.version } });
    expect(withBg.status).toBe(200);
    expect(withBg.json.draft).toMatchObject({ state: "ready", background: "10 years as a product manager; shipped two ML products." });
    expect(model.compile.length).toBe(compilesBefore + 1); // re-planned with the background
    expect(model.compile.at(-1)!.background).toContain("product manager");
    expect(model.clarify.at(-1)!.background).toContain("product manager");
    const stale = await call(background.POST, { user, params: { id: d0.id }, body: { text: "x", expectedVersion: ready.version } });
    expect(stale.status).toBe(409);
    const { courseId } = (await call(convert.POST, { user, params: { id: d0.id }, body: {} })).json;
    const [g] = await db()<{ baseline_json: { background?: string } }[]>`select baseline_json from course_goal_versions where course_id = ${courseId}`;
    expect(g.baseline_json.background).toContain("product manager");
  });
});

async function answerAndAdvance(user: Awaited<ReturnType<typeof makeUser>>, s: SessionView): Promise<SessionView> {
  const a = s.activity!;
  if (a.kind !== "explanation") {
    const [{ spec }] = await db()<{ spec: { correctChoiceId?: string } }[]>`select spec_json as spec from activities where id = ${a.id}`;
    const response = a.kind === "multiple_choice" ? { choiceId: spec.correctChoiceId } : { text: "Because each part leads to the next, which means it holds together." };
    await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response } });
  }
  return (await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: a.id } })).json.session;
}

describe("lesson length follows the learner's time budget", () => {
  it("a quick course gets a 5-step lesson (ending with a reflection for curiosity courses)", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Why are train wheels tapered?", ["Just curious", "Quick, five minutes"]);
    let s = await startSession(user, courseId, { kind: "lesson" });
    const purposes: string[] = [];
    while (s.status !== "completed") {
      purposes.push(s.activity!.purpose);
      s = await answerAndAdvance(user, s);
    }
    expect(purposes).toHaveLength(5);
    expect(purposes.at(-1)).toBe("reflect");
  });
});

describe("web-checked explanations", () => {
  it("are off by default; when on, explanations carry verified sources that are shown and stored", async () => {
    process.env.ADA_PREFETCH = "off"; // each step is generated when asked for, so the flag change below applies
    const model = new RecordingModel();
    setModelOverride(model);
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Tides", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId, { kind: "lesson" });
    expect(model.activity.every((c) => !c.webGrounding)).toBe(true);

    process.env.ADA_WEB_GROUNDING = "on";
    resetEnvCache();
    s = await answerAndAdvance(user, s); // prediction → explanation
    expect(s.activity!.kind).toBe("explanation");
    expect(model.activity.at(-1)).toMatchObject({ kind: "explanation", webGrounding: true });
    expect((s.activity as { sources?: unknown }).sources).toEqual([{ url: "https://example.org/tides", title: "Tides explained" }]);
    const refs = await db()<{ url: string; source_type: string }[]>`select url, source_type from source_references where activity_id = ${s.activity!.id}`;
    expect(refs).toEqual([{ url: "https://example.org/tides", source_type: "web_search" }]);
    // Questions are never web-searched.
    s = await answerAndAdvance(user, s);
    expect(model.activity.at(-1)).toMatchObject({ kind: "multiple_choice", webGrounding: false });
  });
});
