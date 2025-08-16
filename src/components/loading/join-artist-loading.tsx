"use client"

import { Card, CardContent } from "~/components/shadcn/ui/card"
import { Skeleton } from "~/components/shadcn/ui/skeleton"
import { motion } from "framer-motion"

export default function JoinArtistPageSkeleton() {
    return (
        <div className="">
            <div className="container mx-auto px-4 py-12 md:py-24">
                <div className="max-w-5xl mx-auto">
                    {/* Benefits Section */}
                    <div className="mb-16">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                            className="text-center mb-12"
                        >
                            <Skeleton className="h-10 w-64 mx-auto mb-4" />
                            <Skeleton className="h-5 w-full max-w-2xl mx-auto" />
                        </motion.div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {Array(4)
                                .fill(0)
                                .map((_, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.4 + index * 0.1 }}
                                    >
                                        <Card className="h-full border transition-all duration-300 hover:border-primary hover:shadow-md">
                                            <CardContent className="p-6 flex flex-col items-center text-center">
                                                <Skeleton className="h-16 w-16 rounded-full mb-4" />
                                                <Skeleton className="h-6 w-32 mb-2" />
                                                <Skeleton className="h-4 w-full" />
                                                <Skeleton className="h-4 w-3/4 mt-2" />
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                        </div>
                    </div>

                    {/* CTA Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                        className="bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12 text-center"
                    >
                        <Skeleton className="h-8 w-64 mx-auto mb-4" />
                        <Skeleton className="h-4 w-full max-w-md mx-auto mb-2" />
                        <Skeleton className="h-4 w-3/4 max-w-md mx-auto mb-8" />
                        <Skeleton className="h-12 w-48 rounded-full mx-auto inline-flex items-center justify-center gap-2 px-8">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-4 rounded-full" />
                        </Skeleton>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}

