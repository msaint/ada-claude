import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserBySessionToken, SESSION_COOKIE, type AuthUser } from "./session";

/** For server components/layouts: the signed-in user or a redirect to /login. */
export async function requirePageUser(): Promise<AuthUser> {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return user;
}

export async function getPageUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  return getUserBySessionToken(jar.get(SESSION_COOKIE)?.value);
}
