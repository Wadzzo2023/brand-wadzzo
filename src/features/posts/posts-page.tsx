"use client";

import { FileText, Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Fragment } from "react";

import PostCard from "~/components/post/post-card";
import { Button } from "~/components/shadcn/ui/button";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { Spinner } from "~/ui/spinner";
import { api } from "~/utils/api";

/** Posts: everything the brand has published to followers. */
export default function PostsPage() {
  const session = useSession();
  const posts = api.fan.post.getPosts.useInfiniteQuery(
    { pubkey: session.data?.user.id ?? "", limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: Boolean(session.data?.user.id) },
  );
  const items = posts.data?.pages.flatMap((p) => p.posts) ?? [];

  const newPost = (
    <Button asChild>
      <Link href="/posts/new">
        <Plus /> New post
      </Link>
    </Button>
  );

  return (
    <PageBody className="max-w-3xl">
      <PageHeader eyebrow="Content" title="Posts" description="News, media and perks for your followers — public or for a membership tier." actions={newPost} />

      <div className="mt-6 space-y-4">
        {posts.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-48 w-full" />
            </div>
          ))
        ) : posts.isError ? (
          <ErrorState message={posts.error.message} onRetry={() => void posts.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={FileText} title="No posts yet" description="Your first post shows up in followers' feeds right away." action={newPost} />
        ) : (
          <>
            {posts.data?.pages.map((page, i) => (
              <Fragment key={i}>
                {page.posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    creator={post.creator}
                    likeCount={post._count.likes}
                    commentCount={post._count.comments}
                    locked={Boolean(post.subscription)}
                    show
                    media={post.medias}
                  />
                ))}
              </Fragment>
            ))}
            {posts.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={() => void posts.fetchNextPage()} disabled={posts.isFetchingNextPage}>
                  {posts.isFetchingNextPage && <Spinner className="size-4" />}
                  {posts.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageBody>
  );
}
