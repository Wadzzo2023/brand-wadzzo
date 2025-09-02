"use client"

import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Badge } from "~/components/shadcn/ui/badge"

// import { api } from "~/utils/api"

import { CircleDollarSign, Crown, Star, Zap } from "lucide-react"

import clsx from "clsx"
import AddTierModal from "~/components/modals/add-tier-modal"
import EditTierModal from "~/components/modals/edit-tier-modal"
import { Preview } from "~/components/common/quill-preview"
import Loading from "~/components/common/loading"
import { api } from "~/utils/api"
import { Subscription } from "@prisma/client"

export type SubscriptionType = Omit<Subscription, "issuerPrivate">;

export { MemberShip }
export default function MemberShip() {
    const { data: subscriptions } = api.fan.member.getAllMembership.useQuery();
    const creator = api.fan.creator.meCreator.useQuery(undefined, {
        refetchOnWindowFocus: false,
    })
    const pageAsset = api.fan.creator.getCreatorPageAsset.useQuery();



    return (
        <div className="container mx-auto px-4 py-8">
            <div className="text-center mb-12">
                <h1 className="text-3xl font-bold tracking-tight mb-4">Subscription Tiers</h1>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                    Choose the perfect tier that fits your needs and unlock exclusive content and features.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto">
                {subscriptions
                    ?.sort((a, b) => a.price - b.price)
                    .map((subscription, index) => {
                        const pageCode = pageAsset?.data?.code
                        return (
                            <MemberShipCard
                                key={subscription.id}
                                creator={creator.data}
                                subscription={subscription}
                                pageAsset={pageCode}
                                priority={index}
                            />
                        )
                    })}
            </div>

            {subscriptions && subscriptions?.length < 3 && pageAsset && (
                <div className="fixed bottom-6 right-6 z-50">
                    <AddTierModal />
                </div>
            )}
        </div>
    )
}

function MemberShipCard({
    creator,
    subscription,
    className,
    children,
    priority,
    pageAsset,
}: {
    creator?: {
        name: string
        id: string
    } | null
    subscription: SubscriptionType
    className?: string
    children?: React.ReactNode
    priority?: number
    pageAsset?: string
}) {
    const getTierIcon = (index: number) => {
        switch (index) {
            case 0:
                return <Star className="h-6 w-6 text-amber-500" />
            case 1:
                return <Crown className="h-6 w-6 text-purple-500" />
            case 2:
                return <Zap className="h-6 w-6 text-blue-500" />
            default:
                return <CircleDollarSign className="h-6 w-6 text-green-500" />
        }
    }

    const getTierBadge = (index: number) => {
        switch (index) {
            case 0:
                return (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
                        Basic
                    </Badge>
                )
            case 1:
                return (
                    <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200">
                        Popular
                    </Badge>
                )
            case 2:
                return (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
                        Premium
                    </Badge>
                )
            default:
                return null
        }
    }

    return (
        <Card
            className={clsx(
                "relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
                priority === 1 && "ring-2 ring-purple-200 shadow-lg scale-105", // Highlight middle tier
                className,
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-background to-muted/20" />

            <CardHeader className="relative">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            {getTierIcon(priority ?? 0)}
                            <CardTitle className="text-2xl font-bold">{subscription.name}</CardTitle>
                        </div>
                        {getTierBadge(priority ?? 0)}
                    </div>
                    <EditTierModal item={subscription} />
                </div>

                <div className="pt-4">
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">{subscription.price}</span>
                        <span className="text-lg font-medium text-muted-foreground">{pageAsset}</span>
                    </div>
                    <CardDescription className="text-sm">Required to access this tier</CardDescription>
                </div>
            </CardHeader>

            {children}

            <CardContent className="relative space-y-4">
                <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <div className="h-1 w-6 bg-gradient-to-r from-primary to-primary/60 rounded-full" />
                        Features & Benefits
                    </h4>

                    <div className="space-y-3">
                        <div className="prose prose-sm max-w-none">
                            <Preview value={subscription.features} />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
