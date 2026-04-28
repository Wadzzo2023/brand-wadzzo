"use client"

import { ArrowLeftRight, LogOut, Settings, Shield, Sparkles, User, Wallet } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/shadcn/ui/avatar"
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances"
import { api } from "~/utils/api"
import { NavLinks } from "./navlinks"
import { useRouter } from "next/router"

export function Navigation() {
  const session = useSession()
  const router = useRouter()
  const { pathname } = router
  const { setBalance, setActive, active, platformAssetBalance } = useUserStellarAcc()
  const [forceOpen, setForceOpen] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setForceOpen(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  const admin = api.wallate.admin.checkAdmin.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  const creatorPermission = api.fan.creator.getPermissionData.useQuery()
  const isAdminMode = pathname.startsWith("/admin")

  api.wallate.acc.getAccountBalance.useQuery(undefined, {
    onSuccess: (data) => {
      setBalance(data.balances)
      setActive(true)
    },
    onError: () => setActive(false),
  })

  const formatBalance = (balance: number | undefined) => {
    if (balance === undefined || balance === null) return "0.00"
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(balance)
  }

  const handleModeSwitch = () => {
    router.push(isAdminMode ? "/map" : "/admin/maps")
  }

  return (
    <div
      className={`group z-30 flex h-screen flex-col border-r border-border/40 bg-gradient-to-b from-background via-background to-muted/20 shadow-xl transition-all duration-300 ease-out ${forceOpen ? "w-72" : "w-[72px] hover:w-72"
        }`}
    >
      {/* ── LOGO ── */}
      <div
        className="cursor-pointer px-3 py-4 transition-colors hover:bg-muted/50"
        onClick={() => (window.location.href = isAdminMode ? "/admin/maps" : "/map")}
      >
        {/* Same flex h-10 items-center gap-3 px-0 pattern as every row */}
        <div className="flex h-10 items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-primary/20">
            <img src="/images/loading.png" alt="Logo" className="h-6 w-6 object-contain" />
          </div>
          <div className={`overflow-hidden transition-opacity duration-300 ${forceOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
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

      {/* ── BALANCE CARD ── sits in the same column grid as nav items */}
      {!isAdminMode && session.status === "authenticated" && active && (
        <div className="px-3 pb-2">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/10 blur-xl" />
            {/* h-10 + px-3 = same icon column as nav rows */}
            <div className="relative flex h-10 items-center gap-3 px-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <div className={`flex flex-1 items-center gap-1.5 overflow-hidden transition-opacity duration-300 ${forceOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                <span className="whitespace-nowrap text-sm font-bold text-white">{formatBalance(platformAssetBalance)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NAV LINKS ── */}
      <NavLinks
        isAdminMode={isAdminMode}
        creatorPermission={!!creatorPermission.data}
        forceOpen={forceOpen}
      />

      {/* ── BOTTOM ACTIONS ── every row: h-10 items-center gap-3 px-3 rounded-xl */}
      <div className="mt-auto border-t border-border/40 px-3 py-3 space-y-1">

        {/* Mode Switch */}
        {admin.data && session.status === "authenticated" && (
          <button
            onClick={handleModeSwitch}
            className={`flex h-10 w-full items-center gap-3 rounded-xl px-2 transition-all ${isAdminMode
              ? "bg-primary/10 text-primary hover:bg-primary/20"
              : "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
              }`}
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <span className={`whitespace-nowrap text-xs font-semibold uppercase tracking-wide transition-opacity duration-300 ${forceOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              {isAdminMode ? "Switch to User" : "Switch to Admin"}
            </span>
          </button>
        )}

        {/* Settings */}
        <Link href="/settings">
          <div className="flex h-10 items-center gap-3 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Settings className="h-4 w-4" />
            </div>
            <span className={`whitespace-nowrap text-sm font-medium transition-opacity duration-300 ${forceOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              Settings
            </span>
          </div>
        </Link>

        {/* User Profile */}
        {session.status === "authenticated" && <UserProfile forceOpen={forceOpen} />}
      </div>
    </div>
  )
}

function UserProfile({ forceOpen }: { forceOpen: boolean }) {
  const session = useSession()
  const creator = api.fan.creator.meCreator.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  return (
    /* Same h-10 items-center gap-3 px-3 rounded-xl pattern */
    <div className="flex h-10 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-muted">
      {/* Avatar inside h-8 w-8 icon cell — aligns with all other icons */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
        <Avatar className="h-8 w-8 ring-2 ring-background">
          <AvatarImage
            src={creator.data?.profileUrl ?? session.data?.user?.image ?? "/placeholder.svg"}
            alt="User Avatar"
          />
          <AvatarFallback className="bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </AvatarFallback>
        </Avatar>
      </div>

      <div className={`min-w-0 flex-1 overflow-hidden transition-opacity duration-300 ${forceOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        {(creator.data?.name ?? session.data?.user?.name) && (
          <div className="truncate text-sm font-semibold text-foreground">
            {creator.data?.name ?? session.data?.user?.name}
          </div>
        )}
        {creator.data?.id && (
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {creator.data.id.slice(0, 6)}...{creator.data.id.slice(-6)}
          </div>
        )}
      </div>

      <button
        onClick={() => signOut({ redirect: false })}
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive ${forceOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}