import { data } from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.video-tracking";
import { getCurrentUserId } from "~/lib/session";
import { requireTakeCourse } from "~/lib/access.server";
import { parseJsonBody } from "~/lib/validation";
import { db } from "~/db";
import { lessons, modules, videoWatchEvents } from "~/db/schema";

const videoTrackingSchema = z.object({
  lessonId: z.number(),
  eventType: z.string(),
  positionSeconds: z.number(),
});

function getCourseIdForLesson(lessonId: number) {
  return db
    .select({ courseId: modules.courseId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(lessons.id, lessonId))
    .get()?.courseId;
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, videoTrackingSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, eventType, positionSeconds } = parsed.data;

  const courseId = getCourseIdForLesson(lessonId);
  if (courseId === undefined) {
    throw data("Lesson not found", { status: 404 });
  }

  // Watched time feeds the Watch Limit for Refunds, so it's recorded only for
  // people who can take the course.
  await requireTakeCourse(request, courseId);

  db
    .insert(videoWatchEvents)
    .values({
      userId: currentUserId,
      lessonId,
      eventType,
      positionSeconds,
    })
    .returning()
    .get();

  return { success: true };
}
