"use client";

import { ArrowLeftRight, LogOut, Settings, Shield, Sparkles, User, Wallet } from "lucide-react";
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
import { useRouter } from "next/router";

export function Navigation() {
  const session = useSession()
  const router = useRouter()
  const { pathname } = router;
  const { setBalance, setActive, active, platformAssetBalance } = useUserStellarAcc()

  const admin = api.wallate.admin.checkAdmin.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  const creatorPermission = api.fan.creator.getPermissionData.useQuery()

  const isAdminMode = pathname.startsWith("/admin")

  const balances = api.wallate.acc.getAccountBalance.useQuery(undefined, {
    onSuccess: (data) => {
      const { balances } = data
      setBalance(balances)
      setActive(true)
    },
    onError: (error) => {
      setActive(false)
    },
  })

  const formatBalance = (balance: number | undefined) => {
    if (balance === undefined || balance === null) return "0.00"
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(balance)
  }

  const handleModeSwitch = () => {
    if (isAdminMode) {
      router.push("/map")
    } else {
      router.push("/admin/maps")
    }
  }

  return (
    <div className="group z-30 flex h-screen w-[72px] flex-col border-r border-border/40 bg-gradient-to-b from-background via-background to-muted/20 shadow-xl transition-all duration-300 ease-out hover:w-72">
      {/* Logo Section */}
      <div
        className="cursor-pointer p-4 transition-colors hover:bg-muted/50"
        onClick={() => (window.location.href = isAdminMode ? "/admin/maps" : "/map")}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-primary/20">
            <Image src="/images/loading.png" alt="Logo" width={100} height={100} className="h-7 w-7 object-contain" />
          </div>
          <div className="overflow-hidden opacity-0 transition-all duration-300 group-hover:opacity-100">
            <div className="flex items-center gap-2">
              <h1 className="whitespace-nowrap text-xl font-bold tracking-tight text-foreground">Wadzzo</h1>
              {isAdminMode && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  <Shield className="h-3 w-3" />
                  Admin
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{isAdminMode ? "Admin Dashboard" : "Explore & Discover"}</p>
          </div>
        </div>
      </div>

      {/* Balance Card - only show in user mode */}
      {!isAdminMode && session.status === "authenticated" && active && (
        <div className="px-3 pb-2">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 p-3 shadow-lg shadow-emerald-500/20">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/10 blur-xl" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-white/80">
                  <Sparkles className="h-3 w-3" />
                  Balance
                </div>
                <div className="text-xl font-bold text-white">{formatBalance(platformAssetBalance)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <NavLinks isAdminMode={isAdminMode} creatorPermission={!!creatorPermission.data} />

      {/* Bottom Section */}
      <div className="mt-auto border-t border-border/40 p-3">
        {/* Admin Switch Button */}
        {admin.data && session.status === "authenticated" && (
          <div className="mb-3">
            <Button
              variant={isAdminMode ? "outline" : "default"}
              size="sm"
              className={`w-full justify-center gap-2 transition-all group-hover:justify-start ${isAdminMode
                ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                : "bg-gradient-to-r from-primary to-primary/80 shadow-md shadow-primary/25"
                }`}
              onClick={handleModeSwitch}
            >
              <ArrowLeftRight className="h-4 w-4 flex-shrink-0" />
              <span className="hidden whitespace-nowrap group-hover:inline uppercase">
                {isAdminMode ? "Switch to User" : "Switch to Admin"}
              </span>
            </Button>
          </div>
        )}

        {/* User Profile */}
        {session.status === "authenticated" && <UserProfile />}

        {/* Settings Link */}
        <Link href="/settings" className="mt-2 block">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Settings className="h-5 w-5 flex-shrink-0" />
            <span className="whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              Settings
            </span>
          </div>
        </Link>
      </div>
    </div>
  )
}

function UserProfile() {
  const session = useSession()
  const creator = api.fan.creator.meCreator.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const truncateId = (id: string) => {
    if (id.length <= 12) return id
    return `${id.slice(0, 6)}...${id.slice(-6)}`
  }

  async function disconnectWallet() {
    await signOut({
      redirect: false,
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-2 transition-colors hover:bg-muted">
      <div className="flex-shrink-0">
        {session.data?.user?.image ? (
          <Avatar className="h-9 w-9 ring-2 ring-background">
            <AvatarImage src={creator.data?.profileUrl ?? session.data.user.image ?? "/placeholder.svg"} alt="User Avatar" />
            <AvatarFallback className="bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-9 w-9 ring-2 ring-background">
            <AvatarFallback className="bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className="min-w-0 flex-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        {(creator.data?.name ?? session.data?.user?.name) && (
          <div className="truncate text-sm font-semibold text-foreground">{creator.data?.name ?? session.data?.user?.name}</div>
        )}
        {creator.data?.id && (
          <div className="truncate font-mono text-[10px] text-muted-foreground">{truncateId(creator.data.id)}</div>
        )}
      </div>

      <Button
        onClick={disconnectWallet}
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  )
}
