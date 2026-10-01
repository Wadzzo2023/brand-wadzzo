"use client";

import { ShieldAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ConnectWalletButton } from "package/connect_wallet";
import type { ReactNode } from "react";

import { BannedCreatorCard } from "~/components/brand/ban-artist";
import JoinArtistPage from "~/components/brand/join-artist";
import PendingArtistPage from "~/components/brand/pending-artist";
import RequestApprovalCard from "~/components/brand/request-approval";
import { Button } from "~/components/shadcn/ui/button";
import { PageSkeleton } from "~/ui/skeleton";

import type { usePortalAccess } from "./use-portal-access";

type Access = ReturnType<typeof usePortalAccess>;

/** Signed out: one clear screen with the wallet/email sign-in. */
export function SignInScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Image src="/images/loading.png" alt="" width={32} height={32} className="object-contain" />
        </span>
        <p className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Brand portal</p>
        <h1 className="mt-1 font-hud text-2xl font-bold">Sign in to Wadzzo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create drops, run bounties and stores, and see how fans engage with your brand.
        </p>
        <div className="mt-6 flex justify-center [&_button]:w-full">
          <ConnectWalletButton />
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
  const { creator } = access;
  if (access.creatorLoading) return <PageSkeleton />;
  // Approved last time: show the page while the check runs (the server still
  // refuses anything this brand may not do).
  if (creator.isLoading && access.approved) return <>{children}</>;
  const c = creator.data;
  if ((c?.id && c.aprovalSend && c.approved === true) || access.isAdmin) return <>{children}</>;
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-10">
      {c?.aprovalSend && (c.approved === null || c.approved === undefined) ? (
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

/** Admin pages: only admins get past (the nav never links non-admins here). */
export function AdminGate({ access, children }: { access: Access; children: ReactNode }) {
  if (access.adminLoading) return <PageSkeleton />;
  if (access.isAdmin) return <>{children}</>;
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="font-hud text-xl font-bold">Admins only</h1>
        <p className="mt-1 text-sm text-muted-foreground">This area is for Wadzzo admins. Your account doesn&apos;t have admin access.</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/pins">Back to your portal</Link>
        </Button>
      </div>
    </div>
  );
}
