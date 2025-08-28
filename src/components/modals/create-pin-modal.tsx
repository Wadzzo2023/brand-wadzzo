"use client"

import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, FormProvider, type SubmitHandler, useForm, useFormContext } from "react-hook-form"
import { z } from "zod"
import toast from "react-hot-toast"
import { Loader, MapPin, Calendar, ImageIcon, Settings, CheckCircle, Clock, Globe, Link } from 'lucide-react'
import Image from "next/image"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { Input } from "~/components/shadcn/ui/input"
import { Label } from "~/components/shadcn/ui/label"
import { Textarea } from "~/components/shadcn/ui/textarea"
import { Button } from "~/components/shadcn/ui/button"
import { Switch } from "~/components/shadcn/ui/switch"
import { useCreatorStorageAcc } from "~/lib/state/wallete/stellar-balances"
import { api } from "~/utils/api"
import { UploadS3Button } from "../common/upload-button"
import { BADWORDS } from "~/utils/banned-word"
import { PinType } from "@prisma/client"
import { useMapInteractionStore } from "~/store/map-stores"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../shadcn/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "../shadcn/ui/card"
import { Badge } from "../shadcn/ui/badge"
import CopyCutPinModal from "./copy-cut-pin-modal"
// Define types for assets and pins
type AssetType = {
    id: number
    code: string
    issuer: string
    thumbnail: string
}

export const PAGE_ASSET_NUM = -10
export const NO_ASSET = -99

export const createPinFormSchema = z.object({
    lat: z.number().min(-180).max(180),
    lng: z.number().min(-180).max(180),
    description: z.string().optional(),
    title: z
        .string()
        .min(3, "Title must be at least 3 characters long")
        .refine(
            (value) => {
                return !BADWORDS.some((word) => value.toLowerCase().includes(word.toLowerCase()))
            },
            {
                message: "Input contains banned words.",
            },
        ),
    image: z.string().url().optional(),
    startDate: z.date(),
    endDate: z.date().min(new Date(new Date().setHours(0, 0, 0, 0)), "End date cannot be in the past"),
    url: z.string().url("Please enter a valid URL").optional(),
    autoCollect: z.boolean(),
    token: z.number().optional(),
    tokenAmount: z.number().nonnegative().optional(),
    pinNumber: z.number().nonnegative().min(1, "Number of pins must be at least 1"),
    radius: z.number().nonnegative("Radius cannot be negative"),
    pinCollectionLimit: z.number().min(0, "Collection limit cannot be negative"),
    tier: z.string().optional(),
    multiPin: z.boolean().default(false),
    type: z.nativeEnum(PinType).default(PinType.OTHER),
})
type CreatePinType = z.infer<typeof createPinFormSchema>

export default function CreatePinModal() {
    const { isOpenCreatePin, closeCreatePinModal, manual, position, duplicate, prevData, copiedPinData } = useMapInteractionStore()

    const [coverUrl, setCover] = useState<string | undefined>()
    const [selectedToken, setSelectedToken] = useState<(AssetType & { bal: number }) | undefined>()
    const [remainingBalance, setRemainingBalance] = useState<number>(0)
    const [currentStep, setCurrentStep] = useState(1)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    console.log("CreatePinModal rendered with position:", isOpenCreatePin)

    const { getAssetBalance } = useCreatorStorageAcc()
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateForInput = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, "0")
        const day = String(date.getDate()).padStart(2, "0")
        const hours = String(date.getHours()).padStart(2, "0")
        const minutes = String(date.getMinutes()).padStart(2, "0")
        return `${year}-${month}-${day}T${hours}:${minutes}`
    }

    const methods = useForm<z.infer<typeof createPinFormSchema>>({
        resolver: zodResolver(createPinFormSchema),
        defaultValues: {
            lat: position?.lat,
            lng: position?.lng,
            radius: 0,
            pinNumber: 1,
            pinCollectionLimit: 0,
            description: prevData?.description ?? "",
            autoCollect: prevData?.autoCollect ?? false,
            startDate: prevData?.startDate ?? today,
            endDate: prevData?.endDate ?? tomorrow,
            multiPin: prevData?.multiPin ?? false,
            type: PinType.OTHER,
            url: "",
        },
    })

    const {
        register,
        handleSubmit,
        setValue,
        getValues,
        reset,
        trigger,
        control,
        setError,
        watch,
        formState: { errors, isValid },
    } = methods
    const tokenAmount = watch("pinCollectionLimit")
    const autoCollect = watch("autoCollect")
    const multiPin = watch("multiPin")

    const assetsQuery = api.fan.asset.myAssets.useQuery(undefined, {})
    const tiersQuery = api.fan.member.getAllMembership.useQuery()

    const addPinM = api.maps.pin.createPin.useMutation({
        onSuccess: () => {
            console.log("Pin sent for approval")
            closeCreatePinModal()
        },
        onError: (err) => {
            console.error(`Failed to create pin: ${err.message}`)
        },
    })

    const resetState = () => {
        reset()
        setCover(undefined)
        setSelectedToken(undefined)
        setRemainingBalance(0)
        setCurrentStep(1)
    }

    const onSubmit: SubmitHandler<z.infer<typeof createPinFormSchema>> = (data) => {
        if (selectedToken && data.pinCollectionLimit && data.pinCollectionLimit > selectedToken.bal) {
            setError("pinCollectionLimit", {
                type: "manual",
                message: "Collection limit can't be more than token balance",
            })
            return
        }

        const finalData = { ...data }
        if (position) {
            finalData.lat = position.lat
            finalData.lng = position.lng
        }

        addPinM.mutate({
            ...finalData,
            description: finalData.description ?? "",
        })
    }

    useEffect(() => {
        if (isOpenCreatePin && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0
        }
        if (isOpenCreatePin) {
            setCurrentStep(1)
        }
        if (duplicate && prevData) {
            setValue("title", prevData.title ?? "")
            setValue("description", prevData.description ?? "")
            setCover(prevData.image ?? undefined)
            setValue("image", prevData.image ?? undefined)
            setValue("startDate", prevData.startDate ?? new Date())
            setValue("endDate", prevData.endDate ?? new Date(new Date().setHours(23, 59, 59, 999)))
            setValue("url", prevData.url ?? "")
            setValue("autoCollect", prevData.autoCollect ?? false)
            setValue("pinCollectionLimit", prevData.pinCollectionLimit ?? 0)
            setValue("tier", prevData.tier?.toString())
            setValue("pinNumber", prevData.pinCollectionLimit ?? 1)
        }
        if (position) {
            setValue("lat", position.lat)
            setValue("lng", position.lng)
        }
    }, [isOpenCreatePin, duplicate, prevData, position, setValue])

    useEffect(() => {
        if (selectedToken && tokenAmount !== undefined) {
            setRemainingBalance(selectedToken.bal - tokenAmount)
        } else if (selectedToken) {
            setRemainingBalance(selectedToken.bal)
        } else {
            setRemainingBalance(0)
        }
    }, [tokenAmount, selectedToken])

    const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4))
    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1))

    const StepIndicator = () => (
        <div className="flex items-center justify-center space-x-2 mb-8">
            {[
                { step: 1, label: "Basic Info", icon: MapPin },
                { step: 2, label: "Media", icon: ImageIcon },
                { step: 3, label: "Schedule", icon: Calendar },
                { step: 4, label: "Review", icon: CheckCircle },
            ].map(({ step, label, icon: Icon }, index) => (
                <div key={step} className="flex items-center">
                    <div className="flex flex-col items-center">
                        <div
                            className={`relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${currentStep >= step
                                ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg scale-110"
                                : currentStep === step - 1
                                    ? "bg-blue-100 text-blue-600 border-2 border-blue-300"
                                    : "bg-gray-100 text-gray-400"
                                }`}
                        >
                            {currentStep > step ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                            {currentStep === step && (
                                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full opacity-20 animate-pulse" />
                            )}
                        </div>
                        <span
                            className={`mt-2 text-xs font-medium transition-colors duration-300 ${currentStep >= step ? "text-blue-600" : "text-gray-400"
                                }`}
                        >
                            {label}
                        </span>
                    </div>
                    {index < 3 && (
                        <div
                            className={`w-16 h-0.5 mx-4 transition-all duration-300 ${currentStep > step ? "bg-gradient-to-r from-blue-500 to-purple-600" : "bg-gray-200"
                                }`}
                        />
                    )}
                </div>
            ))}
        </div>
    )

    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="space-y-6 animate-in slide-in-from-left-5 duration-300">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <MapPin className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900">Basic Information</h3>
                                <p className="text-sm text-gray-500">Set up your pin{"'"}s core details</p>
                            </div>
                        </div>

                        <ManualCoordinatesInput manual={manual} position={position} />

                        <div className="space-y-2">
                            <Label htmlFor="title" className="text-sm font-semibold text-gray-700">
                                Pin Title
                            </Label>
                            <Input
                                id="title"
                                {...register("title")}
                                className="h-12 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent border-gray-200"
                                placeholder="Enter a catchy title for your pin"
                            />
                            {errors.title && (
                                <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                    {errors.title.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-sm font-semibold text-gray-700">
                                Description
                            </Label>
                            <Textarea
                                id="description"
                                {...register("description")}
                                className="min-h-[120px] transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent border-gray-200 resize-none"
                                placeholder="Describe what makes this pin special..."
                            />
                            {errors.description && (
                                <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                    {errors.description.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pinType" className="text-sm font-semibold text-gray-700">
                                Pin Type
                            </Label>
                            <Controller
                                name="type"
                                control={control}
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <SelectTrigger className="h-12 border-gray-200">
                                            <SelectValue placeholder="Choose Pin Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.values(PinType).map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.type && (
                                <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                    {errors.type.message}
                                </p>
                            )}
                        </div>
                    </div>
                )

            case 2:
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 duration-300">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <ImageIcon className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900">Media & Links</h3>
                                <p className="text-sm text-gray-500">Add visual content and external links</p>
                            </div>
                        </div>

                        <ImageUploadField coverUrl={coverUrl} setCover={setCover} setValue={setValue} />

                        <div className="space-y-2">
                            <Label htmlFor="url" className="text-sm font-semibold text-gray-700">
                                URL / Link{" "}
                                <Badge variant="secondary" className="ml-2 text-xs">
                                    Optional
                                </Badge>
                            </Label>
                            <div className="relative">
                                <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    id="url"
                                    {...register("url")}
                                    className="h-12 pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent border-gray-200"
                                    placeholder="https://example.com"
                                />
                            </div>
                            {errors.url && (
                                <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                    {errors.url.message}
                                </p>
                            )}
                        </div>
                    </div>
                )

            case 3:
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 duration-300">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <Calendar className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900">Schedule & Settings</h3>
                                <p className="text-sm text-gray-500">Configure timing and advanced options</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="startDate" className="text-sm font-semibold text-gray-700">
                                    Start Date
                                </Label>
                                <Input
                                    type="datetime-local"
                                    id="startDate"
                                    {...register("startDate", {
                                        valueAsDate: true,
                                        setValueAs: (value: string) => (value ? new Date(value) : new Date()),
                                    })}
                                    defaultValue={formatDateForInput(prevData?.startDate ?? today)}
                                    className="h-12 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent border-gray-200"
                                />
                                {errors.startDate && (
                                    <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                        <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                        {errors.startDate.message}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="endDate" className="text-sm font-semibold text-gray-700">
                                    End Date
                                </Label>
                                <Input
                                    type="datetime-local"
                                    id="endDate"
                                    {...register("endDate", {
                                        valueAsDate: true,
                                        setValueAs: (value: string) => (value ? new Date(value) : new Date()),
                                    })}
                                    defaultValue={formatDateForInput(prevData?.endDate ?? tomorrow)}
                                    className="h-12 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent border-gray-200"
                                />
                                {errors.endDate && (
                                    <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                        <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                        {errors.endDate.message}
                                    </p>
                                )}
                            </div>
                        </div>

                        <PinTypeToggles />
                    </div>
                )

            case 4:
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 duration-300">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                                <CheckCircle className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900">Review Your Pin</h3>
                                <p className="text-sm text-gray-500">Double-check all details before creating</p>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            <Card className="border-l-4 border-l-blue-500">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <MapPin className="w-4 h-4 text-blue-500" />
                                        <h4 className="font-semibold text-gray-900">Basic Information</h4>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Title:</span>
                                            <span className="font-medium text-gray-900">{getValues("title") ?? "Not set"}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Type:</span>
                                            <Badge variant="outline">{getValues("type")}</Badge>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Location:</span>
                                            <span className="font-mono text-xs text-gray-700">
                                                {getValues("lat")?.toFixed(4)}, {getValues("lng")?.toFixed(4)}
                                            </span>
                                        </div>
                                        {getValues("description") && (
                                            <div className="pt-2 border-t border-gray-100">
                                                <span className="text-gray-600 block mb-1">Description:</span>
                                                <p className="text-gray-900 text-xs leading-relaxed">{getValues("description")}</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-l-4 border-l-purple-500">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <ImageIcon className="w-4 h-4 text-purple-500" />
                                        <h4 className="font-semibold text-gray-900">Media & Links</h4>
                                    </div>
                                    <div className="space-y-3">
                                        {coverUrl ? (
                                            <div className="flex items-center gap-3">
                                                <Image
                                                    className="rounded-lg shadow-lg transition-transform duration-200 group-hover:scale-105 border border-gray-200"
                                                    width={60}
                                                    height={60}
                                                    alt="preview image"
                                                    src={coverUrl ?? "/placeholder.svg"}
                                                />
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">Cover image uploaded</p>
                                                    <p className="text-xs text-gray-500">Image will be displayed on the pin</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <ImageIcon className="w-4 h-4" />
                                                <span className="text-sm">No cover image</span>
                                            </div>
                                        )}
                                        {getValues("url") ? (
                                            <div className="flex items-center gap-2">
                                                <Link className="w-4 h-4 text-blue-500" />
                                                <a
                                                    href={getValues("url")}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 hover:underline truncate"
                                                >

                                                    {formatDisplayUrl(getValues("url")).slice(0, 14)}
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <Link className="w-4 h-4" />
                                                <span className="text-sm">No external link</span>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-l-4 border-l-green-500">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Clock className="w-4 h-4 text-green-500" />
                                        <h4 className="font-semibold text-gray-900">Schedule</h4>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Start:</span>
                                            <span className="font-medium text-gray-900">
                                                {getValues("startDate")?.toLocaleDateString()} at{" "}
                                                {getValues("startDate")?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">End:</span>
                                            <span className="font-medium text-gray-900">
                                                {getValues("endDate")?.toLocaleDateString()} at{" "}
                                                {getValues("endDate")?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-l-4 border-l-orange-500">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Settings className="w-4 h-4 text-orange-500" />
                                        <h4 className="font-semibold text-gray-900">Advanced Settings</h4>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`w-3 h-3 rounded-full ${getValues("autoCollect") ? "bg-green-500" : "bg-gray-300"}`}
                                            />
                                            <span className="text-sm text-gray-700">Auto Collect</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`w-3 h-3 rounded-full ${getValues("multiPin") ? "bg-green-500" : "bg-gray-300"}`}
                                            />
                                            <span className="text-sm text-gray-700">Multi Pin</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )

            default:
                return null
        }
    }

    return (
        <>
            <Dialog
                open={isOpenCreatePin && !copiedPinData}
                onOpenChange={(open) => {
                    if (!open) resetState()
                    closeCreatePinModal()
                }}
            >
                <DialogContent className="m-auto flex max-h-[90vh] w-full max-w-4xl flex-col overflow-x-hidden pb-0">
                    <DialogHeader className="">
                        <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-emerald-600 bg-clip-text text-transparent">
                            Create Pin
                        </DialogTitle>

                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
                        <div className="p-6">
                            <StepIndicator />

                            <FormProvider {...methods}>
                                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                                    <div className="min-h-[500px]">{renderStepContent()}</div>
                                </form>
                            </FormProvider>
                        </div>
                    </div>

                    <DialogFooter className="flex justify-between items-center p-2 w-full">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={prevStep}
                            disabled={currentStep === 1}
                            className="transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed h-11 px-6 bg-transparent w-full"
                        >
                            Previous
                        </Button>

                        <div className="flex items-center space-x-3 w-full">
                            {currentStep < 4 ? (
                                <Button
                                    type="button"
                                    onClick={nextStep}
                                    className=" hover:scale-105 shadow-lg w-full"
                                >
                                    Next Step
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    onClick={() => onSubmit(getValues())}
                                    disabled={addPinM.isLoading ?? remainingBalance < 0}
                                    className=" hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-full"
                                >
                                    {addPinM.isLoading && <Loader className="animate-spin mr-2 w-4 h-4" />}
                                    {addPinM.isLoading ? "Creating Pin..." : "Create Pin"}
                                </Button>
                            )}
                        </div>

                        {addPinM.isError && (
                            <p className="text-red-500 text-sm mt-2 animate-in slide-in-from-top-2 absolute bottom-2 left-6">
                                {addPinM.error.message}
                            </p>
                        )}
                    </DialogFooter>

                </DialogContent>
            </Dialog>
            <CopyCutPinModal />
        </>
    )
}

interface ManualCoordinatesInputProps {
    manual: boolean
    position: { lat: number; lng: number } | undefined

}

function ManualCoordinatesInput({ manual, position }: ManualCoordinatesInputProps) {
    const { register, formState: { errors } } = useFormContext<z.infer<typeof createPinFormSchema>>()
    if (manual) {
        return (
            <Card className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
                <CardContent className="p-4">
                    <div className="flex items-center space-x-2 mb-4">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">Manual Coordinates</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Latitude</Label>
                            <Input
                                type="number"
                                step={0.0000000000000000001}
                                {...register("lat", { valueAsNumber: true })}
                                className="h-11 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {errors.lat && (
                                <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                    {errors.lat.message}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Longitude</Label>
                            <Input
                                type="number"
                                step={0.0000000000000000001}
                                {...register("lng", { valueAsNumber: true })}
                                className="h-11 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {errors.lng && (
                                <p className="text-red-500 text-sm mt-1 animate-in slide-in-from-top-2 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                    {errors.lng.message}
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/50 to-blue-50/50">
            <CardContent className="p-4">
                <div className="flex items-center space-x-2 mb-3">
                    <MapPin className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-700">Selected Location</span>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Latitude:</span>
                        <Badge variant="secondary" className="font-mono text-xs">
                            {position?.lat?.toFixed(6)}
                        </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Longitude:</span>
                        <Badge variant="secondary" className="font-mono text-xs">
                            {position?.lng?.toFixed(6)}
                        </Badge>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

interface ImageUploadFieldProps {
    coverUrl: string | undefined
    setCover: (url: string | undefined) => void
    setValue: (name: "image", value: string | undefined) => void
}

function ImageUploadField({ coverUrl, setCover, setValue }: ImageUploadFieldProps) {
    return (
        <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-700">Pin Cover Image</Label>
            <Card className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors duration-200">
                <CardContent className="p-6 text-center">
                    <UploadS3Button
                        endpoint="imageUploader"
                        className="w-full"
                        onClientUploadComplete={(res) => {
                            const data = res
                            if (data?.url) {
                                setCover(data.url)
                                setValue("image", data.url)
                            }
                        }}
                        onUploadError={(error: Error) => {
                            console.error(`ERROR! ${error.message}`)
                        }}
                    />
                    {coverUrl && (
                        <div className="mt-6 flex justify-center">
                            <div className="relative group">
                                <Image
                                    className="rounded-xl shadow-lg transition-transform duration-200 group-hover:scale-105 border border-gray-200"
                                    width={200}
                                    height={200}
                                    alt="preview image"
                                    src={coverUrl ?? "/placeholder.svg"}
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-xl transition-all duration-200 flex items-center justify-center">
                                    <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
                                        Preview
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}


function PinTypeToggles() {
    const { control } = useFormContext<CreatePinType>()
    return (
        <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
                <Settings className="w-4 h-4 text-gray-600" />
                <h4 className="text-sm font-semibold text-gray-700">Advanced Settings</h4>
            </div>

            <div className="space-y-3">
                <Card className="border border-gray-200 hover:border-blue-300 transition-colors duration-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label htmlFor="autoCollect" className="text-sm font-medium cursor-pointer text-gray-900">
                                    Auto Collect
                                </Label>
                                <p className="text-xs text-gray-500 mt-1">Automatically collect rewards when users enter the area</p>
                            </div>
                            <Controller
                                name="autoCollect"
                                control={control} // Fixed to use control instead of register
                                render={({ field }) => (
                                    <Switch id="autoCollect" checked={field.value} onCheckedChange={field.onChange} />
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-gray-200 hover:border-blue-300 transition-colors duration-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label htmlFor="multiPin" className="text-sm font-medium cursor-pointer text-gray-900">
                                    Multi Pin
                                </Label>
                                <p className="text-xs text-gray-500 mt-1">Allow multiple pins to be collected from this location</p>
                            </div>
                            <Controller
                                name="multiPin"
                                control={control} // Fixed to use control instead of register
                                render={({ field }) => <Switch id="multiPin" checked={field.value} onCheckedChange={field.onChange} />}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function formatDisplayUrl(url: string | undefined) {
    if (!url) return "";
    try {
        const { hostname, pathname } = new URL(url)
        return `${hostname}${pathname}`
    } catch {
        return url
    }
}
