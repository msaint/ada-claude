import { unsubscribe } from "@/lib/services/email";

export const dynamic = "force-dynamic";

/**
 * Stops reminder emails for the owner of the token. Used by the unsubscribe
 * page and by mail apps' one-click unsubscribe (RFC 8058), which POST here
 * without cookies, so the token is the only credential. It can only turn
 * email off, and always answers the same way.
 */
export async function POST(req: Request) {
  await unsubscribe(new URL(req.url).searchParams.get("token") ?? "");
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
