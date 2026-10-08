// PROTOTYPE — throwaway, for "What does the Notification Feed look like in
// Cadence?" (ai-hero-dev/cohort-005-project#19). prototype/notification-feed only.
// The "See all" page (variant A3), plus the "Seed my feed" action every variant uses.
import type { Route } from "./+types/prototype.notifications";
import { requireUserId } from "~/lib/access.server";
import { seedMyFeed } from "~/lib/notification-feed-prototype.server";
import { NotificationInboxPage } from "~/components/notification-feed-prototype";

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const count = Number((await request.formData()).get("count") ?? 8);
  return { seeded: await seedMyFeed(userId, count) };
}

export default function Notifications() {
  return <NotificationInboxPage />;
}
