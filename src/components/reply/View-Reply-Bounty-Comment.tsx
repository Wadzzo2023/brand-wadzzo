import { formatPostCreatedAt } from "~/utils/format-date"
import { useSession } from "next-auth/react"
import React, { useState } from "react"
import type { BountyComment } from "@prisma/client"
import { api } from "~/utils/api"
import CustomAvatar from "../common/custom-avatar"
import ContextMenu from "../common/context-menu"
import { CommentFormatter } from "../common/comment-formatter"
import clsx from "clsx"

export default function ViewReplyBountyComment({
  comment,
}: {
  comment: BountyComment & {
    user: {
      name: string | null
      image: string | null
    }
  }
}) {
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  return (
    <div className="relative">
      <div className={clsx("flex items-start justify-between gap-4 text-sm", isDeleting && "blur-sm")}>
        <div className="flex w-full gap-2">
          <div className="h-auto w-auto rounded-full">
            <CustomAvatar className="h-12 w-12" url={comment.user.image} />
          </div>
          <div className="flex flex-col items-start">
            <div className="font-bold">{comment.user.name}</div>
            <CommentFormatter content={comment.content} />
            <p className="text-gray-400">{formatPostCreatedAt(comment.createdAt)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <CommentContextMenu
            bountyCommentId={comment.id}
            commentatorId={comment.userId}
            setIsDeleting={setIsDeleting}
          />
        </div>
      </div>
      {isDeleting && (
        <div className="absolute z-10 left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background/80 px-4 py-2 rounded-md shadow-md">
          <p className="text-foreground font-semibold">Deleting...</p>
        </div>
      )}
    </div>
  )
}

function ShowMore({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = React.useState<boolean>(false)
  return (
    <>
      <p>{isExpanded ? content : content.slice(0, 50)}</p>
      {!isExpanded && <button onClick={() => setIsExpanded(!isExpanded)}>See More</button>}
    </>
  )
}

function CommentContextMenu({
  commentatorId,
  bountyCommentId,
  setIsDeleting,
}: {
  commentatorId: string
  bountyCommentId: number
  setIsDeleting: (value: boolean) => void
}) {
  const { data } = useSession()
  const deletePost = api.bounty.Bounty.deleteBountyComment.useMutation()

  const handleDelete = () => {
    setIsDeleting(true)
    deletePost.mutate(bountyCommentId, {
      onSuccess: () => {
        console.log("deleted")
      },
      onError: () => {
        setIsDeleting(false)
      },
    })
  }

  if (data?.user && data.user.id === commentatorId) {
    return <ContextMenu handleDelete={handleDelete} isLoading={deletePost.isLoading} />
  }

  return null
}

