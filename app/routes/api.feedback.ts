import { data } from "react-router";
import type { Route } from "./+types/api.feedback";
import { feedback } from "~/modules/feedback/index.server";

export function loader() {
  throw data("Not found", { status: 404 });
}

export async function action({ request }: Route.ActionArgs) {
  return feedback.fileIssue(request);
}
