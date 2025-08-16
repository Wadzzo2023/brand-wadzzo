import clsx from "clsx";
import { Card, CardContent } from "~/components/shadcn/ui/card"
import { Skeleton } from "~/components/shadcn/ui/skeleton"

interface skeletonProps {
    className?: string;
}
export function MoreAssetsSkeleton({ className }: skeletonProps) {
    return (
        <div

            className={clsx("", className)}
        >
            <MarketAssetSkeleton />
            <MarketAssetSkeleton />
            <MarketAssetSkeleton />
            <MarketAssetSkeleton />
            <MarketAssetSkeleton />
            <MarketAssetSkeleton />


        </div>
    );
}

function MarketAssetSkeleton() {
    return (
        <Card className="group relative overflow-hidden rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/20">
            <CardContent className="p-0 h-[211px] md:h-[270px] lg:h-[300px] w-full">
                <div className="relative h-full w-full">
                    <Skeleton className="h-full w-full" />
                    <div className="absolute inset-x-0 bottom-1 left-1 right-1 p-0">
                        <div className="rounded-lg p-2">
                            <Skeleton className="h-6 w-3/4 mb-2" />
                            <div className="flex gap-2">
                                <Skeleton className="h-5 w-16" />
                                <Skeleton className="h-5 w-16" />
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
