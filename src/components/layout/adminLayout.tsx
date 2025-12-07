"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "~/lib/utils"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "~/components/shadcn/ui/button"
import { api } from "~/utils/api"
import { usePathname, useRouter } from "next/navigation"

import Link from "next/link"
import { useToast } from "~/components/shadcn/ui/use-toast"

import { Card, CardContent, CardHeader } from "~/components/shadcn/ui/card"
import JoinArtistPage from "~/components/brand/join-artist"
import JoinArtistPageLoading from "~/components/loading/join-artist-loading"
import PendingArtistPage from "~/components/brand/pending-artist"
import { BannedCreatorCard } from "~/components/brand/ban-artist"
import { useCreatorStorageAcc } from "~/lib/state/wallete/stellar-balances"
import Loading from "../common/loading"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    const router = useRouter()
    const toast = useToast()
    const [cursorVariant, setCursorVariant] = useState("default")
    const { setBalance } = useCreatorStorageAcc()
    const path = usePathname()
    const toggleExpand = () => {
        setIsExpanded(!isExpanded)
    }
    const admin = api.wallate.admin.checkAdmin.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });



    return (
        <div className="flex relative gap-4 h-[100vh] overflow-hidden">
            <motion.div
                className="flex-grow overflow-y-auto scrollbar-hide"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {
                    admin.isLoading ? (
                        <Loading />
                    ) :
                        admin.data?.id ? (
                            <div className="flex flex-col w-full h-full overflow-hidden">
                                {children}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center w-full h-full">
                                <h1 className="text-3xl font-bold">You are not authorized to view this page</h1>
                            </div>
                        )
                }
            </motion.div>

        </div>
    )
}

