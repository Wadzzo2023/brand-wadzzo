import { Card, CardContent, CardFooter, CardHeader } from "~/components/shadcn/ui/card"

export default function BountySkeleton() {
    return (
        <Card className="flex h-full flex-col overflow-hidden">
            <CardHeader className="relative p-0">
                <div className="h-48 w-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            </CardHeader>
            <CardContent className="flex-grow p-6">
                <div className="h-6 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-3 animate-pulse" />
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2 animate-pulse" />
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2 animate-pulse" />
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
                <div className="flex justify-between">
                    <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
            </CardContent>
            <CardFooter className="bg-gray-100 dark:bg-gray-800 p-4">
                <div className="flex justify-between w-full">
                    <div className="h-4 w-1/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-4 w-1/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
            </CardFooter>
        </Card>
    )
}

