"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Badge } from "~/components/shadcn/ui/badge"
import { Card, CardContent } from "~/components/shadcn/ui/card"
import { Pin, Gem, Star } from 'lucide-react'
import { addrShort } from "~/utils/utils"
import { PLATFORM_ASSET } from "~/lib/stellar/constant"
import { motion } from "framer-motion"

interface AssetViewProps {
    creatorId?: string | null
    code?: string
    thumbnail: string | null
    isNFT?: boolean
    isPinned?: boolean
    price?: number
    mediaType?: string
    isPageAsset?: boolean
}

export default function AssetView({ code, thumbnail, isNFT = true, isPinned = false, creatorId, price, mediaType, isPageAsset }: AssetViewProps) {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        setIsVisible(true)
    }, [])

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="h-full"
        >
            <Card className="rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full">
                {/* Concert image */}
                <CardContent className="p-2 min-h-full max-h-full">
                    <div className="relative overflow-hidden rounded-md group">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                        <Image
                            src={thumbnail ?? "/images/logo.png"}
                            alt="Concert stage with lights"
                            height={192}
                            width={192}
                            className="object-cover rounded-md h-48 w-full transition-transform duration-500 group-hover:scale-105"
                        />
                        {isNFT && (
                            <div className="absolute top-2 right-2 z-20">
                                <motion.div
                                    animate={{
                                        boxShadow: ["0 0 0 rgba(255, 215, 0, 0)", "0 0 15px rgba(255, 215, 0, 0.7)", "0 0 0 rgba(255, 215, 0, 0)"]
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        repeatType: "loop"
                                    }}
                                >
                                    <Badge variant="secondary" className="bg-black/50 backdrop-blur-sm text-white border border-yellow-400">
                                        <Gem className="w-3 h-3 mr-1 text-yellow-400" /> NFT
                                    </Badge>
                                </motion.div>
                            </div>
                        )}
                    </div>

                    {/* Card content */}
                    <div className="p-4">
                        {/* Title section */}
                        <div className="mb-3">
                            <div className="flex items-center text-gray-500 text-sm mb-1">
                                {creatorId ? addrShort(creatorId, 5) : "Admin"}
                                <motion.div
                                    animate={{ rotate: [0, 15, 0, -15, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                                >
                                    <Star className="w-4 h-4 ml-1 fill-yellow-400 text-yellow-400" />
                                </motion.div>
                            </div>
                            <h2 className="text-xl font-bold truncate">{code}</h2>
                        </div>

                        {/* Info section */}
                        <div className="flex items-center gap-2 rounded-lg bg-primary shadow-sm shadow-secondary relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-secondary/10 to-transparent -translate-x-full animate-shimmer"></div>
                            <div className="p-3 relative z-10">
                                <div className="text-xs text-muted-foreground">Asset Type</div>
                                <div className="font-medium flex items-center">
                                    {isNFT ? (
                                        <>
                                            <span>NFT</span>
                                            <motion.div
                                                animate={{ scale: [1, 1.2, 1] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="ml-1"
                                            >
                                                <Gem className="w-3 h-3 text-yellow-400" />
                                            </motion.div>
                                        </>
                                    ) : (
                                        <>
                                            <span>PIN</span>
                                            <Pin className="w-3 h-3 ml-1" />
                                        </>
                                    )}
                                </div>
                            </div>
                            {price ? (
                                <div className="p-3 relative z-10">
                                    <div className="text-xs text-muted-foreground">Price</div>
                                    <div className="font-medium">
                                        {price + `  ${PLATFORM_ASSET.code.toLocaleUpperCase()}`}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 relative z-10">
                                    <div className="text-xs text-muted-foreground">Media Type</div>
                                    <div className="font-medium">
                                        {isPageAsset ? "Page Asset" : mediaType}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
