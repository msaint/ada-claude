import { route, ok } from "@/lib/api/handler";
import { listCourses } from "@/lib/services/courses";

export const GET = route(async ({ user }) => ok({ courses: await listCourses(user.id) }));
