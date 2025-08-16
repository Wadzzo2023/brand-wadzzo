"use client"

import { Skeleton } from "~/components/shadcn/ui/skeleton"
import { Card, CardContent, CardFooter, CardHeader } from "~/components/shadcn/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/shadcn/ui/tabs"
import { Separator } from "~/components/shadcn/ui/separator"
import { Grid3X3, ImageIcon } from "lucide-react"

export default function ArtistDashboardSkeleton() {
    return (
        <div className="h-screen flex flex-col">
            {/* Header Skeleton */}
            <div className="h-40 relative ">
                <Skeleton className="h-full w-full" />
                <div className="absolute top-4 right-4">
                    <Skeleton className="h-9 w-24" />
                </div>
            </div>

            {/* Main Content Area with Sidebar */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left Sidebar Skeleton */}
                <div className="w-[320px] shrink-0 border-r  hidden md:block">
                    <div className="h-full flex flex-col p-4">
                        <div className="flex flex-col items-center pt-4">
                            {/* Profile Image Skeleton */}
                            <Skeleton className="h-24 w-24 rounded-full" />

                            {/* Profile Info Skeleton */}
                            <div className="mt-4 text-center w-full">
                                <Skeleton className="h-8 w-40 mx-auto" />
                                <Skeleton className="h-4 w-full mt-3" />
                                <Skeleton className="h-4 w-full mt-1" />
                                <Skeleton className="h-4 w-3/4 mt-1 mx-auto" />
                            </div>
                        </div>

                        <Separator className="my-4" />

                        {/* Profile Stats Skeleton */}
                        <div className="grid grid-cols-1 gap-4 w-full">
                            <Skeleton className="h-16 w-full rounded-lg" />
                        </div>

                        <Separator className="my-4" />

                        {/* Social Links Skeleton */}
                        <div className="w-full space-y-2">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                        </div>

                        {/* Sidebar Footer Skeleton */}
                        <div className="mt-auto pt-4">
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </div>
                </div>

                {/* Right Content Area Skeleton */}
                <div className="flex-1 overflow-auto w-full">
                    <div className="p-4 md:p-6">
                        {/* Dashboard Header Skeleton */}
                        <div className="flex items-center justify-between mb-6">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-10 w-32" />
                        </div>

                        {/* Subscription Packages Section Skeleton */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <Skeleton className="h-7 w-48" />
                                <Skeleton className="h-9 w-32" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[1, 2, 3].map((i) => (
                                    <Card key={i} className="overflow-hidden">
                                        <Skeleton className="h-2 w-full" />
                                        <CardHeader>
                                            <Skeleton className="h-6 w-24" />
                                            <Skeleton className="h-8 w-32 mt-2" />
                                            <Skeleton className="h-4 w-full mt-2" />
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            <Skeleton className="h-4 w-full" />
                                            <Skeleton className="h-4 w-full" />
                                            <Skeleton className="h-4 w-3/4" />
                                        </CardContent>
                                        <CardFooter>
                                            <Skeleton className="h-6 w-full" />
                                        </CardFooter>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {/* Content Tabs Skeleton */}
                        <div>
                            <Tabs defaultValue="posts" className="w-full">
                                <TabsList className="grid grid-cols-2 w-full sm:w-[200px] mb-4">
                                    <TabsTrigger value="posts" className="flex items-center gap-2">
                                        <Grid3X3 className="h-4 w-4" />
                                        <span>Posts</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="nfts" className="flex items-center gap-2">
                                        <ImageIcon className="h-4 w-4" />
                                        <span>NFTs</span>
                                    </TabsTrigger>
                                </TabsList>

                                {/* Posts Tab Skeleton */}
                                <TabsContent value="posts" className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Skeleton className="h-5 w-32" />
                                        <Skeleton className="h-5 w-16" />
                                    </div>

                                    <div className="space-y-4">
                                        {[1, 2, 3].map((i) => (
                                            <Card key={i}>
                                                <CardHeader className="pb-3">
                                                    <div className="flex items-start gap-3">
                                                        <Skeleton className="h-10 w-10 rounded-full" />
                                                        <div className="flex-1">
                                                            <Skeleton className="h-5 w-32" />
                                                            <Skeleton className="h-4 w-24 mt-1" />
                                                        </div>
                                                        <Skeleton className="h-8 w-8 rounded-md" />
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="pb-3">
                                                    <Skeleton className="h-4 w-full" />
                                                    <Skeleton className="h-4 w-full mt-1" />
                                                    <Skeleton className="h-4 w-3/4 mt-1" />
                                                    <Skeleton className="h-48 w-full mt-3 rounded-lg" />
                                                </CardContent>
                                                <CardFooter className="flex justify-between pt-3 border-t">
                                                    <div className="flex items-center gap-4">
                                                        <Skeleton className="h-5 w-16" />
                                                        <Skeleton className="h-5 w-16" />
                                                        <Skeleton className="h-5 w-8" />
                                                    </div>
                                                    <Skeleton className="h-8 w-24" />
                                                </CardFooter>
                                            </Card>
                                        ))}
                                    </div>
                                </TabsContent>

                                {/* NFTs Tab Skeleton */}
                                <TabsContent value="nfts" className="hidden">
                                    {/* NFT skeletons would go here */}
                                </TabsContent>
                            </Tabs>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

