"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "~/components/shadcn/ui/button";
import { api } from "~/utils/api";

/**
 * Shown to a creator whose account exists but was never sent for approval
 * (`aprovalSend: false`, `approved: null`) — without it the layout rendered
 * nothing at all. One button puts them in the admin queue, after which the
 * layout shows the usual pending screen.
 */
export default function RequestApprovalCard({ creatorName }: { creatorName: string }) {
  const utils = api.useUtils();
  const request = api.fan.creator.requestApproval.useMutation({
    onSuccess: (r) => {
      if (r.requested) toast.success("Sent");
      else toast("Nothing to send: it was already sent, or isn't available here");
      void utils.fan.creator.meCreator.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="bg-card border-foreground/10 mx-4 flex w-full max-w-md flex-col items-center rounded-[1.6rem] border-2 p-8 text-center shadow-[8px_9px_0_0_hsl(var(--primary))]">
      <div className="blob bg-primary text-primary-foreground flex size-16 -rotate-6 items-center justify-center">
        <ShieldCheck className="size-7" strokeWidth={2.4} />
      </div>
      <h2 className="display mt-5 text-4xl">Get your brand approved</h2>
      <p className="text-muted-foreground mt-1.5 text-sm">
        {creatorName}, your brand account is set up but hasn&apos;t been sent for review yet. Once
        an admin approves it you can create pins, events and bounties.
      </p>
      <Button className="mt-6" onClick={() => request.mutate()} disabled={request.isPending}>
        {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Request approval
      </Button>
    </div>
  );
}
