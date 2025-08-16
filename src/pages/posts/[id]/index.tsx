"use client"

import { useState, useRef, useEffect } from "react"
import { MoreHorizontal, ChevronUp, ChevronDown, Copy, Heart, Share2 } from "lucide-react"
import { Button } from "~/components/shadcn/ui/button"
import { useRouter } from "next/router"

import { motion } from "framer-motion"
import { AddPostComment } from "~/components/post/comment/add-post-comment"
import { SinglePostCommentSection } from "~/components/post/comment/single-post-comment-section"
import { api } from "~/utils/api"
import { Card, CardContent, CardHeader } from "~/components/shadcn/ui/card"
import { Skeleton } from "~/components/shadcn/ui/skeleton"
import type { Media, Post } from "@prisma/client"
import { getAssetBalanceFromBalance } from "~/lib/stellar/marketplace/test/acc"
import { useSession } from "next-auth/react"
import MediaGallery from "~/components/post/media-gallary"
import CustomAvatar from "~/components/common/custom-avatar"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/shadcn/ui/dropdown-menu"
import { toast } from "~/components/shadcn/ui/use-toast"
// Format the timestamp
const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60))
        if (diffHours === 0) {
            const diffMinutes = Math.floor(diffTime / (1000 * 60))
            return `${diffMinutes}m ago`
        }
        return `${diffHours}h ago`
    } else if (diffDays < 7) {
        return `${diffDays}d ago`
    } else {
        return date.toLocaleDateString()
    }
}
// Media type definition
type MediaType = "IMAGE" | "VIDEO" | "MUSIC"

interface MediaItem {
    id: number
    url: string
    type: MediaType
    title?: string | null
}

interface Comment {
    id: number
    username: string
    userAvatar?: string
    text: string
    timestamp: string
    likes?: number
    isLiked?: boolean
}

interface InstagramSinglePostProps {
    postId: string
    username: string
    userAvatar?: string
    isVerified?: boolean
    caption: string
    timestamp: string
    media: MediaItem[]
    likes: number
    isLiked?: boolean
    isSaved?: boolean
    comments: Comment[]
}

function SinglePostPage() {
    const router = useRouter()

    const postId = router.query?.id

    if (typeof postId == "string") {
        return <PostViewCheck postId={postId} />
    }
}

const PostViewCheck = ({ postId }: { postId: string }) => {
    const session = useSession()
    const router = useRouter()
    const { data, error, isLoading } = api.fan.post.getAPost.useQuery(Number(postId), {
        refetchOnWindowFocus: false,
        enabled: !!postId,
    })
    const accBalances = api.wallate.acc.getUserPubAssetBallances.useQuery(undefined, {
        enabled: !!session.data?.user?.id,
    })

    const locked = !!data

    // Determine if user has access to this content
    let hasAccess = !locked // Public posts are always accessible

    if (locked && data.subscription) {
        let pageAssetCode: string | undefined
        let pageAssetIssuer: string | undefined

        const customPageAsset = data.creator.customPageAssetCodeIssuer
        const pageAsset = data.creator.pageAsset

        if (pageAsset) {
            pageAssetCode = pageAsset.code
            pageAssetIssuer = pageAsset.issuer
        } else if (customPageAsset) {
            const [code, issuer] = customPageAsset.split("-")
            pageAssetCode = code
            pageAssetIssuer = issuer
        }

        const bal = getAssetBalanceFromBalance({
            balances: accBalances.data,
            code: pageAssetCode,
            issuer: pageAssetIssuer,
        })

        hasAccess = data.subscription.price <= (bal || 0) || data.creatorId === session.data?.user?.id
    }
    console.log("data", data)

    if (isLoading) {
        return <SinglePostSkeleton />
    }

    if (data) {
        return (
            <SinglePostView
                key={data.id}
                post={data}
                creator={data.creator}
                likeCount={data._count.likes}
                commentCount={data._count.comments}
                locked={locked}
                show={hasAccess}
                media={data.medias}

            />
        )
    }
    else if (error ?? !data) {
        return (
            <Card className="w-full max-w-2xl mx-auto mt-8 ">
                <CardHeader></CardHeader>
                <CardContent className="flex flex-col space-y-4 items-center">
                    <div className=" w-full flex items-center justify-center bg-background">
                        <div className="max-w-md w-full p-6 text-center">
                            <h1 className="text-4xl font-bold mb-2">Oops!</h1>
                            <div className="text-4xl font-mono mb-8 whitespace-pre">{`(╯°□°)╯︵ ┻━┻`}</div>
                            <h2 className="text-xl mb-2">Error 404: Post Not Found.</h2>
                            <p className="text-muted-foreground mb-8">We couldn{"'"}t find a Post with this URL.</p>
                            <div className="flex gap-4 justify-center">
                                <Button variant="outline" onClick={() => router.push("/artist/home")}>
                                    Go Feed
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }
}

interface PostCardProps {
    post: Post & {
        medias: Media[]
        subscription?: {
            price: number
            id?: number
            name?: string
        } | null
        creator: {
            id: string
            name: string
            profileUrl: string | null
            pageAsset?: {
                code: string
                issuer: string
            } | null
            customPageAssetCodeIssuer?: string | null
        }
    }
    creator: {
        id: string
        name: string
        profileUrl: string | null
        pageAsset?: {
            code: string
            issuer: string
        } | null
        customPageAssetCodeIssuer?: string | null
    }
    likeCount: number
    commentCount: number
    locked: boolean
    show: boolean
    media: Media[]

}
const SinglePostView = ({
    post,
    creator,
    likeCount: initialLikeCount,
    commentCount,
    locked,
    show,
    media,

}: PostCardProps) => {
    const [showAllMedia, setShowAllMedia] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [likeCount, setLikeCount] = useState(initialLikeCount)
    const [isSaved, setIsSaved] = useState(false)
    const { data: liked } = api.fan.post.isLiked.useQuery(post.id);

    const likeMutation = api.fan.post.likeApost.useMutation({
        onSuccess: () => {
            setLikeCount((prev) => prev + 1)
        },

    })

    const unlikeMutation = api.fan.post.unLike.useMutation({
        onSuccess: () => {
            setLikeCount((prev) => Math.max(0, prev - 1))
        },

    })

    const commentInputRef = useRef<HTMLInputElement>(null)

    const [currentIndex, setCurrentIndex] = useState(0)

    // Handle next/previous media
    const handleNext = () => {
        if (media && currentIndex < media.length - 1) {
            setCurrentIndex(currentIndex + 1)
        }
    }

    const handlePrev = () => {
        if (media && currentIndex > 0) {
            setCurrentIndex(currentIndex - 1)
        }
    }

    // Focus comment input
    const focusCommentInput = () => {
        if (commentInputRef.current) {
            commentInputRef.current.focus()
        }
    }

    const toggleShowAllMedia = () => {
        setShowAllMedia(!showAllMedia)
    }

    const handleCloseFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch((err) => {
                console.error(`Error attempting to exit fullscreen: ${err instanceof Error ? err.message : String(err)}`)
            })
        }
        setIsFullscreen(false)
    }

    const toggleLike = () => {
        if (liked) {
            unlikeMutation.mutate(post.id)
        } else {
            likeMutation.mutate(post.id)
        }
    }

    const handleShare = async () => {
        try {
            if (navigator.share) {
                await navigator.share({
                    title: post?.heading || "Check out this post",
                    text: post?.content || "I found this interesting post",
                    url: window.location.href,
                })
            } else {
                // Fallback for browsers that don't support navigator.share
                await navigator.clipboard.writeText(window.location.href)
                toast({
                    title: "Link copied",
                    description: "Post link copied to clipboard",
                })
            }
        } catch (error) {
            console.error("Error sharing:", error)
        }
    }

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            toast({
                title: "Link copied",
                description: "Post link copied to clipboard",
            })
        } catch (error) {
            console.error("Error copying link:", error)
            toast({
                title: "Error",
                description: "Failed to copy link",
                variant: "destructive",
            })
        }
    }

    const displayMedia = showAllMedia ? media : media?.slice(0, 3)
    const hasLotsOfMedia = media && media.length > 3


    if (!creator) {
        return <div className="flex items-center justify-center">No creator found</div>
    }

    return (
        <div className="flex items-center justify-center  w-full ">
            <div className="w-full md:max-w-6xl gap-4 md:max-h-[90vh]  flex flex-col  justify-center md:flex-row">
                {/* Media section */}
                <div className="relative bg-gray-100 flex-1 md:max-w-[600px]">
                    {media && media.length > 0 ? (
                        <div className="h-full w-full p-2">
                            <MediaGallery
                                fullHeight={true}
                                media={displayMedia}
                                initialIndex={currentIndex}
                                onClose={handleCloseFullscreen}
                                autoPlay={false}
                            />

                            {hasLotsOfMedia && (
                                <Button variant="outline" size="sm" className="w-full mt-2 gap-1" onClick={toggleShowAllMedia}>
                                    {showAllMedia ? (
                                        <>
                                            Show less <ChevronUp className="h-4 w-4" />
                                        </>
                                    ) : (
                                        <>
                                            Show all {media.length} items <ChevronDown className="h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center p-8 bg-gray-100">
                            <p className="text-gray-500 text-center">No media available</p>
                        </div>
                    )}
                </div>

                {/* Details section - hide when in fullscreen mode */}
                {!isFullscreen && (
                    <div className="bg-background w-full md:w-[350px] flex flex-col h-full md:h-[90vh] overflow-hidden">
                        {/* Header */}
                        <div className="p-4 border-b flex items-center justify-between">

                            <>
                                <div className="flex items-center gap-2">
                                    <CustomAvatar url={creator.profileUrl} />
                                    <div className="flex items-center">
                                        <span className="font-medium">{creator.name || "User"}</span>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-5 w-5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={copyLink}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            Copy link
                                        </DropdownMenuItem>

                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>

                        </div>

                        {/* Comments section with scrolling */}
                        <div className="flex-1 overflow-y-auto">

                            <SinglePostCommentSection postId={post?.id || 1} initialCommentCount={commentCount || 0} />

                        </div>

                        {/* Actions section */}
                        <div className="border-t">
                            <div className="p-4 pb-2">
                                <div className="flex items-center justify-between">

                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={toggleLike}>
                                            {
                                                unlikeMutation.isLoading || likeMutation.isLoading ? (
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                                                ) : (
                                                    <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : ""}`} />
                                                )
                                            }
                                        </Button>

                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={handleShare}>
                                            <Share2 className="h-5 w-5" />
                                        </Button>


                                    </div>

                                </div>
                                <div className="mt-2">

                                    <p className="font-semibold text-sm">{likeCount.toLocaleString()} likes</p>

                                </div>
                            </div>

                            {/* Comment input */}
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                                className="px-4 pb-4"
                            >

                                <AddPostComment postId={post?.id || 1} />

                            </motion.div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default SinglePostPage

function MediaGallerySkeleton() {
    return (
        <div className="w-full h-full flex flex-col bg-gray-100 relative">
            {/* Main media container */}
            <div className="relative flex-1 bg-gray-100">
                {/* Media content skeleton */}
                <div className="relative w-full h-full flex items-center justify-center">
                    <Skeleton className="w-full h-full max-h-[80vh] bg-gray-200" />
                </div>
            </div>

            {/* Controls bar skeleton */}
            <div className="bg-gray-900/90 p-2">
                {/* Progress bar skeleton */}
                <Skeleton className="w-full h-1 mb-3 bg-gray-700" />

                <div className="flex items-center justify-between">
                    {/* Left controls skeleton */}
                    <div className="flex items-center gap-2">
                        <Skeleton className="w-7 h-7 rounded-full bg-gray-700" />
                        <Skeleton className="w-7 h-7 rounded-full bg-gray-700" />
                        <Skeleton className="w-7 h-7 rounded-full bg-gray-700" />
                        <Skeleton className="w-16 h-4 rounded bg-gray-700" />
                    </div>

                    {/* Right controls skeleton */}
                    <div className="flex items-center gap-2">
                        <Skeleton className="w-7 h-7 rounded-full bg-gray-700" />
                        <Skeleton className="w-7 h-7 rounded-full bg-gray-700" />
                        <Skeleton className="w-7 h-7 rounded-full bg-gray-700" />
                    </div>
                </div>
            </div>

            {/* Thumbnails row skeleton */}
            <div className="flex flex-col  absolute h-full gap-2 overflow-x-auto bg-gray-200 p-2 z-10 items-center justify-start">
                {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex-shrink-0 mx-1 first:ml-2 last:mr-2">
                        <Skeleton className="w-[60px] h-[60px] rounded bg-gray-300" />
                    </div>
                ))}
            </div>
        </div>
    )
}

export function SinglePostSkeleton() {
    return (
        <div className="flex items-center justify-center w-full">
            <div className="w-full md:max-w-6xl md:max-h-[90vh] flex flex-col md:flex-row">
                {/* Media section skeleton */}
                <div className="relative bg-gray-100 flex-1 md:max-w-[600px]">
                    <MediaGallerySkeleton />
                </div>

                {/* Details section skeleton */}
                <div className="bg-background w-full md:w-[350px] flex flex-col h-full md:h-[90vh] overflow-hidden">
                    {/* Header skeleton */}
                    <div className="p-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2 w-full">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="flex flex-col gap-1">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                            <div className="ml-auto">
                                <Skeleton className="h-8 w-8 rounded-full" />
                            </div>
                        </div>
                    </div>

                    {/* Post content skeleton */}
                    <div className="p-4 border-b">
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-5/6" />
                    </div>

                    {/* Comments section skeleton */}
                    <div className="flex-1 overflow-y-auto">
                        {/* Comment 1 */}
                        <div className="p-4 border-b">
                            <div className="flex items-start gap-3">
                                <Skeleton className="w-8 h-8 rounded-full" />
                                <div className="flex-1">
                                    <Skeleton className="w-24 h-4 mb-2" />
                                    <Skeleton className="w-full h-12" />
                                    <div className="flex items-center gap-2 mt-2">
                                        <Skeleton className="w-16 h-3" />
                                        <Skeleton className="w-16 h-3" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Comment 2 */}
                        <div className="p-4 border-b">
                            <div className="flex items-start gap-3">
                                <Skeleton className="w-8 h-8 rounded-full" />
                                <div className="flex-1">
                                    <Skeleton className="w-32 h-4 mb-2" />
                                    <Skeleton className="w-full h-8" />
                                    <div className="flex items-center gap-2 mt-2">
                                        <Skeleton className="w-16 h-3" />
                                        <Skeleton className="w-16 h-3" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Comment 3 */}
                        <div className="p-4 border-b">
                            <div className="flex items-start gap-3">
                                <Skeleton className="w-8 h-8 rounded-full" />
                                <div className="flex-1">
                                    <Skeleton className="w-28 h-4 mb-2" />
                                    <Skeleton className="w-full h-16" />
                                    <div className="flex items-center gap-2 mt-2">
                                        <Skeleton className="w-16 h-3" />
                                        <Skeleton className="w-16 h-3" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions section skeleton */}
                    <div className="border-t">
                        <div className="p-4 pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="ml-auto">
                                        <Skeleton className="h-9 w-9 rounded-full" />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2">
                                <Skeleton className="h-5 w-24" />
                            </div>
                        </div>

                        {/* Comment input skeleton */}
                        <div className="px-4 pb-4">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-10 flex-1 rounded-full" />
                                <Skeleton className="h-10 w-10 rounded-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}