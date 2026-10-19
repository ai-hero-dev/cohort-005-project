import { useEffect, useState } from "react";
import {
  useFetcher,
  useLocation,
  type FetcherWithComponents,
} from "react-router";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
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

  // Close once the issue is filed; a failed filing leaves the form open.
  useEffect(() => {
    if (issueUrl) setOpen(false);
  }, [issueUrl]);

  return (
    <div className="mt-3 border-t border-dashed pt-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-between"
          >
            Send feedback
            <MessageSquarePlus className="size-3" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Files a GitHub issue on your repo, as you.
            </DialogDescription>
          </DialogHeader>
          <FeedbackForm fetcher={fetcher} filing={filing} />
        </DialogContent>
      </Dialog>

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
  filing,
}: {
  fetcher: FeedbackFetcher;
  filing: boolean;
}) {
  const location = useLocation();

  return (
    <fetcher.Form method="post" action="/api/feedback" className="space-y-2">
      <input
        type="hidden"
        name="page"
        value={location.pathname + location.search}
      />
      <Label htmlFor="feedback-title">Title</Label>
      <Input id="feedback-title" name="title" required />
      <Label htmlFor="feedback-description">What happened?</Label>
      {/* Capped so a long description scrolls instead of growing the dialog. */}
      <Textarea
        id="feedback-description"
        name="description"
        rows={4}
        required
        className="max-h-[40vh] overflow-y-auto"
      />
      <DialogFooter className="pt-2">
        <Button type="submit" disabled={filing}>
          {filing ? "Filing the issue…" : "File issue"}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
