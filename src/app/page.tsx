import { redirect } from "next/navigation";
import { getPageUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function Index() {
  redirect((await getPageUser()) ? "/app" : "/login");
}
