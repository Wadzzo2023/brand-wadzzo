"use client"
import { updateMapFormSchema } from "~/types/pin-edit"

import {
    Copy,
    Edit3,
    Loader2,
    MapPin,
    Scissors,
    ShieldBan,
    ShieldCheck,
    Trash2,
    Calendar,
    LinkIcon,
    ImageIcon,
    Users,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Check,
    Info,
} from "lucide-react"
import { useSession } from "next-auth/react"
import Image from "next/image"
import React, { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "~/components/shadcn/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { api } from "~/utils/api"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation" // Changed from next/router to next/navigation
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"
import { Input } from "~/components/shadcn/ui/input"
import type { ItemPrivacy } from "@prisma/client" // Added PinType
import { Label } from "~/components/shadcn/ui/label"
import { useCreatorStorageAcc } from "~/lib/state/wallete/stellar-balances"
import { BADWORDS } from "~/utils/banned-word"
import { motion, AnimatePresence } from "framer-motion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs"
import { Textarea } from "~/components/shadcn/ui/textarea"
import { Badge } from "~/components/shadcn/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Separator } from "~/components/shadcn/ui/separator"
import { useMapInteractionStore } from "~/store/map-stores" // Changed to useMapInteractionStore

// Re-using the Pin type from map-stores.ts for consistency
import type { Location, LocationGroup } from "@prisma/client"
import { PinType as PinTypeEnum } from "@prisma/client" // Declare PinType
import { UploadS3Button } from "../common/upload-button"
import { useCopyCutModalStore } from "~/store/copy-cut-modal-store"

type Pin = {
    locationGroup:
    | (LocationGroup & {
        creator: { profileUrl: string | null };
    })
    | null;
    _count: {
        consumers: number;
    };
} & Location;

// Define types for assets and pins
type AssetType = {
    id: number
    code: string
    issuer: string
    thumbnail: string
}

export const PAGE_ASSET_NUM = -10
export const NO_ASSET = -99

const MapOptionModal = () => {
    const {
        selectedPinForDetail: data, // Use selectedPinForDetail from the store as 'data'
        closePinDetailModal: handleClose, // Use closePinDetailModal from the store
        isPinCut,
        isPinCopied,
        setPinCopied,
        setPinCut,
        setIsAutoCollect, // This is for the copiedPinData, not the current pin's autoCollect
        setManual,
        setDuplicate,
        setPrevData,
    } = useMapInteractionStore()

    const session = useSession()
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<string>("details")
    const utils = api.useUtils()
    const pinM = api.maps.pin.getPinM.useMutation({
        onSuccess: (data) => {
            setPrevData(data)
            handleClose()
            setManual(true)
            setDuplicate(true)
            // The new-pin page reads prevData from the store to pre-fill.
            router.push("/pins/new?duplicate=1")
        },
    })

    const ToggleAutoCollectMutation = api.maps.pin.toggleAutoCollect.useMutation({
        onSuccess: () => {
            toast.success(`Auto collect ${data?.autoCollect ? "disabled" : "enabled"} successfully`)
            handleClose() // Close the modal after action
        },
        onError: (error) => {
            toast.error(error.message)
        },
    })

    const handleToggleAutoCollect = async (pinId: string | undefined) => {
        if (pinId && data?.locationGroup) {
            ToggleAutoCollectMutation.mutate({
                id: pinId,
                isAutoCollect: !data.autoCollect, // Toggle based on current state
            })
        } else {
            toast.error("Pin Id not found or data is incomplete.")
        }
    }

    const handleCopyPin = () => {
        if (data) {
            navigator.clipboard.writeText(data.id) // Copy pin ID
            setPinCopied(true, data) // Set copied state and store pin data
            toast.success("Pin ID copied to clipboard")

        } else {
            toast.error("No pin selected to copy.")
        }
    }

    const DeletePin = api.maps.pin.deletePin.useMutation({
        onSuccess: async (data) => {
            if (data.item) {
                await utils.maps.pin.getCreatorPins.refetch()

                toast.success("Pin deleted successfully")
                handleClose()
            } else {
                toast.error("Pin not found or You are not authorized to delete this pin")
            }
        },
        onError: (error) => {
            toast.error(error.message)
            console.error(error)
        },
    })

    const handleDelete = () => {
        if (data?.id) {
            DeletePin.mutate({ id: data.id })
        } else {
            toast.error("No pin selected to delete.")
        }
    }

    const handleCutPin = () => {
        if (data) {
            setPinCut(true, data) // Set cut state and store pin data

            toast.success("Pin ready to move")

        } else {
            toast.error("No pin selected to cut.")
        }
    }

    // If no pin is selected, don't render the modal
    if (!data) {
        return null
    }

    // Check for user session before rendering actions that require it
    if (!session?.data?.user?.id) {
        // If no session, only show details, or a message
        // For now, we'll just return null if no data, as the parent handles open/close
        // and this component only renders if data is present.
        // If you want to show a "login to edit" message, you'd put it here.
    }

    return (
        <AnimatePresence>
            <Dialog open={!!data && !isPinCopied && !isPinCut} onOpenChange={handleClose}>
                <DialogContent className="m-auto flex max-h-[90vh] w-full max-w-2xl flex-col p-0 overflow-hidden">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col h-full"
                    >
                        <DialogHeader className="bg-linear-to-r from-primary/10 to-primary/5 px-6 py-4">
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <MapPin className="h-5 w-5 " />
                                {data?.locationGroup?.title ?? "Pin Details"}
                            </DialogTitle>
                        </DialogHeader>
                            <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                                <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab} className="w-full">
                                    <TabsList className="grid w-full grid-cols-2 mb-4">
                                        <TabsTrigger
                                            value="details"
                                            className="data-[state=active]:bg-primary data-[state=active]:shadow-xs data-[state=active]:shadow-foreground"
                                        >
                                            Pin Details
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="actions"
                                            className="data-[state=active]:bg-primary data-[state=active]:shadow-xs data-[state=active]:shadow-foreground"
                                        >
                                            Actions
                                        </TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="details" className="mt-0">
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                                            <PinInfo data={data} isLoading={pinM.isPending} />
                                        </motion.div>
                                    </TabsContent>
                                    <TabsContent value="actions" className="mt-0">
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.3 }}
                                            className="grid grid-cols-1 md:grid-cols-2 gap-2"
                                        >
                                            <Button
                                                variant="outline"
                                                className="flex h-auto items-center justify-start gap-2 py-3 bg-transparent"
                                                onClick={() => {
                                                    handleClose()
                                                    router.push(`/pins/${data.id}/edit`)
                                                }}
                                            >
                                                                                                    <>
                                                        <div className="rounded-full bg-primary/10 p-2">
                                                            <Edit3 size={18} className="" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">Edit Pin</div>
                                                            <div className="text-xs text-muted-foreground">Modify pin details</div>
                                                        </div>
                                                    </>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                type="button"
                                                className="flex h-auto items-center justify-start gap-2 py-3 bg-transparent"
                                                onClick={() => {
                                                    data.id && pinM.mutate(data.id)
                                                }}
                                                disabled={pinM.isPending}
                                            >
                                                {pinM.isPending ? (
                                                    <Loader2 className="h-5 w-5 " />
                                                ) : (
                                                    <>
                                                        <div className="rounded-full bg-primary/10 p-2">
                                                            <Copy size={18} className="" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">Duplicate Pin</div>
                                                            <div className="text-xs text-muted-foreground">Create a copy of this pin</div>
                                                        </div>
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex h-auto items-center justify-start gap-2 py-3 bg-transparent"
                                                onClick={handleCopyPin}
                                                disabled={isPinCopied}
                                            >
                                                {isPinCopied ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="rounded-full bg-success/10 p-2">
                                                            <Check size={18} className="text-success" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">Copied!</div>
                                                            <div className="text-xs text-muted-foreground">Pin ID copied to clipboard</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="rounded-full bg-primary/10 p-2">
                                                            <Copy size={18} className="" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">Copy Pin ID</div>
                                                            <div className="text-xs text-muted-foreground">Copy pin identifier</div>
                                                        </div>
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex h-auto items-center justify-start gap-2 py-3 bg-transparent"
                                                onClick={handleCutPin}
                                                disabled={isPinCut}
                                            >
                                                {isPinCut ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="rounded-full bg-success/10 p-2">
                                                            <Check size={18} className="text-success" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">Cut!</div>
                                                            <div className="text-xs text-muted-foreground">Pin ready to move</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="rounded-full bg-primary/10 p-2">
                                                            <Scissors size={18} className="" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">Cut Pin</div>
                                                            <div className="text-xs text-muted-foreground">Move pin to new location</div>
                                                        </div>
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex h-auto items-center justify-start gap-2 py-3 bg-transparent"
                                                onClick={() => {
                                                    handleClose()
                                                    router.push(`/reports/${data.id}`)

                                                }}
                                            >
                                                <div className="rounded-full bg-primary/10 p-2">
                                                    <Users size={18} className="" />
                                                </div>
                                                <div className="text-left">
                                                    <div className="font-medium">Show Collectors</div>
                                                    <div className="text-xs text-muted-foreground">View who collected this pin</div>
                                                </div>
                                            </Button>
                                            <Button
                                                variant={data?.autoCollect ? "destructive" : "outline"}
                                                className="flex h-auto items-center justify-start gap-2 py-3"
                                                onClick={() => handleToggleAutoCollect(data.id)}
                                                disabled={ToggleAutoCollectMutation.isPending}
                                            >
                                                {ToggleAutoCollectMutation.isPending ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-5 w-5 animate-spin" />
                                                        <div className="text-left">
                                                            <div className="font-medium">Updating...</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div
                                                            className={`${data.autoCollect ? "bg-destructive/20" : "bg-primary/10"} rounded-full p-2`}
                                                        >
                                                            {data.autoCollect ? (
                                                                <ShieldBan size={18} className="text-destructive-foreground" />
                                                            ) : (
                                                                <ShieldCheck size={18} className="" />
                                                            )}
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">
                                                                {data?.autoCollect ? "Disable" : "Enable"} Auto Collect
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {data?.autoCollect ? "Turn off" : "Turn on"} automatic collection
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                className="col-span-1 flex h-auto items-center justify-start gap-2 py-3 md:col-span-2"
                                                onClick={handleDelete}
                                                disabled={DeletePin.isPending || data.hidden}
                                            >
                                                {DeletePin.isPending ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-5 w-5 animate-spin text-destructive-foreground" />
                                                        <div className="text-left">
                                                            <div className="font-medium">Deleting...</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="rounded-full bg-destructive/20 p-2">
                                                            <Trash2 size={18} className="text-destructive-foreground" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-medium">Delete Pin</div>
                                                            <div className="text-xs text-destructive-foreground/80">Permanently remove this pin</div>
                                                        </div>
                                                    </>
                                                )}
                                            </Button>
                                        </motion.div>
                                    </TabsContent>
                                </Tabs>
                            </div>
                    </motion.div>
                </DialogContent>
            </Dialog>
        </AnimatePresence>
    )
}

export default MapOptionModal

function PinInfo({
    data,
    isLoading = false,
}: {
    data: Pin // Use the consistent Pin type
    isLoading?: boolean
}) {
    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="relative h-48 w-full overflow-hidden rounded-lg skeleton"></div>
                <Card>
                    <CardHeader className="pb-2">
                        <div className="h-6 w-24 rounded skeleton"></div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2">
                        <div className="h-4 w-full rounded skeleton"></div>
                        <div className="h-4 w-full rounded skeleton"></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <div className="h-6 w-24 rounded skeleton"></div>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-2 h-4 w-full rounded skeleton"></div>
                        <div className="h-4 w-3/4 rounded skeleton"></div>
                    </CardContent>
                </Card>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="h-6 w-24 rounded skeleton"></div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="h-4 w-full rounded skeleton"></div>
                            <div className="h-4 w-full rounded skeleton"></div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="h-6 w-24 rounded skeleton"></div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="h-4 w-full rounded skeleton"></div>
                            <div className="h-4 w-full rounded skeleton"></div>
                            <div className="h-4 w-full rounded skeleton"></div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }
    const { locationGroup } = data
    if (!locationGroup) return null // Should not happen if data is properly loaded

    return (
        <div className="space-y-4">
            {locationGroup.image && (
                <div className="relative h-48 w-full overflow-hidden rounded-lg">
                    <img
                        src={locationGroup.image ?? "/placeholder.svg"}
                        alt={locationGroup.title ?? "Pin image"}
                        fill
                        className="object-cover"
                    />
                </div>
            )}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Location</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                        <span className="text-muted-foreground">Latitude:</span>
                        <Badge variant="outline" className="ml-2 font-mono">
                            {data.latitude?.toFixed(6)}
                        </Badge>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Longitude:</span>
                        <Badge variant="outline" className="ml-2 font-mono">
                            {data.longitude?.toFixed(6)}
                        </Badge>
                    </div>
                </CardContent>
            </Card>
            {locationGroup.description && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">{locationGroup.description}</p>
                    </CardContent>
                </Card>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Calendar className="h-4 w-4 " />
                            Dates
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div>
                            <span className="text-muted-foreground">Start:</span>{" "}
                            {locationGroup.startDate ? new Date(locationGroup.startDate).toLocaleDateString() : "Not set"}
                        </div>
                        <div>
                            <span className="text-muted-foreground">End:</span>{" "}
                            {locationGroup.endDate ? new Date(locationGroup.endDate).toLocaleDateString() : "Not set"}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Users className="h-4 w-4 " />
                            Collection
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div>
                            <span className="text-muted-foreground">Limit:</span> {data.locationGroup?.limit ?? "Unlimited"}
                        </div>
                        <div>
                            <span className="text-muted-foreground">Remaining:</span> {locationGroup.remaining ?? "Unlimited"}
                        </div>
                        <div>
                            <span className="text-muted-foreground">Auto Collect:</span>{" "}
                            <Badge variant={data.autoCollect ? "default" : "outline"}>
                                {data.autoCollect ? "Enabled" : "Disabled"}
                            </Badge>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Multi Pin:</span>{" "}
                            <Badge variant={locationGroup.multiPin ? "default" : "outline"}>
                                {locationGroup.multiPin ? "Enabled" : "Disabled"}
                            </Badge>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Type:</span>{" "}
                            <Badge variant="secondary" className="flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                {locationGroup.type.charAt(0).toUpperCase() + locationGroup.type.slice(1).toLowerCase()}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>
            {locationGroup.link && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <LinkIcon className="h-4 w-4 " />
                            Link
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <a
                            href={locationGroup.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm hover:underline"
                        >
                            {locationGroup.link}
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

export { updateMapFormSchema }
