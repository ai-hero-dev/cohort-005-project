import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { people } from "~/modules/permissions/person.server";
import { db } from "~/db";
import { courses, purchases } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { raiseRefundRequest } from "~/lib/refunds.server";
import { defaultNotifications } from "~/lib/notifications.server";
import { sendEmail } from "~/lib/mailer.server";

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundActionSchema = z.object({
  // A Refund Request is for one specific Purchase, which the buyer picks —
  // their Individual Purchase from the course page, or a Team Licence from
  // the team page.
  purchaseId: z.coerce.number().int(),
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

function getCourseBySlug(slug: string) {
  return db.select().from(courses).where(eq(courses.slug, slug)).get();
}

export async function action({ params, request }: Route.ActionArgs) {
  const { id: currentUserId } = await people.requirePerson(request);

  const { slug } = parseParams(params, refundParamsSchema);
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, parsed.data.purchaseId))
    .get();

  if (!purchase || purchase.courseId !== course.id) {
    throw data("Purchase not found.", { status: 404 });
  }

  const result = await raiseRefundRequest(
    db,
    purchase.id,
    currentUserId,
    parsed.data.reason,
    new Date(),
    await defaultNotifications()
  );

  if (!result.ok) {
    throw data(result.error, { status: result.status });
  }

  await sendEmail(result.email);

  return redirect(result.kind === "team_licence" ? "/team" : "/settings");
}
