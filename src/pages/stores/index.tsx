"use client"

import { Album, MediaType } from "@prisma/client"
import { motion, AnimatePresence } from "framer-motion"
import {
    Music,
    Video,
    ImageIcon,
    CuboidIcon as Cube,

    Crown,
    Filter,
    Search,
    Grid,
    List,
    Loader2,
    Plus,
    ShoppingBag,
    AlbumIcon,
    QrCode,
    Coins,
    Box,
    ExternalLink,
    Calendar,
    Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Input } from "~/components/shadcn/ui/input"
import { Button } from "~/components/shadcn/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/shadcn/ui/dropdown-menu"
import { Badge } from "~/components/shadcn/ui/badge"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "~/components/shadcn/ui/card"
import Image from "next/image"
import { ToggleGroup, ToggleGroupItem } from "~/components/shadcn/ui/toggle-group"
import { api } from "~/utils/api"
import { useInView } from "react-intersection-observer"
import { useRouter } from "next/router"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs"
import { MoreAssetsSkeleton } from "~/components/common/grid-loading"
import { PLATFORM_ASSET } from "~/lib/stellar/constant"
import { format } from "date-fns"
import AssetView from "~/components/common/asset"
import { MarketAssetType } from "~/lib/state/play/use-modal-store"
import NftCreateModal from "~/components/modals/nft-create-modal"
import CreatorStoredAssetModal from "~/components/modals/creator-stored-asset-modal"
import SellPageAssetList from "~/components/sell-page-asset-list"
import SellPageAssetModal from "~/components/modals/sell-page-asset-modal"
import CreateQrCodeModal from "~/components/modals/create-qr-modal"
import { useSession } from "next-auth/react"
import { QRItem } from "~/types/qr"
import { Skeleton } from "~/components/shadcn/ui/skeleton"
import QRCodeModal from "~/components/modals/qr-code-modal"
import toast from "react-hot-toast"

// Define our types
type MainCategory = "STORED" | "PageAsset" | "QR"

type RoyaltyItem = {
    id: string
    title: string
    image: string
    type?: string
    royaltyPercentage?: number
    earnings?: number
}

export default function StoredItemsView() {
    const [activeTab, setActiveTab] = useState<MainCategory>("STORED")
    const [isNFTCreateModalOpen, setIsNFTCreateModalOpen] = useState(false)
    const [isStoredModalOpen, setIsStoredModalOpen] = useState(false)
    const [storedMediaType, setStoredMediaType] = useState<MediaType | "ALL">("ALL")
    const [storedSearchQuery, setStoredSearchQuery] = useState("")
    const [storedSortBy, setStoredSortBy] = useState<"newest" | "oldest" | "price-high" | "price-low">("newest")
    const [storedViewMode, setStoredViewMode] = useState<"grid" | "list">("grid")
    const [selectedStoredItem, setSelectedStoredItem] = useState<MarketAssetType | null>(null)
    const [isOpenPageAssetModal, setIsOpenPageAssetModal] = useState(false)
    const [isOpenQRModal, setIsOpenQRModal] = useState(false)

    // Refs for infinite scroll
    const { ref: storedRef, inView: storedInView } = useInView()
    const { data: session } = useSession()
    const [selectedQRItem, setSelectedQRItem] = useState<QRItem | null>(null)
    const [isQRModalOpen, setIsQRModalOpen] = useState(false)
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

    const qrItems = api.qr.getQRItems.useQuery(undefined, {
        enabled: !!session?.user?.id,
    })
    const deleteQRItem = api.qr.deleteQRItem.useMutation({
        onSuccess: () => {
            toast.success("QR item deleted successfully!")
            qrItems.refetch()
        },
        onError: (error) => {
            toast.error(error.message)
        },
    })
    const isItemActive = (item: QRItem) => {
        const now = new Date()
        return now >= new Date(item.startDate) && now <= new Date(item.endDate)
    }
    const handleViewQR = (item: QRItem) => {
        setSelectedQRItem(item)
        setIsQRModalOpen(true)
    }
    // Stored Items Query
    const {
        data: storedItemsData,
        fetchNextPage: fetchNextStoredItems,
        hasNextPage: hasNextStoredItems,
        isFetchingNextPage: isFetchingNextStoredItems,
        isLoading: isStoredItemsLoading,
    } = api.marketplace.market.getACreatorNfts.useInfiniteQuery(
        {
            limit: 10,
        },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
            enabled: activeTab === "STORED",
        },
    )




    // Handle infinite scroll for stored items
    useEffect(() => {
        if (storedInView && activeTab === "STORED" && hasNextStoredItems && !isFetchingNextStoredItems) {
            fetchNextStoredItems()
        }
    }, [storedInView, activeTab, hasNextStoredItems, isFetchingNextStoredItems, fetchNextStoredItems])


    // Process stored items data
    const getFilteredStoredItems = (): MarketAssetType[] => {
        if (!storedItemsData?.pages) return []

        let items = storedItemsData.pages.flatMap((page) =>
            page.nfts.map((item) => ({
                ...item,
                id: item.id,
                title: item.asset.name ?? "Untitled",
                image: item.asset.thumbnail ?? "/placeholder.svg",
                mediaType: item.asset.mediaType as MediaType,
                price: item.price,
            })),
        )

        // Filter by media type
        if (storedMediaType !== "ALL") {
            items = items.filter((item) => item.mediaType === storedMediaType)
        }

        // Filter by search
        if (storedSearchQuery) {
            items = items.filter((item) => item.title.toLowerCase().includes(storedSearchQuery.toLowerCase()))
        }

        // Sort items
        items.sort((a, b) => {
            switch (storedSortBy) {
                case "price-high":
                    return (b.price ?? 0) - (a.price ?? 0)
                case "price-low":
                    return (a.price ?? 0) - (b.price ?? 0)
                case "oldest":
                    return a.id > b.id ? 1 : -1
                default: // newest
                    return a.id < b.id ? 1 : -1
            }
        })

        return items
    }



    const getMediaTypeIcon = (type: MediaType) => {
        switch (type) {
            case MediaType.MUSIC:
                return <Music className="h-4 w-4" />
            case MediaType.VIDEO:
                return <Video className="h-4 w-4" />
            case MediaType.IMAGE:
                return <ImageIcon className="h-4 w-4" />
            case MediaType.THREE_D:
                return <Cube className="h-4 w-4" />
            default:
                return <ImageIcon className="h-4 w-4" />
        }
    }

    const handleStoredItemClick = (item: MarketAssetType) => {
        setSelectedStoredItem(item)
    }

    return (

        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <h2 className="text-4xl font-semibold text-center">Stores</h2>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => {
                                setIsNFTCreateModalOpen(true)
                            }}
                            className="cursor-pointer">
                            <ShoppingBag className="mr-2 h-4 w-4" />
                            <span>Create NFT</span>
                        </Button>
                        <Button
                            onClick={() => {
                                setIsOpenPageAssetModal(true)
                            }}
                            className="cursor-pointer">
                            <Coins className="mr-2 h-4 w-4" />
                            <span>Sell Page Asset</span>
                        </Button>
                        <Button
                            onClick={() => {
                                setIsOpenQRModal(true)
                            }}
                            className="cursor-pointer">
                            <QrCode className="mr-2 h-4 w-4" />
                            <span>Create QR Code</span>
                        </Button>
                    </div>

                </div>
            </CardHeader>
            <CardContent className="overflow-y-auto  scrollbar-hide h-[calc(100vh-20vh)]">
                <Tabs
                    defaultValue="STORED"
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as MainCategory)}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="STORED" className="flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            NFT
                        </TabsTrigger>
                        <TabsTrigger value="pageAsset" className="flex items-center gap-2">
                            <Coins className="h-4 w-4" />
                            Page Assets
                        </TabsTrigger>
                        <TabsTrigger value="QR" className="flex items-center gap-2">
                            <QrCode className="h-4 w-4" />
                            QR Items
                        </TabsTrigger>
                    </TabsList>

                    {/* STORED ITEMS TAB */}
                    <TabsContent value="STORED" className="pt-4  ">
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search stored items..."
                                    value={storedSearchQuery}
                                    onChange={(e) => setStoredSearchQuery(e.target.value)}
                                    className="pl-8"
                                />
                            </div>

                            <div className="flex gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full sm:w-auto">
                                            <Filter className="h-4 w-4 mr-2" />
                                            Sort
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        <DropdownMenuLabel>Sort Options</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuGroup>
                                            <DropdownMenuItem onClick={() => setStoredSortBy("newest")}>Newest First</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setStoredSortBy("oldest")}>Oldest First</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setStoredSortBy("price-high")}>Price: High to Low</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setStoredSortBy("price-low")}>Price: Low to High</DropdownMenuItem>
                                        </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <ToggleGroup
                                    type="single"
                                    value={storedViewMode}
                                    onValueChange={(value) => value && setStoredViewMode(value as "grid" | "list")}
                                >
                                    <ToggleGroupItem value="grid" aria-label="Grid view">
                                        <Grid className="h-4 w-4" />
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="list" aria-label="List view">
                                        <List className="h-4 w-4" />
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </div>
                        </div>

                        {/* Media Type Filters */}
                        <div className="flex flex-wrap gap-2 mb-6">
                            <Badge
                                variant={storedMediaType === "ALL" ? "default" : "outline"}
                                className="cursor-pointer hover:bg-primary/10 px-3 py-1 text-sm"
                                onClick={() => setStoredMediaType("ALL")}
                            >
                                All Types
                            </Badge>
                            <Badge
                                variant={storedMediaType === MediaType.MUSIC ? "default" : "outline"}
                                className="cursor-pointer hover:bg-primary/10 px-3 py-1 text-sm"
                                onClick={() => setStoredMediaType(MediaType.MUSIC)}
                            >
                                <Music className="h-3 w-3 mr-1" />
                                Music
                            </Badge>
                            <Badge
                                variant={storedMediaType === MediaType.VIDEO ? "default" : "outline"}
                                className="cursor-pointer hover:bg-primary/10 px-3 py-1 text-sm"
                                onClick={() => setStoredMediaType(MediaType.VIDEO)}
                            >
                                <Video className="h-3 w-3 mr-1" />
                                Video
                            </Badge>
                            <Badge
                                variant={storedMediaType === MediaType.IMAGE ? "default" : "outline"}
                                className="cursor-pointer hover:bg-primary/10 px-3 py-1 text-sm"
                                onClick={() => setStoredMediaType(MediaType.IMAGE)}
                            >
                                <ImageIcon className="h-3 w-3 mr-1" />
                                Image
                            </Badge>
                            <Badge
                                variant={storedMediaType === MediaType.THREE_D ? "default" : "outline"}
                                className="cursor-pointer hover:bg-primary/10 px-3 py-1 text-sm"
                                onClick={() => setStoredMediaType(MediaType.THREE_D)}
                            >
                                <Cube className="h-3 w-3 mr-1" />
                                3D
                            </Badge>
                        </div>

                        {isStoredItemsLoading ? (
                            <MoreAssetsSkeleton className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4  xl:grid-cols-5" />
                        ) : (
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`stored-${storedMediaType}-${storedViewMode}-${storedSortBy}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    transition={{ duration: 0.2 }}
                                    className={
                                        storedViewMode === "grid"
                                            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                                            : "flex flex-col gap-4"
                                    }
                                >
                                    {getFilteredStoredItems().length > 0 ? (
                                        <>
                                            {getFilteredStoredItems().map((item) => (
                                                <motion.div
                                                    key={item.id}
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    transition={{ duration: 0.2 }}
                                                    className={storedViewMode === "list" ? "w-full" : ""}
                                                >
                                                    {storedViewMode === "grid" ? (
                                                        <div
                                                            className=""
                                                            onClick={() => {
                                                                setIsStoredModalOpen(true)
                                                                handleStoredItemClick(item)
                                                            }}
                                                        >
                                                            <AssetView code={item.asset.name} thumbnail={item.asset.thumbnail}
                                                                isNFT={true} creatorId={item.asset.creatorId}
                                                                price={item.price}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <Card className="overflow-hidden cursor-pointer" onClick={() => handleStoredItemClick(item)}>
                                                            <div className="flex">
                                                                <div className="relative w-24 h-24">
                                                                    <Image
                                                                        src={item.asset.thumbnail ?? "/placeholder.svg"}
                                                                        alt={item.asset.name}
                                                                        fill
                                                                        className="object-cover"
                                                                    />
                                                                </div>
                                                                <CardContent className="flex-1 p-4">
                                                                    <div className="flex justify-between items-start">
                                                                        <div>
                                                                            <h3 className="font-semibold">{item.asset.name}</h3>
                                                                        </div>
                                                                        <div className="flex flex-col items-end gap-1">
                                                                            {item.price && item.price > 0 && (
                                                                                <Badge>
                                                                                    {item.price} {PLATFORM_ASSET.code}
                                                                                </Badge>
                                                                            )}
                                                                            <Badge variant="outline" className="text-xs">
                                                                                {getMediaTypeIcon(item.asset.mediaType)}
                                                                                <span className="ml-1">{item.asset.mediaType}</span>
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                </CardContent>
                                                            </div>
                                                        </Card>
                                                    )}
                                                </motion.div>
                                            ))}

                                            {/* Infinite scroll loading indicator */}
                                            {(hasNextStoredItems ?? isFetchingNextStoredItems) && (
                                                <div ref={storedRef} className="col-span-full flex justify-center py-8">
                                                    {isFetchingNextStoredItems ? (
                                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                    ) : (
                                                        <Button variant="outline" onClick={() => fetchNextStoredItems()}>
                                                            Load More
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                                            <div className="rounded-full bg-muted p-6 mb-4">
                                                <Search className="h-10 w-10 text-muted-foreground" />
                                            </div>
                                            <h3 className="text-lg font-medium">No stored items found</h3>
                                            <p className="text-muted-foreground mt-1">Try adjusting your search or filter criteria</p>
                                            <Button
                                                variant="outline"
                                                className="mt-4"
                                                onClick={() => {
                                                    setStoredMediaType("ALL")
                                                    setStoredSearchQuery("")
                                                }}
                                            >
                                                Reset Filters
                                            </Button>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        )}
                    </TabsContent>

                    {/* ALBUMS TAB */}
                    <TabsContent value="QR" className="pt-4">
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {qrItems.isLoading && (
                                    <>
                                        {[1, 2, 3, 4, 5, 6].map((i) => (
                                            <Card key={i}>
                                                <CardHeader>
                                                    <Skeleton className="h-6 w-3/4" />
                                                    <Skeleton className="h-4 w-1/2" />
                                                </CardHeader>
                                                <CardContent>
                                                    <Skeleton className="h-4 w-full mb-2" />
                                                    <Skeleton className="h-4 w-2/3 mb-4" />
                                                    <div className="flex gap-2">
                                                        <Skeleton className="h-8 w-20" />
                                                        <Skeleton className="h-8 w-20" />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </>
                                )}

                                {qrItems.data?.map((item) => (
                                    <Card key={item.id} className="relative">
                                        <CardHeader>
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <CardTitle className="text-lg">{item.title}</CardTitle>
                                                    <CardDescription className="mt-1">
                                                        {/* Updated to work with descriptions array */}
                                                        {item.descriptions && item.descriptions.length > 0 ? (
                                                            <div className="space-y-1">
                                                                <div className="font-medium text-sm">
                                                                    {item.descriptions.sort((a, b) => a.order - b.order)[0]?.title}
                                                                </div>
                                                                <div>
                                                                    {item.descriptions[0]?.content && item.descriptions[0].content.length > 100
                                                                        ? `${item.descriptions[0].content.slice(0, 100)}...`
                                                                        : item.descriptions[0]?.content}
                                                                </div>
                                                                {item.descriptions.length > 1 && (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        +{item.descriptions.length - 1} more description
                                                                        {item.descriptions.length > 2 ? "s" : ""}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            "No descriptions available"
                                                        )}
                                                    </CardDescription>
                                                </div>
                                                <Badge variant={isItemActive(item) ? "default" : "secondary"}>
                                                    {isItemActive(item) ? "Active" : "Inactive"}
                                                </Badge>
                                            </div>
                                        </CardHeader>

                                        <CardContent className="space-y-4">
                                            {/* Item Details */}
                                            <div className="space-y-2 text-sm">
                                                {item.modelUrl && (
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <Box className="h-4 w-4" />
                                                        <span>3D Model included</span>
                                                    </div>
                                                )}
                                                {item.externalLink && (
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <ExternalLink className="h-4 w-4" />
                                                        <span>External link included</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Calendar className="h-4 w-4" />
                                                    <span>
                                                        {format(new Date(item.startDate), "MMM dd")} -{" "}
                                                        {format(new Date(item.endDate), "MMM dd, yyyy")}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 pt-2">
                                                <Button size="sm" variant="outline" onClick={() => handleViewQR(item)} className="gap-1 flex-1">
                                                    <QrCode className="h-4 w-4" />
                                                    View QR
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        if (confirm("Are you sure you want to delete this QR item?")) {
                                                            deleteQRItem.mutate({ id: item.id })
                                                        }
                                                    }}
                                                    disabled={deleteQRItem.isLoading}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                                {qrItems.data?.length === 0 && !qrItems.isLoading && (
                                    <div className="col-span-full">
                                        <Card className="p-12 text-center">
                                            <QrCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                            <h3 className="text-lg font-medium mb-2">No QR Items Yet</h3>
                                            <p className="text-muted-foreground mb-4">Create your first QR item to get started</p>

                                        </Card>
                                    </div>
                                )}
                            </div>

                            {/* QR Code Modal */}
                            {selectedQRItem && (
                                <QRCodeModal
                                    isOpen={isQRModalOpen}
                                    onClose={() => {
                                        setIsQRModalOpen(false)
                                        setSelectedQRItem(null)
                                    }}
                                    qrItem={selectedQRItem}
                                />
                            )}
                        </>
                    </TabsContent>
                    <TabsContent value="pageAsset" className="pt-4">
                        <SellPageAssetList />
                    </TabsContent>
                </Tabs>
                {
                    isNFTCreateModalOpen && (
                        <NftCreateModal
                            isOpen={isNFTCreateModalOpen}
                            onClose={() => setIsNFTCreateModalOpen(false)}
                        />
                    )
                }
                {
                    isStoredModalOpen && (
                        <CreatorStoredAssetModal
                            data={selectedStoredItem}
                            onClose={() => setIsStoredModalOpen(false)}
                            isOpen={isStoredModalOpen}
                        />
                    )
                }
                {
                    isOpenPageAssetModal && (
                        <SellPageAssetModal
                            isOpen={isOpenPageAssetModal}
                            onClose={() => setIsOpenPageAssetModal(false)}
                        />
                    )
                }
                {
                    isOpenQRModal && (
                        <CreateQrCodeModal
                            open={isOpenQRModal}
                            onClose={() => setIsOpenQRModal(false)}
                        />
                    )
                }
            </CardContent>
        </Card>

    )
}

