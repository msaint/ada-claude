import { route, ok } from "@/lib/api/handler";
import { PatchCourseBody } from "@/lib/schemas/api";
import { deleteCourse, getCourseHeader, patchCourse } from "@/lib/services/courses";

export const GET = route(async ({ user, params }) => ok({ course: await getCourseHeader(user.id, params.id) }));
export const PATCH = route(async ({ user, params, body }) => ok(await patchCourse(user.id, params.id, body)), { body: PatchCourseBody });
export const DELETE = route(async ({ user, params }) => {
  await deleteCourse(user.id, params.id);
  return ok({ deleted: true });
});
