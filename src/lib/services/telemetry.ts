import { db, json, type Db } from "@/lib/db/client";
import { log } from "@/lib/log";

export type TelemetryEvent =
  | "course_draft_started"
  | "clarification_answered"
  | "course_created"
  | "first_activity_rendered"
  | "attempt_submitted"
  | "session_completed"
  | "course_resumed"
  | "review_due"
  | "review_completed"
  | "course_goal_revised"
  | "model_error";

/** Operational events only — never raw learner answer text. Failures never break the request. */
export async function track(ownerId: string | null, event: TelemetryEvent, props: Record<string, string | number | boolean | null> = {}, t: Db = db()) {
  try {
    await t`insert into telemetry_events (owner_id, event_type, props_json) values (${ownerId}, ${event}, ${json(props)})`;
  } catch (e) {
    log.warn("telemetry_failed", { event, error: (e as Error).message });
  }
}
