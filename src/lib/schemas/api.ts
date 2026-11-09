import { z } from "zod";

/** Inbound HTTP request schemas (shared by route handlers and tests). */

const idemKey = z.string().trim().min(8).max(100);
const learnerText = (max: number) => z.string().max(max);

export const SignUpBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  timezone: z.string().max(64).optional(),
});
export const GuestBody = z.object({ timezone: z.string().max(64).optional() });
export const SignInBody = z.object({ email: z.string().trim().max(254), password: z.string().max(200) });

export const CreateDraftBody = z.object({
  topic: z.string().trim().min(1, "Tell Ada what you'd like to learn").max(500, "Keep it under 500 characters"),
  idempotencyKey: idemKey,
});

export const AnswerDraftBody = z
  .object({
    answer: learnerText(1000).optional(),
    startNow: z.boolean().optional(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: idemKey,
  })
  .refine((b) => b.startNow || (b.answer && b.answer.trim().length > 0), { message: "Answer or start now" });

export const ProposeDraftBody = z.object({
  adjustment: learnerText(500).optional(),
  expectedVersion: z.number().int().positive(),
});
export const BackDraftBody = z.object({ expectedVersion: z.number().int().positive() });
export const ConvertDraftBody = z.object({ idempotencyKey: idemKey.optional() });

export const PatchCourseBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  expectedVersion: z.number().int().positive(),
});

export const ReviseGoalBody = z.object({
  goalText: z.string().trim().min(3).max(600),
  intent: z.enum(["curiosity", "goal"]).optional(),
  reason: z.string().trim().max(300).optional(),
  timeBudgetMinutesWeekly: z.number().int().min(0).max(3000).nullable().optional(),
});

export const BranchBody = z.object({ question: z.string().trim().min(2).max(300) });

export const StartSessionBody = z.object({
  kind: z.enum(["lesson", "review", "placement", "assessment"]).optional(),
  focusConceptId: z.string().uuid().optional(),
});

export const DifficultyBody = z.object({ offset: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });
export const NextBody = z.object({ fromActivityId: z.string().uuid().nullable() });

export const DraftInputBody = z.object({
  draft: z.object({ choiceId: z.string().max(20).optional(), text: learnerText(10000).optional() }),
  baseVersion: z.number().int().min(0),
});

export const AssistBody = z.object({ idempotencyKey: idemKey });

export const AttemptBody = z.object({
  idempotencyKey: idemKey,
  response: z.union([
    z.object({ choiceId: z.string().min(1).max(20) }),
    z.object({ text: z.string().trim().min(1, "Write an answer first").max(10000, "Answers are limited to 10,000 characters") }),
    z.object({ skipped: z.literal(true) }),
  ]),
});

export const PostponeBody = z.object({ days: z.number().int().min(1).max(14).default(1) });

export const PreferencesBody = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  timezone: z.string().max(64).optional(),
  remindersEnabled: z.boolean().optional(),
  emailOptIn: z.boolean().optional(),
  quietHours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
});

export const DeleteAccountBody = z.object({ confirmEmail: z.string().trim().max(254) });
