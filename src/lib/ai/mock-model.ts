import { ModelError } from "@/lib/errors";
import type {
  ActivityGen,
  ClarificationResult,
  CurriculumExpansion,
  CurriculumProposal,
  EvaluationResult,
} from "@/lib/schemas/model";
import type {
  ActivityContext,
  CourseDraftContext,
  CurriculumContext,
  EvaluationContext,
  ExpansionContext,
  ExplainContext,
  HintContext,
  LearningModel,
  WithInfo,
} from "./model-adapter";

/**
 * DETERMINISTIC DEVELOPMENT/TEST MODEL — NOT AI.
 * Produces generic, topic-agnostic placeholder content so the full learning
 * loop can be exercised offline. It contains no topic-specific templates.
 * The UI shows a visible "Development model" banner whenever it is active.
 *
 * Test hooks: a topic containing `[[fail-once:<op>]]` fails the first call of
 * that operation (op = clarify|compile|activity|evaluate) with a timeout.
 */

export const MOCK_LABEL = "_Placeholder from the development model (not real AI)._";
const failedOnce = new Set<string>();

function maybeFail(op: string, topic: string) {
  const marker = `[[fail-once:${op}]]`;
  if (topic.includes(marker) && !failedOnce.has(`${op}:${topic}`)) {
    failedOnce.add(`${op}:${topic}`);
    throw new ModelError("model_timeout", "The model took too long to respond.", true);
  }
}

export function subjectOf(topic: string): string {
  let s = topic.replace(/\[\[[^\]]*\]\]/g, "").trim();
  s = s.replace(/^(i\s+(want|would like|wanna)\s+to\s+(learn|understand|know)( about| how)?|teach me( about)?|learn|understand|how do|how does|why (are|is|do|does)|what (are|is))\s+/i, "");
  s = s.replace(/\s+(so (that )?i can|in order to)\s+.*$/i, "");
  s = s.replace(/[?.!]+$/, "").trim();
  return s.length ? s : topic.trim();
}

function titleCase(s: string) {
  const words = s.split(/\s+/).slice(0, 6);
  return words.map((w, i) => (i === 0 || w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ").slice(0, 80);
}

const GOALISH = /\b(so (that )?i can|in order to|to (automate|build|beat|pass|write|make|get|play|run|cook|speak)|automate|beat|pass|certif|job|interview)\b/i;

function info(operation: string): WithInfo<unknown>["info"] {
  return { provider: "mock", model: "ada-dev-deterministic", operation, latencyMs: 0 };
}

export class MockLearningModel implements LearningModel {
  readonly provider = "mock";

  async clarifyCourse(c: CourseDraftContext): Promise<WithInfo<ClarificationResult>> {
    maybeFail("clarify", c.topic);
    const subject = subjectOf(c.topic);
    const answer = (f: string) => c.answers.find((a) => a.field === f)?.answer ?? "";
    const outcome = answer("desired_outcome");
    const curious = /curious|explore|fun|interest/i.test(outcome) || (!GOALISH.test(c.topic) && /^why|^how|^what/i.test(c.topic.trim()));
    const goalish = GOALISH.test(c.topic) || (outcome && !/curious|explore|ada decide/i.test(outcome));
    const ready = c.startNow || c.questionsAsked >= Math.min(3, c.maxQuestions);

    if (!ready) {
      if (!c.askedFields.includes("desired_outcome") && !GOALISH.test(c.topic)) {
        return {
          value: {
            status: "ask",
            field: "desired_outcome",
            question: `What would you like to get out of learning about ${subject}?`,
            quick_replies: ["Just curious", "A specific skill or outcome", "Let Ada decide"],
            reason_code: "intent_unknown",
          },
          info: info("clarify"),
        };
      }
      if (goalish && !c.askedFields.includes("baseline")) {
        return {
          value: {
            status: "ask",
            field: "baseline",
            question: `How much experience do you already have with ${subject}?`,
            quick_replies: ["None yet", "Some basics", "Fairly experienced"],
            reason_code: "baseline_affects_start",
          },
          info: info("clarify"),
        };
      }
      if (goalish && !c.askedFields.includes("time_budget")) {
        return {
          value: {
            status: "ask",
            field: "time_budget",
            question: "How much time could you give this each week?",
            quick_replies: ["15 minutes", "1 hour", "3+ hours"],
            reason_code: "budget_affects_cadence",
          },
          info: info("clarify"),
        };
      }
      if (!goalish && !c.askedFields.includes("depth")) {
        return {
          value: {
            status: "ask",
            field: "depth",
            question: "Would you like a quick explanation or a deeper exploration?",
            quick_replies: ["Quick, five minutes", "A deeper exploration"],
            reason_code: "depth_affects_scope",
          },
          info: info("clarify"),
        };
      }
    }

    const assumptions: string[] = [];
    const intent = goalish && !curious ? "goal" : "curiosity";
    const depthAns = answer("depth");
    const depth = /quick|five|5/i.test(depthAns) ? "quick" : /deep/i.test(depthAns) ? "deep" : "standard";
    if (!depthAns) assumptions.push("Standard depth");
    const budgetAns = answer("time_budget");
    const minutes = /15/.test(budgetAns) ? 15 : /3\+|three/i.test(budgetAns) ? 180 : /hour|60/i.test(budgetAns) ? 60 : null;
    if (!budgetAns && intent === "goal") assumptions.push("About an hour a week");
    const baseline = answer("baseline");
    if (!baseline) assumptions.push("Starting from the basics");
    return {
      value: {
        status: "ready",
        interpretation: {
          intent,
          goal_text:
            intent === "goal"
              ? `Be able to ${outcome && !/specific skill/i.test(outcome) ? outcome.toLowerCase() : `apply ${subject} to a real task`}`.slice(0, 400)
              : `Understand ${subject}`.slice(0, 400),
          depth,
          baseline,
          time_budget_minutes_weekly: minutes ?? (intent === "goal" ? 60 : null),
          success_criteria: intent === "goal" ? [`Complete a small, realistic task using ${subject} without help`] : [],
          assumptions,
        },
      },
      info: info("clarify"),
    };
  }

  async compileCurriculum(c: CurriculumContext): Promise<WithInfo<CurriculumProposal>> {
    maybeFail("compile", c.topic);
    const subject = subjectOf(c.topic);
    const concepts: CurriculumProposal["concepts"] = [
      { slug: "core-idea", title: `The core idea of ${subject}`.slice(0, 120), description: `What ${subject} is about, in one clear picture.`, assessment_criteria: [`Explain the central idea of ${subject} in your own words`], importance: 3, prerequisites: [] },
      { slug: "key-parts", title: "Key parts and terms", description: `The vocabulary and components needed to reason about ${subject}.`, assessment_criteria: ["Identify the main parts and what each does"], importance: 2, prerequisites: ["core-idea"] },
      { slug: "how-it-works", title: "How it works", description: `The mechanism or cause-and-effect behind ${subject}.`, assessment_criteria: ["Predict what happens when one factor changes"], importance: 3, prerequisites: ["key-parts"] },
    ];
    if (c.depth !== "quick") {
      concepts.push({ slug: "misconceptions", title: "Common misconceptions", description: `Tempting but wrong ideas about ${subject}.`, assessment_criteria: ["Spot and correct a common mistaken explanation"], importance: 2, prerequisites: ["how-it-works"] });
      concepts.push({
        slug: "applying-it",
        title: c.intent === "goal" ? "Putting it into practice" : "Connections and consequences",
        description: c.intent === "goal" ? `Using ${subject} toward: ${c.goalText}`.slice(0, 600) : `Where ${subject} shows up and why it matters.`,
        assessment_criteria: ["Apply the idea to a new situation"],
        importance: c.intent === "goal" ? 3 : 1,
        prerequisites: ["how-it-works"],
      });
    }
    if (c.adjustment) {
      concepts.push({ slug: "requested-focus", title: `Focus: ${c.adjustment}`.slice(0, 120), description: `Added at your request: ${c.adjustment}`.slice(0, 600), assessment_criteria: ["Explain how this connects to the rest of the course"], importance: 2, prerequisites: ["core-idea"] });
    }
    return {
      value: {
        title: titleCase(subject),
        direction: (c.intent === "goal" ? `Work toward: ${c.goalText}.` : `Explore ${subject} at your own pace.`).slice(0, 300),
        concepts,
        first_concept_slug: "core-idea",
        suggested_minutes_weekly: c.timeBudgetMinutesWeekly ?? (c.depth === "quick" ? 10 : 45),
        cadence_note: "A few short sessions a week works well; adjust anytime.",
        success_criteria: c.successCriteria,
      },
      info: info("compile"),
    };
  }

  async expandCurriculum(c: ExpansionContext): Promise<WithInfo<CurriculumExpansion>> {
    maybeFail("expand", c.topic);
    const base = c.request.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "branch";
    let slug = c.mode === "branch" ? `branch-${base}` : `goal-${base}`;
    const existing = new Set(c.existing.map((e) => e.slug));
    for (let i = 2; existing.has(slug); i++) slug = `${slug.slice(0, 50)}-${i}`;
    const anchor = c.existing[0]?.slug ?? null;
    if (c.mode === "branch") {
      return {
        value: {
          new_concepts: [{ slug, title: titleCase(c.request), description: `A curiosity branch: ${c.request}`.slice(0, 600), assessment_criteria: ["Explain how this connects to what you already know"], importance: 1, prerequisites: anchor ? [anchor] : [] }],
          anchor_slug: anchor,
          keep_slugs: [],
          direction: "",
          success_criteria: [],
          explanation: `Adds "${c.request}" as a branch of this course.`.slice(0, 400),
        },
        info: info("expand"),
      };
    }
    return {
      value: {
        new_concepts: [{ slug, title: `Toward: ${c.goalText}`.slice(0, 120), description: `New material needed for the revised goal: ${c.goalText}`.slice(0, 600), assessment_criteria: ["Apply the course ideas to the new goal"], importance: 3, prerequisites: existing.has("how-it-works") ? ["how-it-works"] : [] }],
        anchor_slug: null,
        keep_slugs: c.existing.filter((e) => e.slug !== "misconceptions").map((e) => e.slug),
        direction: `Work toward: ${c.goalText}.`.slice(0, 300),
        success_criteria: c.intent === "goal" ? [`Demonstrate: ${c.goalText}`.slice(0, 200)] : [],
        explanation: "Kept the concepts that still matter, added one for the new goal. Readiness is now measured against the new goal.",
      },
      info: info("expand"),
    };
  }

  async generateActivity(c: ActivityContext): Promise<WithInfo<ActivityGen>> {
    maybeFail("activity", c.topic);
    const t = c.concept.title;
    const crit = c.concept.assessmentCriteria[0] ?? `understand ${t}`;
    const n = c.priorPrompts.length + 1;
    let value: ActivityGen;
    switch (c.kind) {
      case "explanation":
        value = {
          kind: "explanation",
          title: c.purpose === "remediate" ? `Another way to see it: ${t}` : t,
          bodyMarkdown: `${c.concept.description}\n\n**Key idea.** To ${crit.charAt(0).toLowerCase()}${crit.slice(1)}, focus on cause and effect: what changes, and what follows from it.\n\n**Worked example.** Take one concrete case, name each part, then trace what happens step by step.\n\n${MOCK_LABEL}`,
          continueLabel: "Continue",
        };
        break;
      case "multiple_choice":
        value = {
          kind: "multiple_choice",
          promptMarkdown: `${c.purpose === "prediction" ? "Before we dig in — it's fine to guess. " : ""}Question ${n} on **${t}**: which statement fits best?`,
          choices: [
            { id: "a", text: `It is unrelated to ${t.toLowerCase()}` },
            { id: "b", text: crit },
            { id: "c", text: "It only matters in rare edge cases" },
          ],
          correctChoiceId: "b",
          rationale: `The correct choice restates the concept's core criterion: "${crit}". The other options dismiss the concept.`,
          difficulty: c.difficulty,
        };
        break;
      case "free_response":
        value = {
          kind: "free_response",
          promptMarkdown: `In two or three sentences, ${crit.charAt(0).toLowerCase()}${crit.slice(1)}. (Question ${n} on **${t}**)`,
          rubric: [
            { criterion: `Addresses ${t}`, importance: 0.6 },
            { criterion: "Explains cause and effect, not just a label", importance: 0.4 },
          ],
          idealAnswerPrivate: `A clear explanation of ${t}, naming the key parts and why they lead to the result.`,
          difficulty: c.difficulty,
        };
        break;
      default:
        value = { kind: "reflection", promptMarkdown: `What surprised you about **${t}**, and what are you still wondering about?` };
    }
    return { value, info: info("activity") };
  }

  async evaluateAnswer(c: EvaluationContext): Promise<WithInfo<EvaluationResult>> {
    maybeFail("evaluate", c.topic);
    const text = c.response.trim();
    const words = c.concept.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const mentions = words.some((w) => text.toLowerCase().includes(w));
    const causal = /because|so that|which means|therefore|causes|leads to|since/i.test(text);
    const result: EvaluationResult["result"] = text.length >= 40 && (mentions || causal) ? "correct" : text.length >= 15 ? "partial" : "incorrect";
    return {
      value: {
        result,
        score: result === "correct" ? 1 : result === "partial" ? 0.5 : 0,
        criteria: c.rubric.map((r, i) => ({
          criterion: r.criterion,
          met: (i === 0 ? mentions || result === "correct" : causal) ? "yes" : result === "incorrect" ? "no" : "partly",
          reason: "Heuristic check by the development model.",
        })),
        feedbackMarkdown:
          result === "correct"
            ? `That covers the key idea. ${MOCK_LABEL}`
            : result === "partial"
              ? `You're on the right track — say *why* it happens, not just what. ${MOCK_LABEL}`
              : `Not quite yet. Try naming the main parts and how they connect. ${MOCK_LABEL}`,
        misconception: result === "incorrect" ? "Answer did not engage with the mechanism" : null,
      },
      info: info("evaluate"),
    };
  }

  async explainDifferently(c: ExplainContext) {
    return {
      value: { bodyMarkdown: `**Another angle on ${c.concept.title}.** Imagine explaining it to a friend using an everyday comparison: start from what they already know, then show the one difference that matters. (Alternative ${c.previousExplanations.length + 1})\n\n${MOCK_LABEL}` },
      info: info("explain"),
    };
  }

  async hint(c: HintContext) {
    const steps = ["Re-read the question and underline what it is really asking.", `Think about what "${c.concept.title}" is for — which option keeps that purpose?`, "Rule out the options that dismiss the concept entirely."];
    return { value: { hintMarkdown: steps[Math.min(c.previousHints.length, steps.length - 1)] }, info: info("hint") };
  }
}
