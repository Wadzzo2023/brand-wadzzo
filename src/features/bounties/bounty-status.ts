import type { BountyStatus } from "@prisma/client";

/** A bounty's state for brands: review status first, then whether all winners are picked. */
export function bountyStatus(b: { status: BountyStatus; currentWinnerCount: number; totalWinner: number }) {
  if (b.status === "REJECTED") return { label: "Rejected", tone: "bg-destructive/10 text-destructive" };
  if (b.status === "PENDING") return { label: "In review", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  if (b.currentWinnerCount >= b.totalWinner) return { label: "Completed", tone: "bg-muted text-muted-foreground" };
  return { label: "Live", tone: "bg-primary/10 text-primary" };
}
