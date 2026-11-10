// A deliberately tiny pool, like one Vercel instance. Must be set before the pool is created.
process.env.DB_POOL_MAX = "3";

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { call, key, makeUser, type TestUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as drafts from "@/app/api/v1/course-drafts/route";
import * as answer from "@/app/api/v1/course-drafts/[id]/answer/route";
import * as next from "@/app/api/v1/sessions/[id]/next/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import * as hint from "@/app/api/v1/activities/[id]/hint/route";
import { closeDb, db } from "@/lib/db/client";
import { setModelOverride } from "@/lib/ai";
import { MockLearningModel } from "@/lib/ai/mock-model";
import type { LearningModel } from "@/lib/ai/model-adapter";
import type { SessionView } from "@/lib/schemas/dto";

afterAll(closeDb);
afterEach(() => setModelOverride(undefined));

/**
 * A slow model that, while "thinking", checks that this app holds no open
 * transaction (a connection sitting "idle in transaction" is exactly what
 * used to starve the pool).
 */
function slowProbingModel(delayMs: number) {
  const probe = { calls: 0, openTransactionsSeen: 0 };
  const base = new MockLearningModel();
  const model = new Proxy(base, {
    get(target, k) {
      const v = (target as unknown as Record<string | symbol, unknown>)[k];
      if (typeof v !== "function") return v;
      return async (...args: unknown[]) => {
        probe.calls++;
        await new Promise((r) => setTimeout(r, delayMs));
        const [{ n }] = await db()<{ n: number }[]>`
          select count(*)::int as n from pg_stat_activity where datname = current_database() and state = 'idle in transaction'`;
        probe.openTransactionsSeen += n;
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as LearningModel;
  return { model, probe };
}

async function answerCurrent(user: TestUser, s: SessionView) {
  const a = s.activity!;
  if (a.kind === "explanation") return s;
  const [{ spec }] = await db()<{ spec: { correctChoiceId?: string } }[]>`select spec_json as spec from activities where id = ${a.id}`;
  const response = a.kind === "multiple_choice" ? { choiceId: spec.correctChoiceId } : { text: "Because each part leads to the next, which means it holds together." };
  return (await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response } })).json.session as SessionView;
}

describe("no database connection is held while the model runs", () => {
  it("course setup, lesson steps, hints and grading never leave a transaction open during a model call", async () => {
    const { model, probe } = slowProbingModel(20);
    setModelOverride(model);
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId, { kind: "lesson" });
    for (let i = 0; i < 4; i++) {
      if (s.activity && s.activity.kind !== "explanation" && i === 0) await call(hint.POST, { user, params: { id: s.activity.id }, body: { idempotencyKey: key() } });
      s = await answerCurrent(user, s);
      s = (await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: s.activity!.id } })).json.session;
    }
    expect(probe.calls).toBeGreaterThan(8);
    expect(probe.openTransactionsSeen).toBe(0);
  });

  it("many learners generating at once on a 3-connection pool all finish (no pool starvation)", async () => {
    const users = await Promise.all(Array.from({ length: 8 }, () => makeUser()));
    const { model, probe } = slowProbingModel(150);
    setModelOverride(model);
    const started = Date.now();
    // 8 concurrent setups: each makes clarify + compile model calls.
    const results = await Promise.all(
      users.map(async (user) => {
        const d = (await call(drafts.POST, { user, body: { topic: "Tides", idempotencyKey: key() } })).json.draft;
        const r = await call(answer.POST, { user, params: { id: d.id }, body: { startNow: true, expectedVersion: d.version, idempotencyKey: key() } });
        return r.json.draft.state as string;
      }),
    );
    expect(results).toEqual(Array(8).fill("ready"));
    expect(probe.calls).toBeGreaterThanOrEqual(16);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("a double click still produces one next activity, and the second request waits for the first", async () => {
    const { model } = slowProbingModel(120);
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Chess", ["Just explore"]);
    process.env.ADA_PREFETCH = "off"; // force live generation on Continue
    try {
      let s = await startSession(user, courseId, { kind: "lesson" });
      s = await answerCurrent(user, s);
      setModelOverride(model);
      const [a, b] = await Promise.all([
        call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: s.activity!.id } }),
        call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: s.activity!.id } }),
      ]);
      expect(a.json.session.activity.id).toBe(b.json.session.activity.id);
      const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from activities where session_id = ${s.id}`;
      expect(n).toBe(2);
      const [{ calls }] = await db()<{ calls: number }[]>`
        select count(*)::int as calls from model_usage where owner_id = ${user.id} and operation = 'activity'`;
      expect(calls).toBe(2); // first activity + exactly one for the double-clicked Continue
      const [{ claims }] = await db()<{ claims: number }[]>`select count(*)::int as claims from work_claims where resource = ${`session:${s.id}`}`;
      expect(claims).toBe(0); // released
    } finally {
      process.env.ADA_PREFETCH = "sync";
    }
  });
});
