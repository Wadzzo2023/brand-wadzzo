import Image from "next/image"
import { Award, Trophy, User, Users } from "lucide-react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Badge } from "~/components/shadcn/ui/badge"
import type { BountyTypes } from "~/types/bounty/bounty-type"
import { PLATFORM_ASSET } from "~/lib/stellar/constant"
import { Button } from "~/components/shadcn/ui/button"
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances"
import { api } from "~/utils/api"
import { addrShort } from "~/utils/utils"

import { Preview } from "../common/quill-preview"
import { useRouter } from "next/navigation"
import { toast } from "../shadcn/ui/use-toast"
import { Spinner } from "../shadcn/ui/spinner"

function SafeHTML({
    html,
}: {
    html: string
}) {
    return (
        <Preview

            value={html}
        />
    )
}

export default function BountyList({
    bounties,
}: {
    bounties: BountyTypes[]
}) {
    const router = useRouter()
    const { platformAssetBalance } = useUserStellarAcc();

    const isEligible = (bounty: BountyTypes) => {
        return bounty.currentWinnerCount < bounty.totalWinner && bounty.requiredBalance <= platformAssetBalance
    }
    const joinBountyMutation = api.bounty.Bounty.joinBounty.useMutation({
        onSuccess: async (data, variables) => {
            toast({
                title: "Success",
                description: "You have successfully joined the bounty",

            })
            router.push(`/bounties/${variables?.BountyId}`)

        },
    });
    const handleJoinBounty = (id: number) => {
        joinBountyMutation.mutate({ BountyId: id });
    };
    if (bounties.length === 0) {
        return <div className="text-center text-xl flex h-full w-full items-center justify-center">No bounties found</div>
    }

    return (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {bounties.map((bounty) => (
                <Card
                    key={bounty.id}
                    className="flex h-full flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer    overflow-hidden justify-between"

                >
                    <CardHeader className="relative p-0">
                        <Image
                            src={bounty.imageUrls[0] ?? "/images/loading.png"}
                            alt={bounty.title}
                            width={400}
                            height={200}
                            className="h-48 w-full object-cover"
                        />
                        <div className="absolute top-0 right-0 m-4">
                            <Badge variant="secondary" className="bg-primary ">
                                ${bounty.priceInUSD}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col p-6">
                        <CardTitle className="mb-3 text-xl font-bold">{bounty.title}</CardTitle>
                        <div className="mb-4  min-h-[100px] max-h-[100px] line-clamp-3 overflow-y-auto scrollbar-hide">
                            <SafeHTML html={bounty.description} />
                        </div>
                        <div className="flex items-center gap-4 text-sm ">
                            <div className="flex items-center">
                                <Users className="mr-1 h-4 w-4" />
                                <span>{bounty._count.participants} participants</span>
                            </div>
                            <div className="flex items-center">
                                <Trophy className="mr-1 h-4 w-4" />
                                <span>{bounty.totalWinner - bounty.currentWinnerCount} spots left</span>
                            </div>
                            <div className="flex items-center">
                                <User className="mr-1 h-4 w-4" />
                                <span>{addrShort(bounty.creatorId, 4)}</span>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-secondary p-4 flex flex-col items-center ">
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className="flex items-center text-sm">
                                <Award className="mr-1 inline-block h-4 w-4" />
                                <span className="font-semibold">
                                    {bounty.priceInBand.toFixed(2)} {PLATFORM_ASSET.code.toLocaleUpperCase()}
                                </span>
                            </div>
                            <Badge
                                className="shadow-sm shadow-black rounded-sm"
                                variant={bounty.currentWinnerCount === bounty.totalWinner ? "destructive" : "default"}
                            >
                                {bounty.currentWinnerCount === bounty.totalWinner ? "Completed" : "Active"}
                            </Badge>
                        </div>
                        {bounty.isJoined || bounty.isOwner ? (
                            <Button

                                onClick={() => {
                                    router.push(`/bounties/${bounty.id}`)
                                }}
                                variant="default" className="w-full mt-2 shadow-sm shadow-foreground">
                                View
                            </Button>
                        ) : (
                            <Button variant="default"

                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleJoinBounty(bounty.id)
                                }}
                                className="w-full mt-2 shadow-sm shadow-foreground" disabled={!isEligible(bounty)}>
                                {joinBountyMutation.isLoading
                                    && bounty.id === joinBountyMutation.variables?.BountyId
                                    ? <span className="flex items-center justify-center gap-2">
                                        <Spinner size='small' className="text-black" />
                                        Joining...
                                    </span> : "Join"}
                            </Button>
                        )}
                        {!isEligible(bounty) ? (
                            <p className="text-xs text-red-500 mt-2">
                                {bounty.currentWinnerCount >= bounty.totalWinner ? "No spots left" : `${bounty.requiredBalance.toFixed(1)} ${PLATFORM_ASSET.code.toLocaleUpperCase()} required`}
                            </p>
                        ) :
                            <p className="text-xs text-green-500 mt-2">
                                {bounty.currentWinnerCount >= bounty.totalWinner ? "No spots left" :

                                    bounty.isOwner ? "You are the owner" : bounty.isJoined ? "You have already joined" : "You are eligible to join"
                                }
                            </p>

                        }
                    </CardFooter>
                </Card>
            ))}
        </div>
    )
}

