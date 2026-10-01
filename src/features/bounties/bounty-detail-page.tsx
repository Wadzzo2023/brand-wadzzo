"use client";

import type { SubmissionAttachment, SubmissionViewType } from "@prisma/client";
import { format } from "date-fns";
import DOMPurify from "isomorphic-dompurify";
import { Calendar, Crown, MessageSquare, Paperclip, Pencil, Target, Trash2, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { submitSignedXDRToServer4User } from "package/connect_wallet/src/lib/stellar/trx/payment_fb_g";
import { useState } from "react";
import toast from "react-hot-toast";

import Chat from "~/components/chat/chat";
import { AddBountyComment } from "~/components/comment/Add-Bounty-Comment";
import ViewBountyComment from "~/components/comment/View-Bounty-Comment";
import CustomAvatar from "~/components/common/custom-avatar";
import ViewBountyAttachmentModal from "~/components/modals/view-bounty-attachment-modal";
import { Button } from "~/components/shadcn/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { Spinner } from "~/ui/spinner";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

import { bountyStatus } from "./bounty-status";

type Tab = "details" | "submissions" | "chat" | "comments";
const TABS: Tab[] = ["details", "submissions", "chat", "comments"];
const back = { href: "/bounties", label: "Bounties" };

type Bounty = NonNullable<RouterOutputs["bounty"]["Bounty"]["getBountyByID"]>;
type Submission = RouterOutputs["bounty"]["Bounty"]["getBountyAllSubmission"][number];

const STATUS_LABEL: Record<SubmissionViewType, string> = {
  UNCHECKED: "New",
  CHECKED: "Seen",
  ONREVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function SafeHTML({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}

/** One bounty, for the brand that runs it: brief, entries, winners, chat and comments. */
export default function BountyDetailPage() {
  const id = Number(useParams<{ id: string }>()?.id);
  const valid = Number.isInteger(id) && id > 0;
  const owner = api.bounty.Bounty.isOwnerOfBounty.useQuery({ BountyId: id }, { enabled: valid, retry: false });
  const bounty = api.bounty.Bounty.getBountyByID.useQuery({ BountyId: id }, { enabled: valid && Boolean(owner.data?.isOwner) });

  if (!valid) return <NotFound />;
  if (owner.isPending || (owner.data?.isOwner && bounty.isLoading)) return <DetailSkeleton />;
  if (owner.isError) return /not found/i.test(owner.error.message) ? <NotFound /> : <Failed message={owner.error.message} retry={() => void owner.refetch()} />;
  if (!owner.data.isOwner)
    return (
      <PageBody className="max-w-5xl">
        <PageHeader title="Bounty" back={back} />
        <EmptyState className="mt-6" icon={Target} title="Not your bounty" description="Only the brand that created a bounty can manage it here." />
      </PageBody>
    );
  if (bounty.isError) return <Failed message={bounty.error.message} retry={() => void bounty.refetch()} />;
  if (!bounty.data) return <NotFound />;
  return <BountyView bounty={bounty.data} />;
}

function BountyView({ bounty: b }: { bounty: Bounty }) {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname() ?? "";
  const tabParam = search?.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "details";
  const setTab = (t: string) => router.replace(t === "details" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const utils = api.useUtils();
  const refresh = () => {
    void utils.bounty.Bounty.getBountyByID.invalidate({ BountyId: b.id });
    void utils.bounty.Bounty.getBountyAllSubmission.invalidate({ BountyId: b.id });
  };

  const status = bountyStatus(b);
  const hasWinners = b.currentWinnerCount > 0;
  const [deleting, setDeleting] = useState(false);

  // Refund the prize (signed by the platform, submitted here), then delete.
  const remove = api.bounty.Bounty.deleteBounty.useMutation({
    onSuccess: () => {
      toast.success("Bounty deleted and prize refunded");
      void utils.bounty.Bounty.invalidate();
      router.push("/bounties");
    },
    onError: (e) => toast.error(e.message),
  });
  const refund = api.bounty.Bounty.getDeleteXdr.useMutation({
    onSuccess: async (xdr) => {
      try {
        if (xdr) await submitSignedXDRToServer4User(xdr);
        remove.mutate({ BountyId: b.id });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The refund didn't go through");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const deletingBusy = refund.isPending || remove.isPending;

  return (
    <PageBody className="max-w-5xl">
      <PageHeader
        eyebrow="Bounty"
        title={b.title}
        back={back}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/bounties/${b.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={hasWinners || deletingBusy}
              title={hasWinners ? "Bounties with winners can't be deleted" : undefined}
              onClick={() => setDeleting(true)}
            >
              <Trash2 /> Delete
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_300px]">
        {b.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.imageUrls[0]} alt="" className="aspect-video w-full rounded-xl border object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl border bg-muted">
            <Target className="size-10 text-muted-foreground" />
          </div>
        )}
        <dl className="grid grid-cols-2 gap-3 self-start lg:grid-cols-1">
          <Stat label="Status">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", status.tone)}>{status.label}</span>
          </Stat>
          <Stat label="Prize" icon={Trophy}>
            <span className="tabular-nums">${b.priceInUSD.toLocaleString()}</span>
            <span className="block text-xs font-normal text-muted-foreground tabular-nums">
              {b.priceInBand.toFixed(3)} {PLATFORM_ASSET.code.toUpperCase()}
            </span>
          </Stat>
          <Stat label="Winners" icon={Crown}>
            <span className="tabular-nums">
              {b.currentWinnerCount} / {b.totalWinner}
            </span>
          </Stat>
          <Stat label="Participants" icon={Users}>
            <span className="tabular-nums">{b._count.participants.toLocaleString()}</span>
          </Stat>
          {b.endDate && (
            <Stat label="Ends" icon={Calendar}>
              {format(new Date(b.endDate), "MMM d, yyyy")}
            </Stat>
          )}
        </dl>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="details" className="gap-1.5">
              <Target className="size-4" /> Brief
            </TabsTrigger>
            <TabsTrigger value="submissions" className="gap-1.5">
              <Paperclip className="size-4" /> Entries <span className="tabular-nums text-muted-foreground">{b._count.submissions}</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageSquare className="size-4" /> Chat
            </TabsTrigger>
            <TabsTrigger value="comments" className="gap-1.5">
              <MessageSquare className="size-4" /> Comments <span className="tabular-nums text-muted-foreground">{b._count.comments}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="details" className="mt-5">
          <SafeHTML html={b.description} className="prose prose-sm max-w-none rounded-xl border bg-card p-5 dark:prose-invert" />
        </TabsContent>
        <TabsContent value="submissions" className="mt-5">
          <Submissions bounty={b} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="chat" className="mt-5">
          <div className="rounded-xl border bg-card">
            <Chat bountyId={b.id} />
          </div>
        </TabsContent>
        <TabsContent value="comments" className="mt-5">
          <Comments bountyId={b.id} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleting}
        onOpenChange={(o) => !deletingBusy && setDeleting(o)}
        title={`Delete “${b.title}”?`}
        description={`The ${b.priceInBand.toFixed(3)} ${PLATFORM_ASSET.code.toUpperCase()} prize goes back to your wallet, and entries, chat and comments are removed. This can't be undone.`}
        confirmLabel="Delete and refund"
        busy={deletingBusy}
        onConfirm={() => refund.mutate({ bountyId: b.id, prize: b.priceInBand })}
      />
    </PageBody>
  );
}

function Submissions({ bounty: b, onChanged }: { bounty: Bounty; onChanged: () => void }) {
  const list = api.bounty.Bounty.getBountyAllSubmission.useQuery({ BountyId: b.id });
  const [attachments, setAttachments] = useState<SubmissionAttachment[] | null>(null);
  const [crowning, setCrowning] = useState<Submission | null>(null);

  const setStatus = api.bounty.Bounty.updateBountySubmissionStatus.useMutation({
    onSuccess: () => void list.refetch(),
    onError: (e) => toast.error(e.message),
  });
  const mark = api.bounty.Bounty.makeBountyWinner.useMutation({
    onSuccess: () => {
      toast.success("Winner marked — they can claim the prize");
      setCrowning(null);
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const pay = api.bounty.Bounty.getSendBalanceToWinnerXdr.useMutation({
    onSuccess: async (xdr, v) => {
      try {
        if (xdr) await submitSignedXDRToServer4User(xdr);
        mark.mutate({ BountyId: v.BountyId, userId: v.userId });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The prize payment didn't go through");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const crowningBusy = pay.isPending || mark.isPending;

  const winners = new Set(b.BountyWinner.map((w) => w.user.id));
  const full = b.currentWinnerCount >= b.totalWinner;
  const share = b.priceInBand / b.totalWinner;

  if (list.isPending)
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  if (list.isError) return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />;
  if (!list.data.length)
    return <EmptyState icon={Paperclip} title="No entries yet" description="When fans submit to this bounty, their entries show up here for you to review." />;

  return (
    <>
      <ul className="space-y-3">
        {list.data.map((s) => {
          const won = winners.has(s.user.id);
          return (
            <li key={s.id} className={cn("rounded-xl border bg-card p-4 sm:p-5", won && "border-primary/50")}>
              <div className="flex flex-wrap items-center gap-3">
                <CustomAvatar url={s.user.image} winnerCount={s.userWinCount} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.user.name ?? addrShort(s.userId, 6)}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(s.createdAt), "MMM d, yyyy · HH:mm")}</p>
                </div>
                {won ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    <Crown className="size-3.5" /> Winner
                  </span>
                ) : (
                  <Select
                    value={s.status}
                    disabled={setStatus.isPending && setStatus.variables?.submissionId === s.id}
                    onValueChange={(v) => setStatus.mutate({ creatorId: b.creatorId, submissionId: s.id, status: v as SubmissionViewType })}
                  >
                    <SelectTrigger className="w-32" aria-label="Entry status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as SubmissionViewType[]).map((k) => (
                        <SelectItem key={k} value={k} disabled={k === "UNCHECKED"}>
                          {STATUS_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <EntryText html={s.content} />

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!s.medias.length}
                  onClick={() => {
                    if (s.status === "UNCHECKED") setStatus.mutate({ creatorId: b.creatorId, submissionId: s.id, status: "CHECKED" });
                    setAttachments(s.medias);
                  }}
                >
                  <Paperclip /> {s.medias.length ? `Attachments (${s.medias.length})` : "No attachments"}
                </Button>
                {!won && (
                  <Button size="sm" disabled={full || crowningBusy} title={full ? "All winners are picked" : undefined} onClick={() => setCrowning(s)}>
                    <Crown /> Mark as winner
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {attachments && <ViewBountyAttachmentModal data={attachments} isOpen onClose={() => setAttachments(null)} />}
      <ConfirmDialog
        open={Boolean(crowning)}
        onOpenChange={(o) => !o && !crowningBusy && setCrowning(null)}
        title={`Make ${crowning?.user.name ?? "this fan"} a winner?`}
        description={
          <>
            Their share of the prize —{" "}
            <b className="tabular-nums">
              {share.toFixed(3)} {PLATFORM_ASSET.code.toUpperCase()}
            </b>{" "}
            (about ${(b.priceInUSD / b.totalWinner).toLocaleString()}) — is sent to them now. This can&apos;t be undone.
          </>
        }
        confirmLabel="Confirm winner"
        destructive={false}
        busy={crowningBusy}
        onConfirm={() => crowning && pay.mutate({ BountyId: b.id, userId: crowning.userId, prize: b.priceInBand })}
      />
    </>
  );
}

function EntryText({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  const long = html.length > 400;
  return (
    <div className="mt-3">
      <SafeHTML html={html} className={cn("prose prose-sm max-w-none dark:prose-invert", long && !open && "line-clamp-5")} />
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-sm font-medium text-primary hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function Comments({ bountyId }: { bountyId: number }) {
  const comments = api.bounty.Bounty.getBountyComments.useQuery({ bountyId });
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <AddBountyComment bountyId={bountyId} />
      {comments.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5" />
        </div>
      ) : comments.isError ? (
        <ErrorState message={comments.error.message} onRetry={() => void comments.refetch()} />
      ) : !comments.data.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="divide-y">
          {comments.data.map((c) => (
            <li key={c.id} className="py-4 first:pt-0 last:pb-0">
              <ViewBountyComment comment={c} bountyChildComments={c.bountyChildComments} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, icon: Icon, children }: { label: string; icon?: typeof Trophy; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <dt className="flex items-center gap-1.5 font-hud text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </dt>
      <dd className="mt-1 font-semibold">{children}</dd>
    </div>
  );
}

function NotFound() {
  return (
    <PageBody className="max-w-5xl">
      <PageHeader title="Bounty" back={back} />
      <EmptyState
        className="mt-6"
        icon={Target}
        title="Bounty not found"
        description="It may have been deleted."
        action={
          <Button variant="outline" asChild>
            <Link href="/bounties">Back to bounties</Link>
          </Button>
        }
      />
    </PageBody>
  );
}

function Failed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <PageBody className="max-w-5xl">
      <PageHeader title="Bounty" back={back} />
      <ErrorState className="mt-6" message={message} onRetry={retry} />
    </PageBody>
  );
}

function DetailSkeleton() {
  return (
    <PageBody className="max-w-5xl">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-8 w-1/2" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </PageBody>
  );
}
