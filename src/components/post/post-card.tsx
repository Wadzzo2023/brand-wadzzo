"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "~/components/shadcn/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "~/components/shadcn/ui/card"
import { Badge } from "~/components/shadcn/ui/badge"
import { Heart, MessageCircle, Share2, Lock, Globe, Bookmark, Flag, ChevronDown, ChevronUp, CreditCard, Loader2, LockOpen } from 'lucide-react'
import { cn } from "~/lib/utils"
import MediaGallery from "./media-gallary"
import type { Media, Post } from "@prisma/client"
import { api } from "~/utils/api"
import CustomAvatar from "../common/custom-avatar"
import { CommentSection } from "./comment/post-comment-section"
import { Preview } from "../common/quill-preview"
import { PostContextMenu } from "../common/post-context-menu"
import Link from "next/link"
import ShareModal from "../modals/share-post-modal"


interface PostCardProps {
    post: Post & {
        medias: Media[]
        subscription?: {
            id: number
            name: string
            price: number
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
    fullHeight?: boolean // Optional prop to control height
}

export default function PostCard({ post, creator, likeCount, commentCount, locked, show, media, fullHeight }: PostCardProps) {
    const [saved, setSaved] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [showAllMedia, setShowAllMedia] = useState(false)
    const [showComments, setShowComments] = useState(false)
    const [deletePostId, setDeletePostId] = useState<number | null>(null)
    const postUrl = `/posts/${post.id}`;
    const { data: liked } = api.fan.post.isLiked.useQuery(post.id);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [data, setData] = useState<string>("");
    const comments = api.fan.post.getComments.useQuery({
        postId: post.id,
        limit: 5,
    });
    const deleteLike = api.fan.post.unLike.useMutation();
    const likeMutation = api.fan.post.likeApost.useMutation();

    const toggleLike = () => {
        if (liked) {
            deleteLike.mutate(post.id)
        } else {
            likeMutation.mutate(post.id)
        }
    }
    const toggleExpand = () => {
        setExpanded(!expanded)
    }
    const toggleShowAllMedia = () => {
        setShowAllMedia(!showAllMedia)
    }


    const hasLotsOfMedia = media && media.length > 3


    const displayMedia = showAllMedia ? media : media?.slice(0, 3)

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

    return (
        <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}

            className=""
        >
            <Card className={cn("overflow-hidden   border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow", deletePostId === post.id && "animate-pulse border-red-300")}>
                <CardHeader className="p-4 pb-0">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <CustomAvatar url={creator.profileUrl} />

                            <div>
                                <div className="flex items-center gap-2">

                                    <span className="font-semibold">{creator.name}</span>

                                    <Badge variant={locked ? "outline" : "secondary"} className="text-xs">
                                        {locked ? show ? <LockOpen className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" /> : <Globe className="w-3 h-3 mr-1" />}
                                        {locked ? show ? "Unlocked" : "Locked" : "Public"}
                                    </Badge>
                                </div>
                                <p className="text-xs ">{formatDate(post.createdAt.toString())}</p>
                            </div>
                        </div>
                        <PostContextMenu creatorId={creator.id} postId={post.id}
                            setDeletePostId={setDeletePostId}
                        />

                    </div>
                </CardHeader>

                <CardContent className="p-1 md:p-4  ">
                    <div className="space-y-4 " >
                        {!show ? (
                            <LockedContent
                                price={post.subscription?.price ?? 0}
                                assetCode={creator.pageAsset?.code ?? creator.customPageAssetCodeIssuer?.split("-")[0] ?? ""}
                            />
                        ) : (
                            <>
                                {post.heading && post.heading !== "Heading" &&
                                    <Link href={postUrl}>
                                        <h2 className="text-xl font-bold">{post.heading}</h2>
                                    </Link>
                                }
                                <div>
                                    {post.content && post.content.length > 400 && !expanded ? (
                                        <>
                                            <Link href={postUrl} >
                                                <p className="text-gray-800 dark:text-gray-200 cursor-pointer"><Preview value={post.content.substring(0, 400)} /></p></Link>
                                            <Button variant="link" size="sm" className="px-0 h-auto" onClick={toggleExpand}>
                                                See more
                                            </Button>
                                        </>
                                    ) : (
                                        <Link href={postUrl}> <p className="text-gray-800 dark:text-gray-200 cursor-pointer"><Preview value={post.content} /></p>  </Link>
                                    )}

                                    {expanded && post.content && post.content.length > 150 && (
                                        <Button variant="link" size="sm" className="px-0 h-auto" onClick={toggleExpand}>
                                            See less
                                        </Button>
                                    )}
                                </div>

                                {media && media.length > 0 && (
                                    <div className="space-y-2   min-h-[300px] ">
                                        <MediaGallery
                                            media={media}
                                            fullHeight={fullHeight}
                                        />


                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </CardContent>

                <CardFooter className="p-4 pt-0 flex flex-col">
                    <div className="flex items-center justify-between w-full text-gray-500 dark:text-gray-400 text-sm mb-2">
                        <div>{likeCount} likes</div>
                        <div>{commentCount} comments</div>
                    </div>

                    <div className="flex items-center justify-between w-full border-t border-gray-100 dark:border-gray-800 py-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("flex-1 gap-2", liked && "text-red-500 dark:text-red-400 font-medium")}
                            onClick={toggleLike}
                            disabled={deleteLike.isLoading ?? likeMutation.isLoading}
                        >
                            {
                                likeMutation.isLoading ?? deleteLike.isLoading ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />

                                    </div>
                                ) : (
                                    <Heart className={cn("h-4 w-4", liked && "fill-current")} />
                                )
                            }
                            Like
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 gap-2"
                            onClick={() => setShowComments(!showComments)}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Comment
                        </Button>
                        <Button variant="ghost" size="sm" className="flex-1 gap-2"
                            onClick={() => {
                                setShareModalOpen(true)
                                setData(postUrl)

                            }}
                        >
                            <Share2 className="h-4 w-4" />
                            Share
                        </Button>
                    </div>
                </CardFooter>
                {showComments && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="px-4 pb-4"
                    >
                        <CommentSection postId={post.id} initialCommentCount={commentCount} />
                    </motion.div>
                )}
            </Card>
            {
                shareModalOpen && (
                    <ShareModal
                        isOpen={shareModalOpen}
                        setIsOpen={setShareModalOpen}
                        data={data}
                    />
                )
            }
        </motion.div>
    )
}

// Component to display when content is locked
function LockedContent({ price, assetCode }: { price: number; assetCode: string }) {
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-6">
            <div className="flex flex-col items-center text-center space-y-4">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
                    <Lock className="h-6 w-6 text-amber-600 dark:text-amber-500" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Locked Content</h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        This content requires {price} {assetCode} to view.
                    </p>
                </div>
                <Button className="gap-2">
                    <CreditCard className="h-4 w-4" />
                    Get Access
                </Button>
            </div>
        </div>
    )
}
