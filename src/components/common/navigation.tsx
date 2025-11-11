"use client";

import { LogOut, Settings, User, Wallet } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/shadcn/ui/avatar";
import { Button } from "~/components/shadcn/ui/button";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { api } from "~/utils/api";
import { NavLinks } from "./navlinks";

export function Navigation() {
  const session = useSession();
  const { setBalance, setActive, active, platformAssetBalance } =
    useUserStellarAcc();
  const balances = api.wallate.acc.getAccountBalance.useQuery(undefined, {
    onSuccess: (data) => {
      const { balances } = data;
      setBalance(balances);
      setActive(true);
    },
    onError: (error) => {
      // toast.error(error.message);
      setActive(false);
    },
  });

  const formatBalance = (balance: number | undefined) => {
    if (balance === undefined || balance === null) return "0.00";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(balance);
  };

  return (
    <div className="group z-30 flex h-screen w-16 flex-col border-r border-gray-100 bg-primary/10 shadow-sm transition-all duration-300 hover:w-64">
      {/* Logo */}
      <div
        className="border-b border-gray-100 p-4"
        onClick={() => (window.location.href = "/map")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
            <Image
              src="/images/loading.png"
              alt="Logo"
              width={100}
              height={100}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <h1 className="whitespace-nowrap text-lg font-semibold text-gray-900">
              Wadzzo
            </h1>
          </div>
        </div>
      </div>

      {session.status === "authenticated" && active && (
        <div className="border-b border-gray-100 p-2">
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-3 py-2.5">
            <div className="flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                <Wallet className="h-4 w-4 text-green-600" />
              </div>
            </div>
            <div className="flex-1 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="text-xs font-medium uppercase tracking-wide text-green-600">
                Wadzzo Balance
              </div>
              <div className="text-lg font-bold text-green-700">
                {formatBalance(platformAssetBalance)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <NavLinks />

      {/* User Profile */}
      <div className="border-t border-gray-100 p-2">
        <div className="flex w-full items-center gap-3 px-3 py-2.5">
          <div className="w-full overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {session.status === "authenticated" && <LogOutButton />}
          </div>
        </div>

        <div className="mt-2 space-y-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Link href="/settings">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-600"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function LogOutButton() {
  const session = useSession();

  const truncateId = (id: string) => {
    if (id.length <= 12) return id;
    return `${id.slice(0, 6)}...${id.slice(-6)}`;
  };

  async function disconnectWallet() {
    await signOut({
      redirect: false,
    });
  }

  return (
    <div className="group/logout flex w-full items-center justify-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50">
      <div className="flex-shrink-0">
        {session.data?.user?.image ? (
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={session.data.user.image ?? "/placeholder.svg"}
              alt="User Avatar"
            />
            <AvatarFallback>
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className="min-w-0 flex-1 text-left opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        {session.data?.user?.name && (
          <div className="truncate text-sm font-medium text-foreground">
            {session.data.user.name}
          </div>
        )}
        {session.data?.user?.id && (
          <div className="font-mono text-xs text-muted-foreground">
            {truncateId(session.data.user.id)}
          </div>
        )}
      </div>

      <Button onClick={disconnectWallet} variant="destructive" size="sm">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
