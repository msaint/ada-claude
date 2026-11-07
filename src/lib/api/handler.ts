import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { getUserBySessionToken, readCookie, SESSION_COOKIE, type AuthUser } from "@/lib/auth/session";

const MAX_BODY_BYTES = 64 * 1024;
const UUID = z.string().uuid();

type Ctx<B> = { req: Request; user: AuthUser; body: B; params: Record<string, string>; requestId: string };
type PublicCtx<B> = Omit<Ctx<B>, "user"> & { user: AuthUser | null };

export function errorResponse(err: unknown, requestId: string): Response {
  const e =
    err instanceof AppError
      ? err
      : (() => {
          log.error("unhandled_error", { requestId, error: (err as Error)?.message, stack: (err as Error)?.stack });
          return new AppError("internal", "Something went wrong on our side.", true);
        })();
  return Response.json(
    { error: { code: e.code, message: e.message, retryable: e.retryable, ...(e.details ? { details: e.details } : {}) }, requestId },
    { status: e.status, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}

export function ok(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return Response.json(data, { status: init.status ?? 200, headers: { "cache-control": "no-store", ...init.headers } });
}

/** Rejects cross-site mutations: if an Origin header is present it must match the request host. */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AppError("forbidden", "Cross-site request rejected.");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("forbidden", "Cross-site request rejected.");
  }
}

async function readBody<B>(req: Request, schema: z.ZodType<B> | undefined): Promise<B> {
  if (!schema) return undefined as B;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) throw new AppError("payload_too_large", "Request body is too large.");
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) throw new AppError("unsupported_media_type", "Content-Type must be application/json.");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("payload_too_large", "Request body is too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("validation_failed", "Body is not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "validation_failed",
      parsed.error.issues[0]?.message ?? "Invalid request.",
      false,
      parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

async function resolveParams(raw: unknown): Promise<Record<string, string>> {
  const p = ((await (raw as { params?: Promise<Record<string, string>> })?.params) ?? {}) as Record<string, string>;
  for (const [k, v] of Object.entries(p)) {
    // All path IDs are UUIDs; anything else is indistinguishable from "not found".
    if (k.endsWith("Id") || k === "id") if (!UUID.safeParse(v).success) throw new AppError("not_found", "Not found");
  }
  return p;
}

/** Authenticated JSON route: validates origin, content-type, body schema, path IDs; maps errors to the envelope. */
export function route<B = undefined>(
  handler: (ctx: Ctx<B>) => Promise<Response>,
  opts: { body?: z.ZodType<B> } = {},
) {
  return async (req: Request, routeCtx?: unknown): Promise<Response> => {
    const requestId = randomUUID();
    const started = Date.now();
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const user = await getUserBySessionToken(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
      if (!user) throw new AppError("unauthenticated", "Please sign in.");
      const params = await resolveParams(routeCtx);
      const body = await readBody(req, opts.body);
      const res = await handler({ req, user, body, params, requestId });
      res.headers.set("x-request-id", requestId);
      log.info("request", { requestId, method: req.method, path: new URL(req.url).pathname, status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      const res = errorResponse(err, requestId);
      log.info("request", { requestId, method: req.method, path: new URL(req.url).pathname, status: res.status, ms: Date.now() - started });
      return res;
    }
  };
}

/** Unauthenticated route (sign-in/sign-up). Same validation, no user required. */
export function publicRoute<B = undefined>(handler: (ctx: PublicCtx<B>) => Promise<Response>, opts: { body?: z.ZodType<B> } = {}) {
  return async (req: Request, routeCtx?: unknown): Promise<Response> => {
    const requestId = randomUUID();
    try {
      if (req.method !== "GET") assertSameOrigin(req);
      const user = await getUserBySessionToken(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
      const params = await resolveParams(routeCtx);
      const body = await readBody(req, opts.body);
      return await handler({ req, user, body, params, requestId });
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}
