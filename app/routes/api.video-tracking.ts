import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.video-tracking";
import { coursePermissions } from "~/modules/permissions/course-permissions.server";
import { parseJsonBody } from "~/lib/validation";
import { db } from "~/db";
import { videoWatchEvents } from "~/db/schema";

const videoTrackingSchema = z.object({
  lessonId: z.number(),
  eventType: z.string(),
  positionSeconds: z.number(),
});

export async function action({ request }: Route.ActionArgs) {
  const parsed = await parseJsonBody(request, videoTrackingSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, eventType, positionSeconds } = parsed.data;

  // Watched time feeds the Watch Limit for Refunds, so it's recorded only for
  // people who can take the course the lesson belongs to.
  const { person } = await coursePermissions.requireCapability(
    request,
    "take",
    { lessonId }
  );

  db.insert(videoWatchEvents)
    .values({
      userId: person.id,
      lessonId,
      eventType,
      positionSeconds,
    })
    .returning()
    .get();

  return { success: true };
}
