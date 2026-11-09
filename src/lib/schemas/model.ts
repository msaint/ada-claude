import { z } from "zod";

/**
 * Schemas for model outputs. Everything a model returns is an untrusted
 * proposal: it is parsed against these schemas (and semantic validators in
 * lib/learning) before anything touches the database. Models never provide
 * database IDs or ownership fields.
 */

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const DRAFT_FIELDS = ["desired_outcome", "depth", "baseline", "time_budget", "focus", "deadline"] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

export const ClarifyAskSchema = z.object({
  status: z.literal("ask"),
  question: shortText(240),
  quick_replies: z.array(shortText(60)).max(4).default([]),
  field: z.enum(DRAFT_FIELDS),
  reason_code: shortText(60),
  /** Summary of pages the learner linked (filled when the model read them). */
  link_context: z.string().trim().max(2000).nullable().default(null),
});

export const InterpretationSchema = z.object({
  intent: z.enum(["curiosity", "goal"]),
  goal_text: shortText(400),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  baseline: z.string().trim().max(300).default(""),
  time_budget_minutes_weekly: z.number().int().min(0).max(3000).nullable().default(null),
  success_criteria: z.array(shortText(200)).max(5).default([]),
  assumptions: z.array(shortText(200)).max(6).default([]),
  /** Summary of pages the learner linked (job posting, portfolio, syllabus…), if read. */
  link_context: z.string().trim().max(2000).nullable().default(null),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

export const ClarifyReadySchema = z.object({
  status: z.literal("ready"),
  interpretation: InterpretationSchema,
});

export const ClarificationResultSchema = z.discriminatedUnion("status", [ClarifyAskSchema, ClarifyReadySchema]);
export type ClarificationResult = z.infer<typeof ClarificationResultSchema>;

export const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64))
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/));

export const ConceptProposalSchema = z.object({
  slug: SlugSchema,
  title: shortText(120),
  description: shortText(600),
  assessment_criteria: z.array(shortText(240)).min(1).max(5),
  importance: z.number().int().min(1).max(3).default(2),
  prerequisites: z.array(SlugSchema).max(6).default([]),
});
export type ConceptProposal = z.infer<typeof ConceptProposalSchema>;

export const CurriculumProposalSchema = z.object({
  title: shortText(80),
  direction: shortText(300),
  concepts: z.array(ConceptProposalSchema).min(1).max(30),
  first_concept_slug: SlugSchema,
  suggested_minutes_weekly: z.number().int().min(5).max(3000).nullable().default(null),
  cadence_note: z.string().trim().max(200).default(""),
  success_criteria: z.array(shortText(200)).max(5).default([]),
});
export type CurriculumProposal = z.infer<typeof CurriculumProposalSchema>;

/** Expansion for curiosity branches and goal revisions: new nodes + which existing ones remain relevant. */
export const CurriculumExpansionSchema = z.object({
  new_concepts: z.array(ConceptProposalSchema).max(8),
  /** For branches: existing slug the new nodes relate to. */
  anchor_slug: SlugSchema.nullable().default(null),
  /** For goal revisions: existing slugs still required for the new goal. */
  keep_slugs: z.array(SlugSchema).max(30).default([]),
  direction: z.string().trim().max(300).default(""),
  success_criteria: z.array(shortText(200)).max(5).default([]),
  explanation: z.string().trim().max(400).default(""),
});
export type CurriculumExpansion = z.infer<typeof CurriculumExpansionSchema>;

// ---------------------------------------------------------------- activities

const markdown = (max: number) => z.string().trim().min(1).max(max);

export const ExplanationGenSchema = z.object({
  kind: z.literal("explanation"),
  title: z.string().trim().max(120).optional(),
  bodyMarkdown: markdown(6000),
  continueLabel: z.string().trim().max(40).optional(),
});

export const MultipleChoiceGenSchema = z
  .object({
    kind: z.literal("multiple_choice"),
    promptMarkdown: markdown(2000),
    choices: z
      .array(z.object({ id: z.string().trim().min(1).max(20), text: shortText(300) }))
      .min(3)
      .max(5),
    correctChoiceId: z.string().trim().min(1).max(20),
    rationale: shortText(1500),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .superRefine((v, ctx) => {
    const ids = v.choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "choice ids must be unique" });
    if (!ids.includes(v.correctChoiceId)) ctx.addIssue({ code: "custom", message: "correctChoiceId must match a choice id" });
    const texts = v.choices.map((c) => c.text.toLowerCase());
    if (new Set(texts).size !== texts.length) ctx.addIssue({ code: "custom", message: "choices must be distinct" });
  });

export const FreeResponseGenSchema = z.object({
  kind: z.literal("free_response"),
  promptMarkdown: markdown(2000),
  rubric: z
    .array(z.object({ criterion: shortText(240), importance: z.number().min(0).max(1) }))
    .min(1)
    .max(5),
  idealAnswerPrivate: shortText(2000),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const ReflectionGenSchema = z.object({
  kind: z.literal("reflection"),
  promptMarkdown: markdown(1000),
});

export const ActivityGenSchema = z.union([
  ExplanationGenSchema,
  MultipleChoiceGenSchema,
  FreeResponseGenSchema,
  ReflectionGenSchema,
]);
export type ActivityGen = z.infer<typeof ActivityGenSchema>;

/** Persisted (private, teacher-side) activity spec. `conceptId` is always set by the server. */
export type ActivitySpec = ActivityGen & { version: 1; conceptId: string };

export const EvaluationResultSchema = z.object({
  result: z.enum(["correct", "partial", "incorrect", "uncertain"]),
  score: z.number().min(0).max(1).nullable().default(null),
  criteria: z
    .array(z.object({ criterion: shortText(240), met: z.enum(["yes", "partly", "no"]), reason: z.string().trim().max(400) }))
    .max(6)
    .default([]),
  feedbackMarkdown: markdown(2000),
  misconception: z.string().trim().max(300).nullable().default(null),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const ExplanationResultSchema = z.object({ bodyMarkdown: markdown(5000) });
export type ExplanationResult = z.infer<typeof ExplanationResultSchema>;

export const HintResultSchema = z.object({ hintMarkdown: markdown(800) });
export type HintResult = z.infer<typeof HintResultSchema>;
