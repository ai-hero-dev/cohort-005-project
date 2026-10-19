import { useState } from "react";
import {
  useFetcher,
  useLocation,
  type FetcherWithComponents,
} from "react-router";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

type FeedbackFetcher = FetcherWithComponents<{ issueUrl: string }>;

/**
 * Dev only. Files what you type as a GitHub issue on your own repo (origin)
 * through `/api/feedback`, which runs `gh issue create` as you.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ issueUrl: string }>();
  const filing = fetcher.state !== "idle";
  const issueUrl = filing ? null : fetcher.data?.issueUrl;

  return (
    <div className="mt-3 border-t border-dashed pt-3">
      <Button
        size="sm"
        variant="outline"
        className="w-full justify-between"
        onClick={() => setOpen(!open)}
      >
        Send feedback
        <MessageSquarePlus className="size-3" />
      </Button>

      {open && (
        <FeedbackForm fetcher={fetcher} onSubmit={() => setOpen(false)} />
      )}

      {filing && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          Filing the issue…
        </div>
      )}
      {issueUrl && (
        <a
          href={issueUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 block truncate text-xs underline"
        >
          Issue filed: {issueUrl}
        </a>
      )}
    </div>
  );
}

function FeedbackForm({
  fetcher,
  onSubmit,
}: {
  fetcher: FeedbackFetcher;
  onSubmit: () => void;
}) {
  const location = useLocation();

  return (
    <fetcher.Form
      method="post"
      action="/api/feedback"
      onSubmit={onSubmit}
      className="mt-2 space-y-2"
    >
      <input
        type="hidden"
        name="page"
        value={location.pathname + location.search}
      />
      <Label htmlFor="feedback-title" className="text-xs">
        Title
      </Label>
      <Input id="feedback-title" name="title" required />
      <Label htmlFor="feedback-description" className="text-xs">
        What happened?
      </Label>
      <Textarea
        id="feedback-description"
        name="description"
        rows={4}
        required
      />
      <Button type="submit" size="sm" className="w-full">
        File issue
      </Button>
    </fetcher.Form>
  );
}
