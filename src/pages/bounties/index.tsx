import { useEffect, useState } from "react"
import BountyList from "~/components/bounty/bounty-list";
import BountySkeleton from "~/components/bounty/bounty-skeleton";
import SearchAndSort from "~/components/bounty/search-and-sort";
import { Button } from "~/components/shadcn/ui/button";
import { sortOptionEnum } from "~/types/bounty/bounty-type";
import { api } from "~/utils/api"

export enum filterEnum {
    ALL = "ALL",
    NOT_JOINED = "NOT_JOINED",
    JOINED = "JOINED",
}

const CreatorBounty = () => {
    const [searchTerm, setSearchTerm] = useState("")
    const [sortOption, setSortOption] = useState<sortOptionEnum>(sortOptionEnum.DATE_DESC);
    const [filter, setFilter] = useState<filterEnum>(filterEnum.ALL)
    const debouncedSearchTerm = useDebounce(searchTerm, 500)
    const getAllBounty = api.bounty.Bounty.getAllBountyByUserId.useInfiniteQuery(
        {
            limit: 10,
            search: debouncedSearchTerm,
            sortBy: sortOption,

        },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
    )

    return (

        <div className=" min-h-screen  w-full ">
            <div className="sticky top-0 z-10 ">
                <SearchAndSort
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    sortOption={sortOption}
                    setSortOption={setSortOption}
                    filter={filter}

                />

            </div>

            <div className="my-4 flex min-h-[calc(100vh-20vh)]  flex-col gap-4 px-4">

                <div className="">
                    {
                        getAllBounty.isLoading &&
                        <div className=" grid gap-6 sm:grid-cols-2 lg:grid-cols-3 " > {Array.from({ length: 5 }, (_, index: number) => (< BountySkeleton key={index} />))} </ div >
                    }
                    {getAllBounty.data?.pages.map((page) => (
                        <BountyList key={page.nextCursor} bounties={page.bounties} />


                    ))}
                </div>
                {getAllBounty.hasNextPage && (
                    <Button
                        className="flex w-1/2 items-center justify-center  shadow-sm shadow-black md:w-1/4"
                        onClick={() => void getAllBounty.fetchNextPage()}
                        disabled={getAllBounty.isFetchingNextPage}
                    >
                        {getAllBounty.isFetchingNextPage ? "Loading more..." : "Load More"}
                    </Button>
                )}
            </div>
            {

            }
        </div>

    )
}

const useDebounce = (value: string, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(handler)
        }
    }, [value, delay])

    return debouncedValue
}

export default CreatorBounty


