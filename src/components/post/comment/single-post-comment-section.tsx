"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { formatPostCreatedAt } from "~/utils/format-date"
import { Comment } from "@prisma/client"
import { Button } from "~/components/shadcn/ui/button"
import { useSession } from "next-auth/react"
import { api } from "~/utils/api"
import { cn } from "~/lib/utils"
import Link from "next/link"
import { MessageCircle, Send } from 'lucide-react'
import CustomAvatar from "~/components/common/custom-avatar"
import { AddReplyComment } from "../reply/add-post-reply"
import ReplyCommentView from "../reply/post-reply-section"
import { AddPostComment } from "./add-post-comment"
import ContextMenu from "~/components/common/context-menu"

interface CommentSectionProps {
    postId: number
    initialCommentCount: number
}

export function SinglePostCommentSection({ postId, initialCommentCount }: CommentSectionProps) {
    const [isCommentsVisible, setIsCommentsVisible] = useState(true)


    const comments = api.fan.post.getComments.useQuery({
        postId: postId,
    });


    return (
        <div className="mt-2 w-full">


            <AnimatePresence>

                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                >
                    {comments.isLoading ? (
                        <div className="flex justify-center py-4">
                            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
                        </div>
                    ) : comments.data && comments.data.length > 0 ? (
                        <div className="space-y-4 mt-2">
                            {comments.data.map((comment) => (
                                <CommentView
                                    key={comment.id}
                                    comment={comment}
                                    childrenComments={comment.childComments || []}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-4 text-gray-500">
                            No comments yet. Be the first to comment!
                        </div>
                    )}

                </motion.div>

            </AnimatePresence>
        </div>
    )
}

interface CommentViewProps {
    comment: Comment & {
        user: {
            name: string | null
            image: string | null
        }
        children?: (Comment & {
            user: {
                name: string | null
                image: string | null
            }
        })[]
    }
    childrenComments: (Comment & {
        user: {
            name: string | null
            image: string | null
        }
    })[]
}

function CommentView({ comment, childrenComments }: CommentViewProps) {
    const [replyBox, setReplyBox] = useState(false)
    const [showReplies, setShowReplies] = useState(false)

    const toggleReplyBox = () => {
        setReplyBox(prev => !prev)
        if (!showReplies && childrenComments.length > 0) {
            setShowReplies(true)
        }
    }

    const toggleReplies = () => {
        setShowReplies(prev => !prev)
    }

    return (
        <motion.div
            className="flex w-full items-start justify-between text-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <div className="flex w-full gap-2">
                <div className="h-auto w-auto rounded-full">
                    <CustomAvatar url={comment.user.image} />
                </div>
                <div className="flex w-full flex-col items-start">
                    <div className="flex items-center gap-2">
                        <Link href={`/fans/creator/${comment.userId}`} className="font-bold hover:underline">
                            {comment.user.name}
                        </Link>
                        <span className="text-xs text-gray-400">
                            {formatPostCreatedAt(comment.createdAt)}
                        </span>
                    </div>

                    <CommentFormatter content={comment.content} />

                    <div className="flex items-center gap-4 mt-1">
                        <Button
                            onClick={toggleReplyBox}
                            variant="ghost"
                            size="sm"
                            className="h-auto px-2 py-1 text-xs"
                        >
                            Reply
                        </Button>

                        {childrenComments.length > 0 && (
                            <Button
                                onClick={toggleReplies}
                                variant="ghost"
                                size="sm"
                                className="h-auto px-2 py-1 text-xs text-gray-500"
                            >
                                {showReplies ? "Hide replies" : `Show replies (${childrenComments.length})`}
                            </Button>
                        )}
                    </div>

                    <AnimatePresence>
                        {replyBox && (
                            <motion.div
                                className="w-full mt-2"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <AddReplyComment
                                    parentId={comment.id}
                                    postId={comment.postId}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {showReplies && childrenComments.length > 0 && (
                            <motion.div
                                className="mt-2 w-full pl-2 border-l-2 border-gray-100 dark:border-gray-800"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                {childrenComments.map((childComment, index) => (
                                    <motion.div
                                        key={childComment.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.2, delay: index * 0.05 }}
                                        className="mt-3"
                                    >
                                        <ReplyCommentView comment={childComment} />
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex gap-2">
                <CommentContextMenu
                    commentId={comment.id}
                    commentorId={comment.userId}
                />
            </div>
        </motion.div>
    )
}

function CommentContextMenu({ commentorId, commentId }: { commentorId: string; commentId: number }) {
    const { data: session } = useSession()
    const deleteComment = api.fan.post.deleteComment.useMutation()

    const handleDelete = () => deleteComment.mutate(commentId)

    if (session?.user && session.user.id === commentorId) {
        return (
            <ContextMenu
                bg="bg-base-300"
                handleDelete={handleDelete}
                isLoading={deleteComment.isLoading}
            />
        )
    }

    return null
}

interface CommentFormatterProps {
    content: string
    maxLength?: number
    className?: string
}

function formatLinks(text: string) {
    // URL pattern
    const urlPattern = /https?:\/\/[^\s]+/g

    return text.split(urlPattern).reduce((arr, part, i, parts) => {
        if (i < parts.length - 1) {
            const match = text.match(urlPattern)?.[i]
            arr.push(
                part,
                <a
                    key={i}
                    href={match}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                >
                    {match}
                </a>
            )
        } else {
            arr.push(part)
        }
        return arr
    }, [] as (string | JSX.Element)[])
}

function CommentFormatter({ content, maxLength = 250, className }: CommentFormatterProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Process the content
    const shouldTruncate = content.length > maxLength && !isExpanded
    const displayContent = shouldTruncate
        ? content.slice(0, maxLength) + '...'
        : content

    // Format links and mentions
    const formattedContent = formatLinks(displayContent)

    return (
        <div className={cn("space-y-1", className)}>
            <div className="whitespace-pre-line text-sm">
                {formattedContent}
            </div>
            {content.length > maxLength && (
                <Button
                    variant="link"
                    className="h-auto p-0 text-muted-foreground text-xs font-normal"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? "See less" : "See more"}
                </Button>
            )}
        </div>
    )
}
