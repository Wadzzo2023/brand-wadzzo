import { ImageIcon, Plus, Sparkles, TrendingUp } from 'lucide-react'
import { useSession } from "next-auth/react"
import React from "react"
import { Button } from "~/components/shadcn/ui/button"
import { api } from "~/utils/api"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Skeleton } from "~/components/shadcn/ui/skeleton"
import PostCard from "~/components/post/post-card"
import { CreatePostModal } from "~/components/modals/create-post-modal"

const CreatorPost = () => {
    const session = useSession()
    const [isPostModalOpen, setIsPostModalOpen] = React.useState(false)
    const allCreatedPost = api.fan.post.getPosts.useInfiniteQuery(
        {
            pubkey: session.data?.user.id ?? "",
            limit: 10,
        },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
    )

    return (
        <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-8'>
            {/* <CHANGE> Added a container for better layout and spacing */}
            {/* <CHANGE> Enhanced header with better typography and visual hierarchy */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold ">
                        Your Posts
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        Share your creativity with the world
                    </p>
                </div>
                <Button
                    onClick={() => setIsPostModalOpen(true)}
                    className=" shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                    size="lg"
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Create Post
                </Button>
            </div>

            {/* <CHANGE> Enhanced spacing and layout */}
            <div className="space-y-8">
                {allCreatedPost.isLoading && (
                    <div className="space-y-6">
                        {[1, 2, 3].map((i) => (
                            <Card key={i} className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
                                <CardHeader className="space-y-4">
                                    <div className="flex items-center space-x-3">
                                        <Skeleton className="h-12 w-12 rounded-full" />
                                        <div className="space-y-2">
                                            <Skeleton className="h-5 w-32" />
                                            <Skeleton className="h-4 w-24" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-6 w-2/3" />
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-64 w-full rounded-lg" />
                                </CardContent>
                                <CardFooter>
                                    <div className="flex space-x-4">
                                        <Skeleton className="h-8 w-16" />
                                        <Skeleton className="h-8 w-16" />
                                        <Skeleton className="h-8 w-16" />
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}

                {allCreatedPost.data?.pages.map((page, i) => (
                    <React.Fragment key={i}>
                        {page.posts.map((post) => (
                            <div key={post.id} className="transform transition-all duration-300 ">
                                <PostCard
                                    post={post}
                                    creator={post.creator}
                                    likeCount={post._count.likes}
                                    commentCount={post._count.comments}
                                    locked={post.subscription ? true : false}
                                    show={true}
                                    media={post.medias}
                                />
                            </div>
                        ))}
                    </React.Fragment>
                ))}

                {allCreatedPost.hasNextPage && (
                    <div className="flex justify-center pt-8">
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => allCreatedPost.fetchNextPage()}
                            disabled={allCreatedPost.isFetchingNextPage}
                            className="min-w-[200px] border-2 hover:border-purple-300 hover:bg-purple-50 transition-all duration-300"
                        >
                            {allCreatedPost.isFetchingNextPage ? (
                                <>
                                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-r-transparent"></div>
                                    Loading more...
                                </>
                            ) : (
                                <>
                                    <TrendingUp className="h-4 w-4 mr-2" />
                                    Load More Posts
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* <CHANGE> Enhanced empty state with better visual design and call-to-action */}
                {allCreatedPost.data?.pages[0]?.posts.length === 0 && (
                    <div className="text-center py-20">
                        <div className="max-w-md mx-auto">
                            <div className="relative mb-8">
                                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center">
                                    <ImageIcon className="h-16 w-16 text-purple-500" />
                                </div>
                                <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                                    <Sparkles className="h-4 w-4 text-white" />
                                </div>
                            </div>

                            <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                                Ready to Share Your Story?
                            </h3>
                            <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
                                Your creative journey starts here. Share your thoughts, experiences, and connect with your audience through engaging content.
                            </p>

                            <div className="space-y-4">
                                <Button
                                    onClick={() => setIsPostModalOpen(true)}
                                    size="lg"
                                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 px-8 py-3"
                                >
                                    <Plus className="h-5 w-5 mr-2" />
                                    Create Your First Post
                                </Button>

                                <div className="flex items-center justify-center space-x-6 text-sm text-muted-foreground">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span>Easy to create</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                        <span>Rich media support</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                        <span>Instant publishing</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* <CHANGE> Floating action button for mobile */}
            <div className="fixed bottom-6 right-6 sm:hidden z-40">
                <Button
                    onClick={() => setIsPostModalOpen(true)}
                    size="lg"
                    className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110"
                >
                    <Plus className="h-6 w-6" />
                </Button>
            </div>

            {isPostModalOpen && (
                <CreatePostModal
                    isOpen={isPostModalOpen}
                    setIsOpen={setIsPostModalOpen}
                />
            )}
        </div>
    )
}

export default CreatorPost;
