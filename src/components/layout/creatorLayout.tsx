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
import Image from "next/image"

export default function CreatorLayout({
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

  const creator = api.fan.creator.meCreator.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  const acc = api.wallate.acc.getCreatorStorageBallances.useQuery(undefined, {
    onSuccess: (data) => {
      // console.log(data);
      setBalance(data)
    },
    onError: (error) => {
      console.log(error)
    },
    refetchOnWindowFocus: false,
  })
  console.log("creator.data", creator.data)



  return (
    <div className="relative  ">
      <div className="flex gap-4">

        <>
          <motion.div
            className="flex w-full overflow-y-auto   "
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Special case for the create page */}
            {path === "/create" ? (
              <div className="flex h-screen overflow-y-auto w-full flex-col">{children}</div>
            ) : creator.isLoading ? (
              <div className="flex h-full w-full items-center justify-center">
                <JoinArtistPageLoading />
              </div>
            ) : creator.data?.id && creator.data?.approved === true ? (
              <div className="flex overflow-y-auto  w-full flex-col ">{children}</div>
            ) : creator.data?.aprovalSend && creator.data?.approved === null ? (
              <div className="flex h-full w-full items-center justify-center">
                <PendingArtistPage createdAt={creator.data?.createdAt} />
              </div>
            ) : creator.data?.aprovalSend && creator.data?.approved === false ? (
              <div className="flex h-full w-full items-center justify-center">
                <BannedCreatorCard creatorName={creator.data.name} />
              </div>
            ) : (
              !creator.data && (
                <div className="flex h-full w-full items-center justify-center">
                  <JoinArtistPage />
                </div>
              )
            )}
          </motion.div>


        </>

      </div>

    </div>
  )
}

