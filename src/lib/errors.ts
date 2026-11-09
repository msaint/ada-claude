export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "account_required"
  | "not_found"
  | "validation_failed"
  | "conflict"
  | "rate_limited"
  | "model_timeout"
  | "model_unavailable"
  | "model_invalid_output"
  | "payload_too_large"
  | "unsupported_media_type"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  account_required: 403,
  not_found: 404,
  validation_failed: 400,
  conflict: 409,
  rate_limited: 429,
  model_timeout: 503,
  model_unavailable: 503,
  model_invalid_output: 502,
  payload_too_large: 413,
  unsupported_media_type: 415,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable = false,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = "Resource") => new AppError("not_found", `${what} not found`);
export const conflict = (message: string, details?: unknown) => new AppError("conflict", message, false, details);
export const invalid = (message: string, details?: unknown) => new AppError("validation_failed", message, false, details);

/** Model-layer failures. `retryable` drives client retry affordances. */
export class ModelError extends AppError {
  constructor(code: "model_timeout" | "model_unavailable" | "model_invalid_output", message: string, retryable = true) {
    super(code, message, retryable);
    this.name = "ModelError";
  }
}
