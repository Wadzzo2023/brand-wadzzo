"use client"

import { Loader2, ShieldCheck } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "~/components/shadcn/ui/button"
import { api } from "~/utils/api"

/**
 * Shown to a creator whose account exists but was never sent for approval
 * (`aprovalSend: false`, `approved: null`) — without it the layout rendered
 * nothing at all. One button puts them in the admin queue, after which the
 * layout shows the usual pending screen.
 */
export default function RequestApprovalCard({ creatorName }: { creatorName: string }) {
    const utils = api.useUtils()
    const request = api.fan.creator.requestApproval.useMutation({
        onSuccess: (r) => {
            toast.success(r.requested ? "Approval requested" : "Already in review")
            void utils.fan.creator.meCreator.invalidate()
        },
        onError: (e) => toast.error(e.message),
    })

    return (
        <div className="mx-4 flex w-full max-w-md flex-col items-center rounded-2xl border bg-card p-8 text-center shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Get your brand approved</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
                {creatorName}, your brand account is set up but hasn&apos;t been sent for review yet. Once an
                admin approves it you can create pins, events and bounties.
            </p>
            <Button className="mt-6" onClick={() => request.mutate()} disabled={request.isLoading}>
                {request.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Request approval
            </Button>
        </div>
    )
}
