"use client"

import type { Location, LocationGroup } from "@prisma/client"
import { Check, ChevronDown, Trash2, X, User, MapPin } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import toast from "react-hot-toast"

import { Button } from "~/components/shadcn/ui/button"
import { Card, CardContent, CardHeader } from "~/components/shadcn/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/shadcn/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs"
import { Badge } from "~/components/shadcn/ui/badge"
import { Checkbox } from "~/components/shadcn/ui/checkbox"
import { Separator } from "~/components/shadcn/ui/separator"
import { api } from "~/utils/api"
import { CREATOR_TERM } from "~/utils/term"
import { PinInfoUpdateModal } from "~/components/modals/pin-info-update-modal"

interface pinData {
    image: string
    title: string
    description: string
    id: string
    startDate?: Date
    endDate?: Date
    collectionLimit?: number
    remainingLimit?: number
    multiPin?: boolean
    autoCollect?: boolean
    lat?: number
    long?: number
    link?: string
}

// Enhanced loading skeleton component
function LoadingSkeleton() {
    return (
        <div className="w-full p-6 space-y-6">
            <div className="flex space-x-1 mb-8">
                <div className="h-10 w-32 bg-gray-200 animate-pulse rounded-md"></div>
                <div className="h-10 w-32 bg-gray-200 animate-pulse rounded-md"></div>
            </div>

            {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="w-full">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-5 w-5 bg-gray-200 animate-pulse rounded"></div>
                                <div className="h-5 w-48 bg-gray-200 animate-pulse rounded"></div>
                            </div>
                            <div className="h-8 w-8 bg-gray-200 animate-pulse rounded"></div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {Array.from({ length: 2 }).map((_, j) => (
                            <Card key={j} className="border-l-4 border-l-blue-200">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-2">
                                            <div className="h-4 w-40 bg-gray-200 animate-pulse rounded"></div>
                                            <div className="h-3 w-56 bg-gray-200 animate-pulse rounded"></div>
                                        </div>
                                        <div className="h-8 w-8 bg-gray-200 animate-pulse rounded"></div>
                                    </div>
                                </CardHeader>
                            </Card>
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

// Main Pins component with enhanced UI
export default function Pins() {
    const [viewMode, setViewMode] = useState<"pending" | "approved">("pending")

    // Separate queries for pending and approved pins
    const pendingLocationGroups = api.maps.pin.getLocationGroups.useQuery(undefined, {
        enabled: viewMode === "pending",
    })

    const approvedLocationGroups = api.maps.pin.getApprovedLocationGroups.useQuery(undefined, {
        enabled: viewMode === "approved",
    })

    // Determine which data to use based on current view mode
    const locationGroups = viewMode === "pending" ? pendingLocationGroups : approvedLocationGroups

    if (locationGroups.isLoading) return <LoadingSkeleton />
    if (locationGroups.error) {
        return (
            <div className="w-full p-6">
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <div className="text-red-800">Error: {locationGroups.error.message}</div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="w-full p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Pin Management</h1>
                <Badge variant="outline" className="text-sm">
                    {locationGroups.data?.length || 0} groups
                </Badge>
            </div>

            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "pending" | "approved")} className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="pending" className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-yellow-500 rounded-full"></div>
                        Pending Pins
                    </TabsTrigger>
                    <TabsTrigger value="approved" className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                        Approved Pins
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="mt-6">
                    {locationGroups.data && (
                        <GroupPins groups={locationGroups.data} mode="pending" refetch={locationGroups.refetch} />
                    )}
                </TabsContent>

                <TabsContent value="approved" className="mt-6">
                    {locationGroups.data && (
                        <GroupPins groups={locationGroups.data} mode="approved" refetch={locationGroups.refetch} />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

type GroupPins = LocationGroup & {
    locations: Location[]
    creator: { name: string; id: string }
}

type Group = Record<string, GroupPins[]>

function GroupPins({
    groups,
    mode,
    refetch,
}: {
    groups: GroupPins[]
    mode: "pending" | "approved"
    refetch: () => void
}) {
    const groupByCreator: Record<string, GroupPins[]> = {}
    groups.forEach((group) => {
        const creatorId = group.creator.id
        if (!groupByCreator[creatorId]) {
            groupByCreator[creatorId] = []
        }
        groupByCreator[creatorId].push(group)
    })

    if (Object.keys(groupByCreator).length === 0) {
        return (
            <Card className="w-full">
                <CardContent className="pt-6">
                    <div className="text-center py-12">
                        <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No pins found</h3>
                        <p className="text-gray-500">
                            {mode === "pending" ? "No pending pins to review." : "No approved pins available."}
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="w-full space-y-4">
            <PinsList groupsByCreator={groupByCreator} mode={mode} refetch={refetch} />
        </div>
    )
}

function PinsList({
    groupsByCreator,
    mode,
    refetch,
}: {
    groupsByCreator: Record<string, GroupPins[]>
    mode: "pending" | "approved"
    refetch: () => void
}) {
    const [selectedGroup, setSelectedGroup] = useState<string[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [pinData, setPinData] = useState<pinData | undefined>(undefined)

    const approveM = api.maps.pin.approveLocationGroups.useMutation({
        onSuccess: (data, variable) => {
            if (variable.approved) toast.success("Pins Approved Successfully!")
            if (!variable.approved) toast.error("Pins Rejected Successfully!")
            setSelectedGroup([])
            refetch()
        },
        onError: (error) => {
            toast.error("Operation failed: " + error.message)
        },
    })

    const deleteGroupM = api.maps.pin.deleteLocationGroupForAdmin.useMutation({
        onSuccess: () => {
            toast.success("Pin group deleted successfully!")
            refetch()
        },
        onError: (error) => {
            toast.error("Failed to delete: " + error.message)
        },
    })

    const deletePinM = api.maps.pin.deletePinForAdmin.useMutation({
        onSuccess: () => {
            toast.success("Pin deleted successfully!")
            refetch()
        },
        onError: (error) => {
            toast.error("Failed to delete pin: " + error.message)
        },
    })

    function handleGroupSelection(groupId: string) {
        setSelectedGroup((prev) => {
            if (prev.includes(groupId)) {
                return prev.filter((id) => id !== groupId)
            } else {
                return [...prev, groupId]
            }
        })
    }

    function handleDeletePin(pinId: string) {
        deletePinM.mutate({ id: pinId })
    }

    function handleDeleteGroup(groupId: string) {
        deleteGroupM.mutate({ id: groupId })
    }

    return (
        <div className="w-full space-y-6">
            <div className="space-y-4">
                {Object.entries(groupsByCreator).map(([creatorId, creatorGroups]) => {
                    const creatorName = creatorGroups[0]?.creator.name ?? "Unknown Creator"
                    const groupPins: Group = {}

                    creatorGroups.forEach((group) => {
                        const locationGroupId = group.id
                        if (groupPins[locationGroupId]) {
                            groupPins[locationGroupId].push(group)
                        } else {
                            groupPins[locationGroupId] = [group]
                        }
                    })

                    return (
                        <Card key={`creator-${creatorId}`} className="w-full">
                            <Collapsible className="w-full">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <User className="h-5 w-5 text-gray-500" />
                                            <div>
                                                <h4 className="font-semibold text-gray-900">
                                                    {CREATOR_TERM}: {creatorName}
                                                </h4>
                                                <p className="text-sm text-gray-500">
                                                    {Object.keys(groupPins).length} pin group{Object.keys(groupPins).length !== 1 ? "s" : ""}
                                                </p>
                                            </div>
                                        </div>
                                        <CollapsibleTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                <ChevronDown className="h-4 w-4" />
                                                <span className="sr-only">Toggle creator pins</span>
                                            </Button>
                                        </CollapsibleTrigger>
                                    </div>
                                </CardHeader>

                                <CollapsibleContent>
                                    <CardContent className="pt-0 space-y-4">
                                        {Object.entries(groupPins).map(([key, pins]) => (
                                            <Card key={key} className="border-l-4 border-l-blue-500">
                                                <Collapsible className="w-full">
                                                    <CardHeader className="pb-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3 flex-grow overflow-hidden">
                                                                {mode === "pending" && (
                                                                    <Checkbox
                                                                        checked={selectedGroup.includes(key)}
                                                                        onCheckedChange={() => handleGroupSelection(key)}
                                                                    />
                                                                )}
                                                                <div className="flex flex-col overflow-hidden">
                                                                    <h5 className="font-medium text-gray-900 truncate">{pins[0]?.title}</h5>
                                                                    <p className="text-sm text-gray-600 truncate">{pins[0]?.description}</p>
                                                                    <Badge variant="secondary" className="w-fit mt-1">
                                                                        {pins[0]?.locations.length} location{pins[0]?.locations.length !== 1 ? "s" : ""}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {mode === "approved" && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            handleDeleteGroup(key)
                                                                        }}
                                                                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                )}
                                                                <CollapsibleTrigger asChild>
                                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                                        <ChevronDown className="h-4 w-4" />
                                                                    </Button>
                                                                </CollapsibleTrigger>
                                                            </div>
                                                        </div>
                                                    </CardHeader>

                                                    <CollapsibleContent>
                                                        <CardContent className="pt-0">
                                                            <Separator className="mb-4" />
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full">
                                                                    <thead>
                                                                        <tr className="border-b">
                                                                            <th className="text-left py-2 px-3 font-medium text-gray-700">Image</th>
                                                                            <th className="text-left py-2 px-3 font-medium text-gray-700">Location ID</th>
                                                                            <th className="text-left py-2 px-3 font-medium text-gray-700">Coordinates</th>
                                                                            {mode === "approved" && (
                                                                                <th className="text-left py-2 px-3 font-medium text-gray-700">Actions</th>
                                                                            )}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {pins.map((pin) =>
                                                                            pin.locations.map((location, index) => (
                                                                                <tr
                                                                                    key={location.id}
                                                                                    className={`border-b border-gray-100 ${index % 2 === 0 ? "bg-white" : "bg-gray-50"
                                                                                        }`}
                                                                                >
                                                                                    <td className="py-3 px-3">
                                                                                        <img
                                                                                            alt="pin image"
                                                                                            width={40}
                                                                                            height={40}
                                                                                            src={pin.image ?? "https://bandcoin.io/images/logo.png"}
                                                                                            className="h-10 w-10 object-cover rounded-md border"
                                                                                        />
                                                                                    </td>
                                                                                    <td className="py-3 px-3">
                                                                                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                                                                                            {location.id.slice(0, 8)}...
                                                                                        </code>
                                                                                    </td>
                                                                                    <td className="py-3 px-3 text-sm text-gray-600">
                                                                                        <div className="flex flex-col">
                                                                                            <span>Lat: {location.latitude.toFixed(6)}</span>
                                                                                            <span>Lng: {location.longitude.toFixed(6)}</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    {mode === "approved" && (
                                                                                        <td className="py-3 px-3">
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                                onClick={() => handleDeletePin(location.id)}
                                                                                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                                            >
                                                                                                <Trash2 className="h-3 w-3" />
                                                                                            </Button>
                                                                                        </td>
                                                                                    )}
                                                                                </tr>
                                                                            )),
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </CardContent>
                                                    </CollapsibleContent>
                                                </Collapsible>
                                            </Card>
                                        ))}
                                    </CardContent>
                                </CollapsibleContent>
                            </Collapsible>
                        </Card>
                    )
                })}
            </div>

            {mode === "pending" && selectedGroup.length > 0 && (
                <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Badge variant="secondary">{selectedGroup.length} selected</Badge>
                                <span className="text-sm text-gray-600">Ready to approve or reject selected pin groups</span>
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    onClick={() =>
                                        approveM.mutate({
                                            locationGroupIds: selectedGroup,
                                            approved: false,
                                        })
                                    }
                                    disabled={approveM.isLoading}
                                    variant="destructive"
                                >
                                    <X className="h-4 w-4 mr-2" />
                                    Reject
                                </Button>
                                <Button
                                    onClick={() => {
                                        approveM.mutate({
                                            locationGroupIds: selectedGroup,
                                            approved: true,
                                        })
                                    }}
                                    disabled={approveM.isLoading}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    <Check className="h-4 w-4 mr-2" />
                                    Approve
                                </Button>

                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {pinData && <PinInfoUpdateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} pinData={pinData} />}
        </div>
    )
}
