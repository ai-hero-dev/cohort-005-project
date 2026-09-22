import { data } from "react-router";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/api.notifications";
import { db } from "~/db";
import { notifications } from "~/db/schema";
import { requireUserId } from "~/lib/access.server";
import { parseFormData } from "~/lib/validation";

const markReadSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("mark-read"),
    notificationId: z.coerce.number().int().positive(),
  }),
  z.object({
    intent: z.literal("mark-all-read"),
  }),
]);

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);

  const formData = await request.formData();
  const parsed = parseFormData(formData, markReadSchema);

  if (!parsed.success) {
    throw data("Invalid notification request.", { status: 400 });
  }

  const readAt = new Date().toISOString();

  if (parsed.data.intent === "mark-all-read") {
    db.update(notifications)
      .set({ readAt })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt)
        )
      )
      .run();

    return { ok: true as const };
  }

  // Scoped to the signed-in recipient, so posting somebody else's notification
  // id here marks nothing.
  const updated = db
    .update(notifications)
    .set({ readAt })
    .where(
      and(
        eq(notifications.id, parsed.data.notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      )
    )
    .returning()
    .all();

  if (updated.length === 0) {
    throw data("Notification not found", { status: 404 });
  }

  return { ok: true as const };
}
