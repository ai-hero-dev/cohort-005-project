import { useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/admin.refunds";
import { parseFormData } from "~/lib/validation";
import {
  RefundStatus,
  courses,
  enrollments,
  purchases,
  refunds,
  users,
} from "~/db/schema";
import { db } from "~/db";
import { and, eq, isNull } from "drizzle-orm";
import { requireInstructorOrAdmin, requireStaff } from "~/lib/access.server";
import { getDiscountForCountry } from "~/lib/ppp";
import { formatPrice } from "~/lib/utils";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { AlertTriangle, Undo2 } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";

const refundDecisionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundId: z.coerce.number().int(),
  }),
]);

function getPendingRefunds(instructorId: number | null) {
  const rows = db
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      learnerName: users.name,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
      amountPaid: purchases.amountPaid,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(users.id, purchases.userId))
    .where(eq(refunds.status, RefundStatus.Requested))
    .all();

  // An admin sees every pending Refund. An instructor sees the ones raised
  // against their own courses, which is the same set `requireStaff` will let
  // them resolve.
  if (instructorId === null) return rows;

  return rows.filter((row) => row.instructorId === instructorId);
}

function getRefundById(id: number) {
  return db.select().from(refunds).where(eq(refunds.id, id)).get();
}

function getPurchaseById(id: number) {
  return db.select().from(purchases).where(eq(purchases.id, id)).get();
}

function getCourseById(id: number) {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

export function meta() {
  return [
    { title: "Refunds — Cadence" },
    { name: "description", content: "Approve or decline pending refunds" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { userId, isAdmin } = await requireInstructorOrAdmin(request);

  return { pendingRefunds: getPendingRefunds(isAdmin ? null : userId) };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = parseFormData(formData, refundDecisionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const refund = getRefundById(parsed.data.refundId);

  if (!refund) {
    throw data("Refund not found", { status: 404 });
  }

  if (refund.status !== RefundStatus.Requested) {
    throw data("That refund has already been resolved.", { status: 409 });
  }

  const purchase = getPurchaseById(refund.purchaseId);

  if (!purchase) {
    throw data("Purchase not found", { status: 404 });
  }

  const course = getCourseById(purchase.courseId);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const access = await requireStaff(request, course.id);

  if (!access.userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const resolvedAt = new Date().toISOString();

  if (parsed.data.intent === "decline") {
    db.update(refunds)
      .set({
        status: RefundStatus.Declined,
        resolvedAt,
        resolvedByUserId: access.userId,
      })
      .where(eq(refunds.id, refund.id))
      .run();

    return { ok: true as const, intent: "decline" as const };
  }

  // A purchase made at a purchasing-power price is given back at that price,
  // not at the list price of the course.
  const pppDiscount = getDiscountForCountry(purchase.country);
  const amountRefunded = pppDiscount > 0 ? purchase.amountPaid : course.price;

  db.update(refunds)
    .set({
      status: RefundStatus.Approved,
      resolvedAt,
      resolvedByUserId: access.userId,
      amountRefunded,
    })
    .where(eq(refunds.id, refund.id))
    .run();

  // An approved Refund takes the course back, but the enrollment row stays —
  // see docs/adr/0001-soft-delete-enrollment-on-refund.md.
  db.update(enrollments)
    .set({ refundedAt: resolvedAt })
    .where(
      and(
        eq(enrollments.userId, purchase.userId),
        eq(enrollments.courseId, purchase.courseId),
        isNull(enrollments.refundedAt)
      )
    )
    .run();

  return { ok: true as const, intent: "approve" as const };
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { pendingRefunds } = loaderData;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Refunds</h1>
        <p className="text-sm text-muted-foreground">
          {pendingRefunds.length === 0
            ? "No refunds are waiting on you."
            : pendingRefunds.length === 1
              ? "One refund is waiting on you."
              : `${pendingRefunds.length} refunds are waiting on you.`}
        </p>
      </div>

      <div className="space-y-4">
        {pendingRefunds.map((refund) => (
          <PendingRefund key={refund.id} refund={refund} />
        ))}
      </div>
    </div>
  );
}

function PendingRefund({
  refund,
}: {
  refund: {
    id: number;
    reason: string;
    requestedAt: string;
    learnerName: string;
    courseTitle: string;
    courseSlug: string;
    amountPaid: number;
  };
}) {
  const fetcher = useFetcher<{ error?: string }>();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    const error = fetcher.data?.error;
    if (fetcher.state === "idle" && error) {
      toast.error(error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{refund.learnerName}</h2>
            <Link
              to={`/courses/${refund.courseSlug}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {refund.courseTitle}
            </Link>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">
            {formatPrice(refund.amountPaid)} · raised{" "}
            {new Date(refund.requestedAt).toLocaleDateString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{refund.reason}</p>
        <fetcher.Form method="post" className="flex gap-2">
          <input type="hidden" name="refundId" value={refund.id} />
          <Button
            type="submit"
            name="intent"
            value="approve"
            size="sm"
            disabled={isSubmitting}
          >
            <Undo2 className="mr-2 size-4" />
            Approve refund
          </Button>
          <Button
            type="submit"
            name="intent"
            value="decline"
            size="sm"
            variant="ghost"
            disabled={isSubmitting}
          >
            Decline refund
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refunds.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only this course's instructor can resolve its refunds.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
