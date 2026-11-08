import { afterAll, afterEach, describe, expect, it } from "vitest";
import { call, key, makeUser } from "../helpers/api";
import * as drafts from "@/app/api/v1/course-drafts/route";
import * as answer from "@/app/api/v1/course-drafts/[id]/answer/route";
import * as convert from "@/app/api/v1/course-drafts/[id]/convert/route";
import { closeDb, db } from "@/lib/db/client";
import { setModelOverride } from "@/lib/ai";
import { MockLearningModel } from "@/lib/ai/mock-model";
import type { CourseDraftContext, CurriculumContext, ActivityContext } from "@/lib/ai/model-adapter";

afterAll(closeDb);
afterEach(() => setModelOverride(undefined));

const JOB = "https://job-boards.greenhouse.io/anthropic/jobs/5096878008";

/** Dev model that behaves like a provider which read the linked page on the first clarify call. */
class LinkReadingModel extends MockLearningModel {
  clarifyContexts: CourseDraftContext[] = [];
  compileContexts: CurriculumContext[] = [];
  activityContexts: ActivityContext[] = [];
  async clarifyCourse(c: CourseDraftContext) {
    this.clarifyContexts.push(c);
    const r = await super.clarifyCourse(c);
    if (c.linkContext) return r;
    const linkContext = "Role: Research Engineer. Requires Python, distributed systems, ML evals. Learner: 10 years product leadership.";
    const value = r.value.status === "ask" ? { ...r.value, link_context: linkContext } : { ...r.value, interpretation: { ...r.value.interpretation, link_context: linkContext } };
    return { value, info: { ...r.info, sources: [{ url: JOB, title: "Research Engineer — Anthropic", retrievedAt: "2026-11-08T00:00:00.000Z" }] } };
  }
  async compileCurriculum(c: CurriculumContext) {
    this.compileContexts.push(c);
    return super.compileCurriculum(c);
  }
  async generateActivity(c: ActivityContext) {
    this.activityContexts.push(c);
    return super.generateActivity(c);
  }
}

describe("linked pages in course setup", () => {
  it("keeps what Ada read, reuses it instead of re-fetching, and records verified sources on the course", async () => {
    const model = new LinkReadingModel();
    setModelOverride(model);
    const user = await makeUser();
    const d = (await call(drafts.POST, { user, body: { topic: `Fill my gaps for this role: ${JOB}`, idempotencyKey: key() } })).json.draft;
    expect(d.sourcesRead).toEqual([{ url: JOB, title: "Research Engineer — Anthropic" }]);

    const ready = (await call(answer.POST, { user, params: { id: d.id }, body: { startNow: true, expectedVersion: d.version, idempotencyKey: key() } })).json.draft;
    expect(ready.state).toBe("ready");
    // Later calls receive the stored summary (so the adapter won't fetch again).
    expect(model.clarifyContexts.at(-1)!.linkContext).toContain("Research Engineer");
    expect(model.compileContexts.at(-1)!.linkContext).toContain("Research Engineer");

    const { courseId } = (await call(convert.POST, { user, params: { id: d.id }, body: {} })).json;
    const refs = await db()<{ url: string; title: string; source_type: string }[]>`select url, title, source_type from source_references where course_id = ${courseId}`;
    expect(refs).toEqual([{ url: JOB, title: "Research Engineer — Anthropic", source_type: "learner_link" }]);
    const [g] = await db()<{ baseline_json: { link_context?: string } }[]>`select baseline_json from course_goal_versions where course_id = ${courseId}`;
    expect(g.baseline_json.link_context).toContain("ML evals");
  });
});
