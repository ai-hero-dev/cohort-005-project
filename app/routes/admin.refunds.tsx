import { useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/admin.refunds";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { RefundStatus, UserRole, users } from "~/db/schema";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { daysSince, formatPrice } from "~/lib/utils";
import {
  RefundAlreadyResolvedError,
  listRequestedRefunds,
  resolveRefund,
} from "~/lib/refunds.server";

const adminRefundActionSchema = z.object({
  intent: z.enum(["approve", "decline"]),
  refundId: z.coerce.number().int(),
});

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

async function requireAdminId(request: Request) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to review refunds.", {
      status: 401,
    });
  }

  const currentUser = getUserById(currentUserId);

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can review refunds.", { status: 403 });
  }

  return currentUserId;
}

export function meta() {
  return [
    { title: "Refunds — Cadence" },
    { name: "description", content: "Approve or decline requested refunds" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminId(request);

  return { refunds: listRequestedRefunds() };
}

export async function action({ request }: Route.ActionArgs) {
  const adminId = await requireAdminId(request);

  const formData = await request.formData();
  const parsed = parseFormData(formData, adminRefundActionSchema);

  if (!parsed.success) {
    return data({ error: "Invalid input." }, { status: 400 });
  }

  const { intent, refundId } = parsed.data;
  const outcome =
    intent === "approve" ? RefundStatus.Approved : RefundStatus.Declined;

  try {
    const resolved = await resolveRefund(refundId, outcome, adminId);

    if (!resolved) {
      return data({ error: "Refund not found." }, { status: 404 });
    }
  } catch (e) {
    if (e instanceof RefundAlreadyResolvedError) {
      return data(
        { error: "This refund has already been decided." },
        { status: 409 }
      );
    }
    throw e;
  }

  return {
    success: true,
    message: intent === "approve" ? "Refund approved." : "Refund declined.",
  };
}

type RequestedRefund = Route.ComponentProps["loaderData"]["refunds"][number];

function RefundRow({ refund }: { refund: RequestedRefund }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("success" in fetcher.data) toast.success(fetcher.data.message);
    if ("error" in fetcher.data) toast.error(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);

  function decide(intent: "approve" | "decline") {
    fetcher.submit(
      { intent, refundId: String(refund.id) },
      { method: "post" }
    );
  }

  const hoursWatched = (refund.secondsWatched / 3600).toFixed(1);

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3 text-sm">
        <div className="font-medium">{refund.learnerName}</div>
        <div className="text-muted-foreground">{refund.learnerEmail}</div>
      </td>
      <td className="px-4 py-3 text-sm">{refund.courseTitle}</td>
      <td className="px-4 py-3 text-sm">{formatPrice(refund.amount)}</td>
      <td className="max-w-xs px-4 py-3 text-sm whitespace-pre-wrap">
        {refund.reason}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {daysSince(refund.purchasedAt)}d
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {hoursWatched}h
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => decide("approve")}
          >
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => decide("decline")}
          >
            Decline
          </Button>
        </div>
      </td>
    </tr>
  );
}

const COLUMNS = [
  "Learner",
  "Course",
  "Amount",
  "Reason",
  "Since purchase",
  "Watched",
  "Decision",
];

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { refunds } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refunds</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refunds</h1>
        <p className="mt-1 text-muted-foreground">
          Approve or decline requested refunds, oldest first. Approving takes
          the course away from the learner; the money itself is sent back by
          hand.
        </p>
      </div>

      {refunds.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ReceiptText className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">No refunds waiting.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {COLUMNS.map((column) => (
                      <th
                        key={column}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((refund) => (
                    <RefundRow key={refund.id} refund={refund} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refunds.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message = typeof error.data === "string" ? error.data : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message = typeof error.data === "string" ? error.data : "Only admins can access this page.";
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
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
