import type {
  ActivityGen,
  ClarificationResult,
  CurriculumExpansion,
  CurriculumProposal,
  DraftField,
  EvaluationResult,
  ExplanationResult,
  HintResult,
} from "@/lib/schemas/model";
import type { ActivityKind, Purpose } from "@/lib/learning/next-action";

/** A page the provider actually fetched (never model-invented). */
export type FetchedSource = { url: string; title: string | null; retrievedAt: string | null };

export type ModelInfo = {
  provider: string;
  model: string;
  operation: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  repaired?: boolean;
  sources?: FetchedSource[];
};

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;
/** True when learner-provided text contains a link worth reading. */
export function containsUrl(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && URL_RE.test(t));
}
export type WithInfo<T> = { value: T; info: ModelInfo };

export type CourseDraftContext = {
  topic: string;
  answers: { field: DraftField; question: string; answer: string }[];
  askedFields: DraftField[];
  questionsAsked: number;
  maxQuestions: number;
  startNow: boolean;
  /** Summary of linked pages captured earlier in this draft; when present, links aren't re-fetched. */
  linkContext: string | null;
};

export type CurriculumContext = {
  topic: string;
  intent: "curiosity" | "goal";
  goalText: string;
  depth: string;
  baseline: string;
  timeBudgetMinutesWeekly: number | null;
  successCriteria: string[];
  assumptions: string[];
  adjustment?: string | null;
  linkContext?: string | null;
};

export type ExpansionContext = {
  mode: "branch" | "revise";
  topic: string;
  intent: "curiosity" | "goal";
  goalText: string;
  previousGoalText?: string;
  request: string; // branch question or revision reason
  existing: { slug: string; title: string; status: string }[];
  linkContext?: string | null;
};

export type ConceptBrief = { slug: string; title: string; description: string; assessmentCriteria: string[]; prerequisites: string[] };

export type ActivityContext = {
  topic: string;
  intent: "curiosity" | "goal";
  goalText: string;
  baseline: string;
  timeBudgetMinutesWeekly: number | null;
  concept: ConceptBrief;
  kind: ActivityKind;
  purpose: Purpose;
  difficulty: 1 | 2 | 3;
  recentEvidence: { result: string; reason: string }[];
  misconceptions: string[];
  priorPrompts: string[];
  assistanceUsed: number;
  linkContext?: string | null;
  /** Rotating question form (predict, explain why, find the flaw, apply, connect) for variety. */
  questionForm?: string | null;
  /** For probe/defend: the learner's previous answer on this concept. */
  followUp?: { promptMarkdown: string; learnerAnswer: string; answerKey?: string | null; misconception?: string | null } | null;
  /** For the integrative final question: every concept the course covers. */
  courseConcepts?: string[];
  /** The learner asked for harder (+1) or easier (-1) questions this session. */
  difficultyPreference?: number;
};

export type EvaluationContext = {
  topic: string;
  concept: ConceptBrief;
  promptMarkdown: string;
  rubric: { criterion: string; importance: number }[];
  idealAnswer: string;
  response: string;
  /** Socratic mode: feedback must point at the gap without stating the answer. */
  withholdAnswer?: boolean;
};

export type ExplainContext = {
  topic: string;
  concept: ConceptBrief;
  activityPrompt: string;
  previousExplanations: string[];
  learnerBaseline: string;
};

export type HintContext = {
  topic: string;
  concept: ConceptBrief;
  promptMarkdown: string;
  previousHints: string[];
  /** Private: used so the hint points toward, but never states, the answer. */
  answerKey: string;
};

/** Provider-agnostic learning model. Implementations must return schema-valid values or throw ModelError. */
export interface LearningModel {
  readonly provider: string;
  clarifyCourse(input: CourseDraftContext): Promise<WithInfo<ClarificationResult>>;
  compileCurriculum(input: CurriculumContext): Promise<WithInfo<CurriculumProposal>>;
  expandCurriculum(input: ExpansionContext): Promise<WithInfo<CurriculumExpansion>>;
  generateActivity(input: ActivityContext): Promise<WithInfo<ActivityGen>>;
  evaluateAnswer(input: EvaluationContext): Promise<WithInfo<EvaluationResult>>;
  explainDifferently(input: ExplainContext): Promise<WithInfo<ExplanationResult>>;
  hint(input: HintContext): Promise<WithInfo<HintResult>>;
}
