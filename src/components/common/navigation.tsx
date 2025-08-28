"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Map, FileText, Target, Gift, BarChart3, Settings, LogOut, Store, User, Wallet } from "lucide-react"
import { Button } from "~/components/shadcn/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/shadcn/ui/avatar"
import { Badge } from "~/components/shadcn/ui/badge"
import Image from "next/image"
import { signOut, useSession } from "next-auth/react"
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances"
import { api } from "~/utils/api"

const navItems = [
    { href: "/map", label: "Map", icon: Map },
    { href: "/stores", label: "Stores", icon: Store },
    { href: "/posts", label: "Posts", icon: FileText },
    { href: "/bounties", label: "Bounties", icon: Target, badge: "8" },
    { href: "/gifts", label: "Gifts", icon: Gift },
    { href: "/report", label: "Report & Analytics", icon: BarChart3 },
]

export function Navigation() {
    const pathname = usePathname()
    const session = useSession()
    const { setBalance, setActive, active, platformAssetBalance } = useUserStellarAcc()
    const balances = api.wallate.acc.getAccountBalance.useQuery(undefined, {
        onSuccess: (data) => {
            const { balances, platformAssetBal, xlm } = data
            setBalance(balances)
            setActive(true)
        },
        onError: (error) => {
            // toast.error(error.message);
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

    return (
        <div className="w-16 hover:w-64 transition-all duration-300 bg-primary/10 border-r border-gray-100 h-screen flex flex-col group shadow-sm z-30">
            {/* Logo */}
            <div className="p-4 border-b border-gray-100" onClick={() => (window.location.href = "/map")}>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Image
                            src="/images/loading.png"
                            alt="Logo"
                            width={100}
                            height={100}
                            className="h-full w-full object-cover"
                        />
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden">
                        <h1 className="text-lg font-semibold text-gray-900 whitespace-nowrap">Wadzzo</h1>
                    </div>
                </div>
            </div>

            {session.status === "authenticated" && active && (
                <div className="p-2 border-b border-gray-100">
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                <Wallet className="w-4 h-4 text-green-600" />
                            </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden flex-1">
                            <div className="text-xs text-green-600 font-medium uppercase tracking-wide">Wadzzo Balance</div>
                            <div className="text-lg font-bold text-green-700">{formatBalance(platformAssetBalance)}</div>
                        </div>

                    </div>
                </div>
            )}

            {/* Navigation Links */}
            <nav className="flex-1 p-2">
                <div className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href
                        return (
                            <Link key={item.href} href={item.href}>
                                <div
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative ${isActive ? "bg-primary text-white" : "hover:bg-secondary"
                                        }`}
                                >
                                    <item.icon className="w-5 h-5 flex-shrink-0" />
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                                        {item.label}
                                    </span>

                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r"></div>
                                    )}
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </nav>

            {/* User Profile */}
            <div className="p-2 border-t border-gray-100">
                <div className="flex items-center gap-3 px-3 py-2.5 w-full">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden w-full">
                        {session.status === "authenticated" && <LogOutButton />}
                    </div>
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 space-y-1 mt-2">
                    <Link href="/settings">
                        <Button variant="ghost" size="sm" className="w-full justify-start text-gray-600">
                            <Settings className="w-4 h-4 mr-2" />
                            Settings
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

function LogOutButton() {
    const session = useSession()

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
        <div className="flex items-center justify-start gap-3 p-3 w-full rounded-lg hover:bg-accent/50 transition-colors group/logout">
            <div className="flex-shrink-0">
                {session.data?.user?.image ? (
                    <Avatar className="w-8 h-8">
                        <AvatarImage src={session.data.user.image ?? "/placeholder.svg"} alt="User Avatar" />
                        <AvatarFallback>
                            <User className="w-4 h-4" />
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-muted">
                            <User className="w-4 h-4 text-muted-foreground" />
                        </AvatarFallback>
                    </Avatar>
                )}
            </div>

            <div className="flex-1 min-w-0 text-left opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                {session.data?.user?.name && (
                    <div className="font-medium text-foreground text-sm truncate">{session.data.user.name}</div>
                )}
                {session.data?.user?.id && (
                    <div className="text-xs text-muted-foreground font-mono">{truncateId(session.data.user.id)}</div>
                )}
            </div>

            <Button onClick={disconnectWallet} variant="destructive" size="sm">
                <LogOut className="w-4 h-4" />
            </Button>
        </div>
    )
}
