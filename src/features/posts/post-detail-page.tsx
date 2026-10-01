"use client";

import { formatDistanceToNow } from "date-fns";
import { Copy, FileText, Globe, Heart, Lock, MessageCircle, MoreHorizontal, Share2, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import CustomAvatar from "~/components/common/custom-avatar";
import { Preview } from "~/components/common/quill-preview";
import { AddPostComment } from "~/components/post/comment/add-post-comment";
import { SinglePostCommentSection } from "~/components/post/comment/single-post-comment-section";
import MediaGallery from "~/components/post/media-gallary";
import { Badge } from "~/components/shadcn/ui/badge";
import { Button } from "~/components/shadcn/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/shadcn/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { Spinner } from "~/ui/spinner";
import { api, type RouterOutputs } from "~/utils/api";

const back = { href: "/posts", label: "Posts" };

/** One post: the full text and media, likes, and the comment thread. */
export default function PostDetailPage() {
  const id = Number(useParams<{ id: string }>()?.id);
  const post = api.fan.post.getAPost.useQuery(id, { enabled: Number.isInteger(id), refetchOnWindowFocus: false });

  if (post.isLoading) return <PostSkeleton />;
  if (post.isError)
    return (
      <PageBody className="max-w-3xl">
        <PageHeader title="Post" back={back} />
        <ErrorState className="mt-6" message={post.error.message} onRetry={() => void post.refetch()} />
      </PageBody>
    );
  if (!post.data)
    return (
      <PageBody className="max-w-3xl">
        <PageHeader title="Post" back={back} />
        <EmptyState
          className="mt-6"
          icon={FileText}
          title="Post not found"
          description="It may have been deleted, or it's for a membership tier you don't hold."
          action={
            <Button asChild variant="outline">
              <Link href="/posts">Back to posts</Link>
            </Button>
          }
        />
      </PageBody>
    );
  return <PostView post={post.data} />;
}

type PostData = Exclude<NonNullable<RouterOutputs["fan"]["post"]["getAPost"]>, false>;

function PostView({ post }: { post: PostData }) {
  const router = useRouter();
  const session = useSession();
  const utils = api.useUtils();
  const isOwner = session.data?.user.id === post.creatorId;

  const liked = api.fan.post.isLiked.useQuery(post.id);
  const [likes, setLikes] = useState(post._count.likes);
  const refreshLike = () => void utils.fan.post.isLiked.invalidate(post.id);
  const like = api.fan.post.likeApost.useMutation({ onSuccess: () => (setLikes((n) => n + 1), refreshLike()) });
  const unlike = api.fan.post.unLike.useMutation({ onSuccess: () => (setLikes((n) => Math.max(0, n - 1)), refreshLike()) });
  const liking = like.isPending || unlike.isPending;

  const [deleting, setDeleting] = useState(false);
  const remove = api.fan.post.deletePost.useMutation({
    onSuccess: () => {
      toast.success("Post deleted");
      void utils.fan.post.getPosts.invalidate();
      router.push("/posts");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyLink = () =>
    void navigator.clipboard.writeText(window.location.href).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy the link"),
    );
  const share = async () => {
    if (!navigator.share) return copyLink();
    try {
      await navigator.share({ title: post.heading, url: window.location.href });
    } catch {
      // Closing the share sheet isn't an error.
    }
  };

  return (
    <PageBody className="max-w-3xl">
      <PageHeader title={post.heading} back={back} />

      <article className="mt-6 overflow-hidden rounded-xl border bg-card">
        <header className="flex items-center gap-3 p-4 sm:p-5">
          <CustomAvatar url={post.creator.profileUrl} className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{post.creator.name}</p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={new Date(post.createdAt).toISOString()} title={new Date(post.createdAt).toLocaleString()}>
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </time>
            </p>
          </div>
          {post.subscription ? (
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" /> {post.subscription.name}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <Globe className="size-3" /> Public
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Post actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyLink}>
                <Copy /> Copy link
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDeleting(true)} className="text-destructive focus:text-destructive">
                    <Trash2 /> Delete post
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {post.content && (
          <div className="prose prose-sm max-w-none px-4 pb-4 dark:prose-invert sm:px-5">
            <Preview value={post.content} />
          </div>
        )}

        {post.medias.length > 0 && (
          <div className="border-y bg-muted/40">
            <MediaGallery media={post.medias} />
          </div>
        )}

        <div className="flex items-center gap-1 border-t px-2 py-1.5 sm:px-3">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={Boolean(liked.data)}
            disabled={liking || liked.isLoading}
            onClick={() => (liked.data ? unlike.mutate(post.id) : like.mutate(post.id))}
          >
            {liking ? <Spinner className="size-4" /> : <Heart className={cn(liked.data && "fill-destructive text-destructive")} />}
            <span className="tabular-nums">{likes.toLocaleString()}</span>
            <span className="sr-only">likes</span>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="#comments">
              <MessageCircle />
              <span className="tabular-nums">{post._count.comments.toLocaleString()}</span>
              <span className="sr-only">comments</span>
            </a>
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void share()}>
            <Share2 /> Share
          </Button>
        </div>
      </article>

      <section id="comments" className="mt-6 scroll-mt-20 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-hud text-sm font-semibold uppercase tracking-wider text-muted-foreground">Comments</h2>
        <div className="mt-3">
          <AddPostComment postId={post.id} />
        </div>
        <SinglePostCommentSection postId={post.id} initialCommentCount={post._count.comments} />
      </section>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this post?"
        description="Its likes and comments go with it. This can't be undone."
        busy={remove.isPending}
        onConfirm={() => remove.mutate(post.id)}
      />
    </PageBody>
  );
}

function PostSkeleton() {
  return (
    <PageBody className="max-w-3xl">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-3 h-8 w-2/3" />
      <div className="mt-6 space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-64 w-full" />
      </div>
    </PageBody>
  );
}
