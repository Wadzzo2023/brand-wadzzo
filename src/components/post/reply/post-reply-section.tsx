"use client"

import { formatPostCreatedAt } from "~/utils/format-date"

import type { Comment } from "@prisma/client"
import { useSession } from "next-auth/react"

import { api } from "~/utils/api"
import Link from "next/link"
import { motion } from "framer-motion"
import { CommentFormatter } from "~/components/common/comment-formatter"
import CustomAvatar from "~/components/common/custom-avatar"
import ContextMenu from "~/components/common/context-menu"

export default function ReplyCommentView({
    comment,
}: {
    comment: Comment & {
        user: {
            name: string | null
            image: string | null
        }
    }
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex w-full items-start justify-between text-sm"
        >
            <div className="flex w-full gap-2">
                <div className="h-auto w-auto rounded-full">
                    <CustomAvatar className="h-10 w-10" url={comment.user.image} />
                </div>
                <div className="flex flex-col items-start">
                    <Link href={`/fans/creator/${comment.userId}`} className="font-bold">
                        {comment.user.name}
                    </Link>
                    <CommentFormatter content={comment.content} maxLength={150} />
                    <p className="text-gray-400 text-xs">{formatPostCreatedAt(comment.createdAt)}</p>
                </div>
            </div>
            <div className="flex gap-2">
                <CommentContextMenu commentId={comment.id} commentorId={comment.userId} />
            </div>
        </motion.div>
    )
}

function CommentContextMenu({
    commentorId,
    commentId,
}: {
    commentorId: string
    commentId: number
}) {
    const { data } = useSession()
    const deletePost = api.fan.post.deleteComment.useMutation()

    const handleDelete = () => deletePost.mutate(commentId)

    if (data?.user && data.user.id === commentorId) {
        return <ContextMenu bg="bg-base-300" handleDelete={handleDelete} isLoading={deletePost.isLoading} />
    }

    return null
}

