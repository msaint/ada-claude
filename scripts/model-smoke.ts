/**
 * Manual real-model smoke test (spec §16). Needs OPENAI_API_KEY and/or ANTHROPIC_API_KEY.
 *   npm run smoke:model                          # configured primary provider, four topics
 *   npm run smoke:model -- --provider anthropic  # test one provider in isolation (no fallback)
 *   npm run smoke:model -- --provider openai "My own topic"
 * Prints the clarification, curriculum, one activity per kind and a grading
 * result for each topic so a human can judge quality. Nothing is persisted.
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();
const args = process.argv.slice(2);
const pIdx = args.indexOf("--provider");
if (pIdx >= 0) {
  process.env.ADA_MODEL_PROVIDER = args[pIdx + 1];
  process.env.ADA_MODEL_FALLBACK = "false";
  args.splice(pIdx, 2);
}
process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused"; // env validation only; no DB access here
process.env.MOCK_MODEL = "false";
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.error("Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY — this smoke test needs a real provider.");
  process.exit(1);
}
const { buildModel } = await import("../src/lib/ai/index");
const model = buildModel();
console.log(`provider chain: ${model.provider}`);

const topics = args.length
  ? args
  : ["How train wheels work", "Black holes", "I want to learn Python to automate spreadsheets", "history of ball bearings in bicycles"];

async function run(topic: string) {
  console.log(`\n=== ${topic} ===`);
  const q = await model.clarifyCourse({ topic, answers: [], askedFields: [], questionsAsked: 0, maxQuestions: 4, startNow: false, linkContext: null });
  console.log("clarify:", JSON.stringify(q.value), `(${q.info.latencyMs}ms)`);
  const ready = await model.clarifyCourse({ topic, answers: [], askedFields: [], questionsAsked: 0, maxQuestions: 4, startNow: true, linkContext: null });
  if (ready.value.status !== "ready") throw new Error("start-now did not return ready");
  const i = ready.value.interpretation;
  const c = await model.compileCurriculum({ topic, intent: i.intent, goalText: i.goal_text, depth: i.depth, baseline: i.baseline, timeBudgetMinutesWeekly: i.time_budget_minutes_weekly, successCriteria: i.success_criteria, assumptions: i.assumptions });
  console.log(`curriculum: "${c.value.title}" — ${c.value.direction} (${c.info.provider}/${c.info.model}, ${c.info.latencyMs}ms, repaired=${c.info.repaired})`);
  for (const k of c.value.concepts) console.log(`  - ${k.slug}: ${k.title} [prereq: ${k.prerequisites.join(", ") || "none"}]`);
  const first = c.value.concepts.find((k) => k.slug === c.value.first_concept_slug)!;
  const concept = { slug: first.slug, title: first.title, description: first.description, assessmentCriteria: first.assessment_criteria, prerequisites: [] };
  const base = { topic, intent: i.intent, goalText: i.goal_text, baseline: i.baseline, timeBudgetMinutesWeekly: null, concept, recentEvidence: [], misconceptions: [], priorPrompts: [], assistanceUsed: 0 };
  for (const [kind, purpose, difficulty] of [["multiple_choice", "prediction", 1], ["explanation", "teach", 1], ["free_response", "apply", 2]] as const) {
    const a = await model.generateActivity({ ...base, kind, purpose, difficulty });
    console.log(`  ${kind}:`, JSON.stringify(a.value).slice(0, 600));
    if (a.value.kind === "free_response") {
      const e = await model.evaluateAnswer({ topic, concept, promptMarkdown: a.value.promptMarkdown, rubric: a.value.rubric, idealAnswer: a.value.idealAnswerPrivate, response: "I'm not sure, I think it has to do with shape." });
      console.log("  evaluation of a weak answer:", JSON.stringify(e.value));
    }
  }
}

(async () => {
  for (const t of topics) {
    try {
      await run(t);
    } catch (e) {
      console.error(`FAILED for "${t}":`, (e as Error).message);
      process.exitCode = 1;
    }
  }
})();
