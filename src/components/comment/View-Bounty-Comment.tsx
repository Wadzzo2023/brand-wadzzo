import { formatPostCreatedAt } from "~/utils/format-date";
import { useSession } from "next-auth/react";
import React, { useState } from "react";
import { api } from "~/utils/api";
import { BountyComment } from "@prisma/client";
import { Button } from "~/components/shadcn/ui/button";
import CustomAvatar from "../common/custom-avatar";
import { AddBountyReplyComment } from "../reply/Add-Reply-Bounty-Comment";
import ViewReplyBountyComment from "../reply/View-Reply-Bounty-Comment";
import ContextMenu from "../common/context-menu";
import { CommentFormatter } from "../common/comment-formatter";
import clsx from "clsx";

export default function ViewBountyComment({
  comment,
  bountyChildComments,
}: {
  comment: BountyComment & {
    userWinCount: number;
    user: {
      name: string | null;
      image: string | null;
    };
  };
  bountyChildComments: ({
    user: {
      name: string | null;
      image: string | null;
    };
  } & BountyComment)[];
}) {
  const [replyBox, setReplyBox] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  return (
    <div className="relative">
      <div className={clsx("flex items-start justify-between w-full text-sm", isDeleting && "blur-sm")}>
        <div className="flex w-full gap-2">
          <div className="h-auto w-auto rounded-full">
            <CustomAvatar
              className="h-12 w-12"
              url={comment.user.image}
              winnerCount={comment.userWinCount}
            />
          </div>
          <div className="flex w-full flex-col items-start">
            <h2 className="font-bold">{comment.user.name}</h2>
            <CommentFormatter content={comment.content} />

            <p className="text-gray-400">
              {formatPostCreatedAt(comment.createdAt)}
            </p>

            <div className="w-full">
              <div
                onClick={() => setReplyBox((prev) => !prev)}
                className="cursor-pointer"
              >
                Reply
              </div>

              {replyBox && (
                <div className="w-full ">
                  <AddBountyReplyComment
                    parentId={comment.id}
                    bountyId={comment.bountyId}
                  />
                </div>
              )}
            </div>

            <div className="mt-2 flex w-full flex-col gap-3">
              {bountyChildComments.length > 0 &&
                bountyChildComments.map((comment) => (
                  <ViewReplyBountyComment key={comment.id} comment={comment} />
                ))}
            </div>
          </div>
        </div>
        <div className="">
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
  );
}

function ShowMore({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = React.useState<boolean>(false);
  return (
    <>
      <p>{isExpanded ? content : content.slice(0, 50)}</p>
      {!isExpanded && (
        <button onClick={() => setIsExpanded(!isExpanded)}>See More</button>
      )}
    </>
  );
}

function CommentContextMenu({
  commentatorId,
  bountyCommentId,
  setIsDeleting,
}: {
  commentatorId: string;
  bountyCommentId: number;
  setIsDeleting: (value: boolean) => void;
}) {
  const { data } = useSession();
  const deletePost = api.bounty.Bounty.deleteBountyComment.useMutation();

  const handleDelete = () => {
    setIsDeleting(true);
    deletePost.mutate(bountyCommentId, {
      onSuccess: () => {
        // Handle successful deletion (e.g., remove comment from UI)
      },
      onError: () => {
        setIsDeleting(false);
        // Handle error (e.g., show error message)
      }
    });
  };

  if (data?.user && data.user.id === commentatorId) {
    return (
      <div>
        <ContextMenu
          handleDelete={handleDelete}

          isLoading={deletePost.isLoading}
        />
      </div>
    );
  }

  return null;
}
