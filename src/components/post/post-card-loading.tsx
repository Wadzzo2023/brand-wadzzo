import { Skeleton } from "~/components/shadcn/ui/skeleton"

export default function LoadingPostCard() {
    return (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm rounded-lg">
            {/* Card Header */}
            <div className="p-4 pb-0">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        {/* Avatar placeholder */}
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div>
                            <div className="flex items-center gap-2">
                                {/* Name placeholder */}
                                <Skeleton className="h-4 w-24 rounded-md" />
                                {/* Badge placeholder */}
                                <Skeleton className="h-5 w-16 rounded-full" />
                            </div>
                            {/* Date placeholder */}
                            <Skeleton className="h-3 w-16 rounded-md mt-1" />
                        </div>
                    </div>
                    {/* Menu placeholder */}
                    <Skeleton className="h-8 w-8 rounded-md" />
                </div>
            </div>

            {/* Card Content */}
            <div className="p-1 md:p-4">
                <div className="space-y-4">
                    {/* Heading placeholder */}
                    <Skeleton className="h-6 w-3/4 rounded-md" />

                    {/* Content placeholder */}
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-3/4 rounded-md" />
                    </div>

                    {/* Media gallery placeholder */}
                    <div className="space-y-2 min-h-[300px]">
                        <Skeleton className="h-[300px] w-full rounded-lg" />
                    </div>
                </div>
            </div>

            {/* Card Footer */}
            <div className="p-4 pt-0 flex flex-col">
                {/* Stats placeholder */}
                <div className="flex items-center justify-between w-full mb-2">
                    <Skeleton className="h-4 w-16 rounded-md" />
                    <Skeleton className="h-4 w-20 rounded-md" />
                </div>

                {/* Action buttons placeholder */}
                <div className="flex items-center justify-between w-full border-t border-gray-100 dark:border-gray-800 py-1">
                    <Skeleton className="h-8 w-1/4 rounded-md" />
                    <Skeleton className="h-8 w-1/4 rounded-md" />
                    <Skeleton className="h-8 w-1/4 rounded-md" />
                </div>
            </div>
        </div>
    )
}
