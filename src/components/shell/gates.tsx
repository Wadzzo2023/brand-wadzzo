"use client";

import { Loader2, ShieldAlert, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDialogStore } from "package/connect_wallet/src/state/connect_wallet_dialog";
import { useEffect, type ReactNode } from "react";

import { BannedCreatorCard } from "~/components/brand/ban-artist";
import JoinArtistPage from "~/components/brand/join-artist";
import PendingArtistPage from "~/components/brand/pending-artist";
import RequestApprovalCard from "~/components/brand/request-approval";
import { Button } from "~/components/shadcn/ui/button";
import { PageSkeleton } from "~/ui/skeleton";

import type { usePortalAccess } from "./use-portal-access";
import { WadzzoMark } from "~/ui/wadzzo-mark";

type Access = ReturnType<typeof usePortalAccess>;

/** Signed out: one clear screen with the wallet/email sign-in. */
/** Opens the shared sign-in dialog (email, Google, Apple or a Stellar wallet). */
function SignInButton() {
  const open = useDialogStore((s) => s.setIsOpen);
  return (
    <Button size="lg" onClick={() => open(true)}>
      <LogIn className="size-5" strokeWidth={2.6} />
      <span className="marker text-base">Sign in / Sign up</span>
    </Button>
  );
}

export function SignInScreen() {
  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-4">
      <div className="bg-card border-foreground/10 w-full max-w-sm rounded-[1.6rem] border-2 p-8 text-center shadow-[8px_9px_0_0_hsl(var(--primary))]">
        <span className="bg-side-ink text-side mx-auto mb-5 flex size-14 -rotate-3 items-center justify-center rounded-2xl">
          <WadzzoMark className="h-7" />
        </span>
        <p className="marker text-primary text-sm">Brand portal</p>
        <h1 className="display mt-1 text-5xl">Sign in to Wadzzo</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Create drops, run bounties and stores, and see how fans engage with your brand.
        </p>
        <div className="mt-6 flex justify-center [&_button]:w-full">
          <SignInButton />
        </div>
      </div>
    </div>
  );
}

/**
 * The brand's approval states, in the same order the portal has always used:
 * approved → the page; applied and waiting → pending; refused → banned;
 * created but never applied → request approval; nothing yet → join.
 */
export function CreatorGate({ access, children }: { access: Access; children: ReactNode }) {
  const router = useRouter();
  const { creator } = access;
  const c = creator.data;
  const isSettled = creator.isFetched;
  const isApproved = Boolean(c?.id && c.aprovalSend && c.approved === true && c.onThisPlatform);
  // An admin with a brand of their own here that isn't working yet gets its status screen, not a bounce.
  const hasBrandHere = Boolean(c && c.onThisPlatform && c.approved !== false);
  const shouldRedirectAdmin = access.isAdmin && isSettled && !isApproved && !hasBrandHere;

  // If user is an admin but NOT an approved creator, they only have access to
  // their admin section, not the creator section. Redirect them to /admin/creators.
  useEffect(() => {
    if (shouldRedirectAdmin) {
      router.replace("/admin/creators");
    }
  }, [shouldRedirectAdmin, router]);

  if (access.creatorLoading) return <PageSkeleton />;
  // Approved last time: show the page while the check runs (the server still
  // refuses anything this brand may not do).
  if (creator.isLoading && access.approved) return <>{children}</>;
  if (isApproved) return <>{children}</>;

  if (shouldRedirectAdmin) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="text-primary size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">Redirecting to admin portal...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-10">
      {c && !c.onThisPlatform ? (
        <OtherPlatformCard platformName={c.platform.name} />
      ) : c?.aprovalSend && (c.approved === null || c.approved === undefined) ? (
        <PendingArtistPage createdAt={c.createdAt} />
      ) : c?.approved === false ? (
        <BannedCreatorCard creatorName={c.name} />
      ) : c && !c.aprovalSend ? (
        <RequestApprovalCard creatorName={c.name} />
      ) : (
        <JoinArtistPage />
      )}
    </div>
  );
}

/** This account is a brand on another platform: it can't be used here. */
function OtherPlatformCard({ platformName }: { platformName: string }) {
  return (
    <div className="max-w-sm text-center">
      <ShieldAlert className="text-muted-foreground mx-auto mb-3 size-8" />
      <h1 className="display text-4xl">This brand is on {platformName}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Your account is already a brand on {platformName}, and a brand belongs to one platform only.
        Sign in with a different account to create a brand here.
      </p>
    </div>
  );
}

/** Admin pages: only admins get past (the nav never links non-admins here). */
export function AdminGate({ access, children }: { access: Access; children: ReactNode }) {
  if (access.adminLoading) return <PageSkeleton />;
  if (access.isAdmin) return <>{children}</>;
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <ShieldAlert className="text-muted-foreground mx-auto mb-3 size-8" />
        <h1 className="display text-4xl">Admins only</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          This area is for Wadzzo admins. Your account doesn&apos;t have admin access.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/pins">Back to your portal</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Onboarding gate: Only accessible if the user hasn't submitted the form yet
 * or isn't a creator yet (!c?.id && !c?.aprovalSend). If they already submitted or
 * are already a creator, redirect them to their portal.
 */
export function OnboardingGate({ access, children }: { access: Access; children: ReactNode }) {
  const router = useRouter();
  const c = access.creator.data;
  const isSettled = access.creator.isFetched;

  const hasSubmittedOrIsCreator = Boolean(c?.id) || Boolean(c?.aprovalSend);
  const isApproved = Boolean(c?.id && c.aprovalSend && c.approved === true);
  const destination = access.isAdmin && !isApproved ? "/admin/creators" : "/pins";
  // A brand that belongs to another platform: explain, rather than bouncing them away.
  const otherPlatform = c && !c.onThisPlatform ? c.platform.name : null;

  useEffect(() => {
    if (isSettled && hasSubmittedOrIsCreator && !otherPlatform) {
      router.replace(destination);
    }
  }, [isSettled, hasSubmittedOrIsCreator, otherPlatform, destination, router]);

  if (access.creatorLoading || (access.creator.isLoading && !c)) {
    return <PageSkeleton />;
  }

  if (otherPlatform) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center px-4">
        <OtherPlatformCard platformName={otherPlatform} />
      </div>
    );
  }

  if (hasSubmittedOrIsCreator) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="text-primary size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">Redirecting to your portal...</p>
      </div>
    );
  }

  return <>{children}</>;
}
