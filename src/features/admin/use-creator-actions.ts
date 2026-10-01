"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { clientsign, WalletType } from "package/connect_wallet";

import { api } from "~/utils/api";

/** The bits of a brand the actions need (list rows and the detail page both have them). */
type CreatorRef = { id: string; name: string; approved: boolean | null };

/**
 * Approve (and issue a page asset): the platform signs the account setup on
 * Stellar first, then the brand is marked approved. Ban/unban/delete are plain
 * updates.
 */
export function useCreatorActions() {
  const utils = api.useUtils();
  const refresh = () => {
    void utils.admin.creator.getCreators.invalidate();
    void utils.admin.creator.getCreator.invalidate();
  };
  const [signing, setSigning] = useState(false);

  const action = api.admin.creator.creatorAction.useMutation({ onSuccess: refresh });
  const xdr = api.admin.creator.creatorRequestXdr.useMutation();
  const del = api.admin.creator.deleteCreator.useMutation({ onSuccess: refresh });

  const approve = async (c: CreatorRef) => {
    const id = toast.loading(`Setting up ${c.name} on Stellar…`);
    setSigning(true);
    try {
      const data = await xdr.mutateAsync({ creatorId: c.id });
      if (!data) throw new Error("This brand has no page asset to issue yet");
      const ok = await clientsign({ presignedxdr: data.xdr, pubkey: "admin", walletType: WalletType.isAdmin });
      if (!ok) throw new Error("The Stellar transaction didn't go through");
      await action.mutateAsync({ creatorId: c.id, action: "approve", escrow: data.escrow, storage: data.storage });
      toast.success(c.approved === true ? `Page asset issued for ${c.name}` : `${c.name} approved`, { id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed", { id });
    } finally {
      setSigning(false);
    }
  };

  const setBan = (c: CreatorRef, ban: boolean, done: () => void) =>
    action.mutate(
      { creatorId: c.id, action: ban ? "ban" : "unban" },
      {
        onSuccess: () => {
          toast.success(ban ? `${c.name} banned` : `${c.name} unbanned`);
          done();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const remove = (c: CreatorRef, done: () => void) =>
    del.mutate(c.id, {
      onSuccess: () => {
        toast.success(`${c.name} deleted`);
        done();
      },
      onError: (e) => toast.error(e.message),
    });

  return { approve: (c: CreatorRef) => void approve(c), setBan, remove, busy: signing || action.isPending || xdr.isPending || del.isPending };
}

