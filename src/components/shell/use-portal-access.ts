"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo } from "react";

import { useCreatorStorageAcc, useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { api } from "~/utils/api";

/**
 * Everything the shell needs to decide what to show, in one place:
 * sign-in state, admin, the brand's nav permission, and the wallet balances
 * other screens read from the balance stores.
 *
 * (Query 5 has no per-query onSuccess, so the store syncing lives in effects.)
 */
type Remembered = { isAdmin: boolean; approved: boolean; navPermission: boolean };
const ACCESS_KEY = "wadzzo.access";

/** Last access we saw for this user — shown while the fresh check runs. */
function readRemembered(userId: string | undefined): Remembered | null {
  if (!userId) return null;
  try {
    const all = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? "{}") as Record<string, Remembered>;
    return all[userId] ?? null;
  } catch {
    return null;
  }
}

function remember(userId: string, value: Remembered) {
  try {
    // One entry: only the signed-in user's access is kept.
    localStorage.setItem(ACCESS_KEY, JSON.stringify({ [userId]: value }));
  } catch {
    /* storage unavailable: no head start next time */
  }
}

export function usePortalAccess() {
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const userId = session.data?.user?.id;

  const admin = api.wallate.admin.checkAdmin.useQuery(undefined, { enabled: signedIn, retry: false });
  const creator = api.fan.creator.meCreator.useQuery(undefined, { enabled: signedIn });
  const approved = Boolean(creator.data?.aprovalSend && creator.data?.approved === true);
  const permission = api.fan.creator.getPermissionData.useQuery(undefined, { enabled: signedIn && approved, retry: false });

  const account = api.wallate.acc.getAccountBalance.useQuery(undefined, { enabled: signedIn, retry: false });
  const storage = api.wallate.acc.getCreatorStorageBallances.useQuery(undefined, { enabled: signedIn && approved, retry: false });

  const setUserBalance = useUserStellarAcc((s) => s.setBalance);
  const setUserActive = useUserStellarAcc((s) => s.setActive);
  const setStorageBalance = useCreatorStorageAcc((s) => s.setBalance);

  useEffect(() => {
    if (account.data) {
      setUserBalance(account.data.balances);
      setUserActive(true);
    } else if (account.isError) {
      setUserActive(false);
    }
  }, [account.data, account.isError, setUserBalance, setUserActive]);

  useEffect(() => {
    if (storage.data) setStorageBalance(storage.data);
  }, [storage.data, setStorageBalance]);

  // Reloads start from the last known access so the nav and the page show at
  // once instead of waiting on these checks. The server still enforces every
  // permission; this only decides what renders first.
  // userId only exists once the session has loaded on the client (after
  // hydration), so reading storage here can't cause a hydration mismatch.
  const cached = useMemo(() => readRemembered(userId), [userId]);

  const settled = admin.isFetched && creator.isFetched && (!approved || permission.isFetched);
  const fresh: Remembered = { isAdmin: Boolean(admin.data), approved, navPermission: Boolean(permission.data) };
  useEffect(() => {
    if (settled && userId) remember(userId, fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, userId, fresh.isAdmin, fresh.approved, fresh.navPermission]);

  const now = settled ? fresh : (cached ?? fresh);
  return {
    session,
    signedIn,
    isAdmin: admin.isFetched ? fresh.isAdmin : now.isAdmin,
    adminLoading: signedIn && admin.isLoading && !cached,
    creator,
    approved: creator.isFetched ? approved : now.approved,
    /** True while the brand check is still running and we have nothing remembered. */
    creatorLoading: signedIn && creator.isLoading && !cached?.approved,
    navPermission: permission.isFetched ? fresh.navPermission : now.navPermission,
  };
}
