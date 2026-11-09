/**
 * Learner-facing view types (what the browser receives). These are deliberately
 * separate from persisted/private model specs: no answer keys, ideal answers or
 * rubric internals appear here for an unanswered activity.
 */

export type ApiErrorBody = { error: { code: string; message: string; retryable: boolean; details?: unknown }; requestId: string };
export type InlineError = { code: string; message: string; retryable: boolean };

export type CourseListItem = {
  id: string;
  title: string;
  intent: "curiosity" | "goal";
  updatedAt: string;
  nextActionLabel: string | null;
  reviewDueCount: number;
  hasOpenSession: boolean;
};

export type DraftTurn = { role: "ada" | "learner"; text: string };

export type CourseDraftView = {
  id: string;
  topic: string;
  version: number;
  turns: DraftTurn[];
  state: "collecting" | "ready" | "converted";
  nextQuestion?: { text: string; options: string[]; field: string };
  canGoBack: boolean;
  proposal?: {
    title: string;
    direction: string;
    intent: "curiosity" | "goal";
    goalText: string;
    initialConceptTitles: string[];
    suggestedMinutesWeekly: number | null;
    cadenceNote: string;
    assumptions: string[];
    successCriteria: string[];
  };
  convertedCourseId?: string | null;
  /** Pages Ada actually read (fetched by the model provider) while setting up. */
  sourcesRead: { url: string; title: string | null }[];
  error?: InlineError | null;
  devModel: boolean;
};

export type NextAction = { kind: "learn" | "review" | "explore" | "placement" | "assessment"; label: string };

export type CourseHeader = {
  id: string;
  title: string;
  topic: string;
  intent: "curiosity" | "goal";
  status: "active" | "paused" | "archived";
  version: number;
  goal: { version: number; text: string; successCriteria: string[]; timeBudgetMinutesWeekly: number | null; createdAt: string };
  goalHistory: { version: number; text: string; reason: string | null; createdAt: string }[];
  nextAction: NextAction;
  openSession: { id: string; kind: "lesson" | "review" | "placement" | "assessment"; status: "active" | "paused" } | null;
  reviewDueCount: number;
};

export type LearnerActivity =
  | { id: string; kind: "explanation"; purpose: string; conceptTitle: string; title?: string; bodyMarkdown: string; continueLabel?: string }
  | { id: string; kind: "multiple_choice"; purpose: string; conceptTitle: string; promptMarkdown: string; choices: { id: string; text: string }[]; difficulty: number }
  | { id: string; kind: "free_response"; purpose: string; conceptTitle: string; promptMarkdown: string; difficulty: number }
  | { id: string; kind: "reflection"; purpose: string; conceptTitle: string; promptMarkdown: string };

export type ActivityFeedback = {
  status: "graded" | "pending_evaluation";
  result: "correct" | "partial" | "incorrect" | "uncertain" | "exposure" | null;
  independence: "independent" | "assisted";
  feedbackMarkdown: string;
  correctChoiceId?: string;
  chosenChoiceId?: string;
  rationale?: string;
  criteria?: { criterion: string; met: "yes" | "partly" | "no"; reason: string }[];
  exampleAnswer?: string;
  submittedText?: string;
  skipped?: boolean;
  /** The answer is held back (Socratic: a narrower question comes next). "Show me the answer" reveals it. */
  withheld?: boolean;
  /** The learner chose to see a withheld answer. */
  revealed?: boolean;
};

export type SessionKindDTO = "lesson" | "review" | "placement" | "assessment";

export type SessionSummary = {
  reason: string;
  assessed: number;
  correct: number;
  conceptsTouched: string[];
  /** Placement: what each probe showed, and where Ada suggests starting. */
  placement?: { conceptId: string; title: string; result: "correct" | "partial" | "incorrect" | "unknown" }[];
  suggestedConceptId?: string | null;
  /** Final mixed assessment outcome. */
  assessment?: { passed: boolean; missed: string[] };
};

export type SessionPhase = "choosing_next" | "awaiting_response" | "evaluating" | "feedback" | "paused" | "completed";

export type SessionView = {
  id: string;
  courseId: string;
  kind: SessionKindDTO;
  status: "active" | "paused" | "completed";
  /** Learner's harder/easier choice for this session: -1, 0 or +1. */
  difficultyOffset: number;
  phase: SessionPhase;
  position: number;
  activity: LearnerActivity | null;
  draft: { value: { choiceId?: string; text?: string }; version: number } | null;
  hints: string[];
  altExplanations: string[];
  feedback: ActivityFeedback | null;
  summary: SessionSummary | null;
  devModel: boolean;
  aiGenerated: boolean;
};

export type DisplayStatusDTO = "not_assessed" | "developing" | "demonstrated" | "review_due";

export type OutlineView = {
  courseId: string;
  curriculumVersion: number;
  revisionNote: string | null;
  concepts: {
    id: string;
    slug: string;
    title: string;
    description: string;
    criteria: string[];
    status: DisplayStatusDTO;
    depth: number;
    prerequisiteTitles: string[];
    origin: "initial" | "branch" | "revision";
    inCurrentPlan: boolean;
    evidence: { result: string; independence: string; kind: string; at: string; reason: string }[];
  }[];
};

export type CourseProgress = {
  courseId: string;
  intent: "curiosity" | "goal";
  goalText?: string;
  readiness?: { band: "unknown" | "early" | "developing" | "approaching" | "demonstrated"; basis: string; evidenceCount: number };
  concepts: { id: string; title: string; status: DisplayStatusDTO; evidenceCount: number; reason: string }[];
  canDo: { title: string; criteria: string[] }[];
  needsPractice: { title: string; reason: string }[];
  dueToRevisit: { conceptTitle: string; dueAt: string; dueLabel: string }[];
  curiosity?: { exploredCount: number; branchCount: number; recentExplanations: { conceptTitle: string; at: string }[]; openQuestions: string[]; suggestedBranches: string[] };
  activity: { sessions: number; activities: number };
  nextAction: NextAction;
};

export type DueReview = { id: string; courseId: string; courseTitle: string; conceptId: string; conceptTitle: string; dueAt: string; dueLabel: string; overdue: boolean };
