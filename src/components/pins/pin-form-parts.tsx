"use client"

import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, FormProvider, type SubmitHandler, useForm, useFormContext } from "react-hook-form"
import { z } from "zod"
import toast from "react-hot-toast"
import { Loader, MapPin, ImageIcon, Settings, CheckCircle, Coins, Wand2, Calendar, Tag, Plus } from "lucide-react"
import { Input } from "~/components/shadcn/ui/input"
import { Label } from "~/components/shadcn/ui/label"
import { Textarea } from "~/components/shadcn/ui/textarea"
import { Button } from "~/components/shadcn/ui/button"
import { useCreatorStorageAcc } from "~/lib/state/wallete/stellar-balances"
import { api } from "~/utils/api"
import { BADWORDS } from "~/utils/banned-word"
import { PinType } from "@prisma/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Badge } from "~/components/shadcn/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs"
import { Dropzone } from "~/ui/upload/dropzone"
import { AiImageButton } from "~/ui/ai/ai-image"
import { Switch } from "~/components/shadcn/ui/switch"
import { LocationAddressDisplay } from "~/components/map/address-display"

// Define types for assets and pins
export type AssetType = {
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
    radius: z.number().nonnegative("Radius cannot be negative").default(50), // Set default radius to 50
    pinCollectionLimit: z.number().min(1, "Collection limit must be greater than 0"),
    tier: z.string().optional(),
    multiPin: z.boolean().default(false),
    type: z.nativeEnum(PinType).default(PinType.OTHER),
    tags: z.array(z.string()).default([]),

})
export type CreatePinType = z.infer<typeof createPinFormSchema>

export function CollectionInputs({

    setSelectedToken,
    setRemainingBalance,
    assetsQuery,

    selectedToken,
    remainingBalance,
}: {
    setSelectedToken: (asset: (AssetType & { bal: number } | undefined)) => void
    setRemainingBalance: (balance: number) => void
    assetsQuery: {
        data?: {
            pageAsset?: {
                code: string;
                creatorId: string;
                issuer: string;
                thumbnail: string | null;
            }
            shopAsset: AssetType[]
        }
    }

    selectedToken: (AssetType & { bal: number } | undefined)
    remainingBalance: number
}) {
    const { control, register, formState: { errors } } = useFormContext<z.infer<typeof createPinFormSchema>>()
    const { getAssetBalance } = useCreatorStorageAcc()

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-sm font-medium">Choose Token</Label>
                <Controller
                    name="token"
                    control={control}
                    render={({ field }) => (
                        <Select
                            onValueChange={(value) => {
                                const selectedAssetId = Number(value)
                                field.onChange(selectedAssetId === NO_ASSET ? undefined : selectedAssetId)

                                if (selectedAssetId === NO_ASSET) {
                                    setSelectedToken(undefined)
                                    setRemainingBalance(0)
                                    return
                                }

                                if (selectedAssetId === PAGE_ASSET_NUM) {
                                    const pageAsset = assetsQuery.data?.pageAsset
                                    if (pageAsset) {
                                        const bal = getAssetBalance({
                                            code: pageAsset.code,
                                            issuer: pageAsset.issuer,

                                        })
                                        setSelectedToken({
                                            bal,
                                            code: pageAsset.code,
                                            issuer: pageAsset.issuer,
                                            id: PAGE_ASSET_NUM,
                                            thumbnail: pageAsset.thumbnail ?? "",
                                        })
                                        setRemainingBalance(bal)
                                    } else {
                                        toast.error("No page asset found")
                                    }
                                    return
                                }

                                const selectedAsset = assetsQuery.data?.shopAsset.find(
                                    (asset: AssetType) => asset.id === selectedAssetId,
                                )
                                if (selectedAsset) {
                                    const bal = getAssetBalance({
                                        code: selectedAsset.code,
                                        issuer: selectedAsset.issuer,
                                    })
                                    setSelectedToken({ ...selectedAsset, bal: bal })
                                    setRemainingBalance(bal)
                                }
                            }}
                            defaultValue={NO_ASSET.toString()}
                        >
                            <SelectTrigger className="bg-card border-border">
                                <SelectValue placeholder="Choose Token" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_ASSET.toString()}>Pin (No asset)</SelectItem>
                                {assetsQuery.data?.pageAsset && (
                                    <SelectItem value={PAGE_ASSET_NUM.toString()}>
                                        {assetsQuery.data.pageAsset.code} - Page Asset
                                    </SelectItem>
                                )}
                                {assetsQuery.data?.shopAsset?.map((asset: AssetType) => (
                                    <SelectItem key={asset.id} value={asset.id.toString()}>
                                        {asset.code}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="radius" className="text-sm font-medium">
                        Radius (meters)
                    </Label>
                    <Input
                        type="number"
                        id="radius"
                        min={0}
                        {...register("radius", { valueAsNumber: true })}
                        className="bg-card border-border focus:ring-ring"
                        placeholder="50"
                    />
                    {errors.radius && <p className="text-destructive text-sm">{errors.radius.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="pinNumber" className="text-sm font-medium">
                        Number of Pins
                    </Label>
                    <Input
                        type="number"
                        id="pinNumber"
                        min={1}
                        {...register("pinNumber", { valueAsNumber: true })}
                        className="bg-card border-border focus:ring-ring"
                        placeholder="1"
                    />
                    {errors.pinNumber && <p className="text-destructive text-sm">{errors.pinNumber.message}</p>}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="pinCollectionLimit" className="text-sm font-medium">
                    Pin Collection Limit
                </Label>
                <Input
                    type="number"
                    id="pinCollectionLimit"
                    min={0}
                    {...register("pinCollectionLimit", { valueAsNumber: true })}
                    className="bg-card border-border focus:ring-ring"
                    placeholder="Enter collection limit"
                />
                {selectedToken && (
                    <div className="text-xs space-y-1 p-2 bg-muted rounded">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Available Balance:</span>
                            <span className="font-medium">{selectedToken.bal}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Remaining Balance:</span>
                            <span className={`font-medium ${remainingBalance < 0 ? "text-destructive" : "text-accent"}`}>
                                {remainingBalance}
                            </span>
                        </div>
                    </div>
                )}
                {selectedToken && remainingBalance < 0 && (
                    <p className="text-destructive text-sm">Insufficient token balance</p>
                )}
                {errors.pinCollectionLimit && <p className="text-destructive text-sm">{errors.pinCollectionLimit.message}</p>}
            </div>
        </div>
    )
}
/** Pin cover image: a wide drag-and-drop area with preview, plus "Generate" with AI. */
export function ImageUploadField({
    value,
    onChange,
    ai,
}: {
    value?: string
    onChange: (url: string | undefined) => void
    ai?: { form: "pin" | "hotspot"; suggestedPrompt: string }
}) {
    return (
        <div className="space-y-2">
            <div className="flex min-h-7 items-center justify-between gap-2">
                <Label className="text-sm font-medium">Cover image</Label>
                {ai && (
                    <AiImageButton form={ai.form} aspect="wide" className="h-7 px-2.5 text-xs" label="Generate" suggestedPrompt={ai.suggestedPrompt} onImage={(url) => onChange(url)} />
                )}
            </div>
            <Dropzone endpoint="imageUploader" shape="wide" value={value} onChange={(url) => onChange(url)} label="Drop the pin's cover image" />
        </div>
    )
}


export function PinTypeToggles() {
    const { control } = useFormContext<CreatePinType>()
    return (
        <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
                <Settings className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">Advanced Settings</h4>
            </div>

            <div className="space-y-3">


                <Card className="border border-border hover:border-blue-300 transition-colors duration-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <Label htmlFor="multiPin" className="text-sm font-medium cursor-pointer text-foreground">
                                    Multi Pin
                                </Label>
                                <p className="text-xs text-muted-foreground mt-1">Allow multiple pins to be collected from this location</p>
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
export function TiersOptions({ creatorId }: { creatorId?: string } = {}) {
    const tiersQuery = api.fan.member.getAllMembership.useQuery({ creatorId })
    const { control } = useFormContext<CreatePinType>()
    if (tiersQuery.isLoading) return <div className="skeleton h-10 w-20"></div>;
    if (tiersQuery.data) {
        return (
            <div className="space-y-2">
                <Label className="text-sm font-medium">Choose Tier</Label>
                <Controller
                    name="tier"
                    control={control}
                    render={({ field }) => (
                        <Select
                            onValueChange={(value) => {
                                field.onChange(value)
                            }}
                        >
                            <SelectTrigger className="bg-card border-border">
                                <SelectValue placeholder="Choose Tier" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="public">Public</SelectItem>
                                <SelectItem value="private">Only Followers</SelectItem>
                                {tiersQuery.data.map((model) => (

                                    <SelectItem key={model.id} value={model.id.toString()}>
                                        {`${model.name} : ${model.price} ${model.creator.pageAsset?.code}`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>
            // <div>
            //     <h4 className="text-sm font-semibold text-foreground">Tier Settings</h4>
            //     <Controller
            //         name="tier"
            //         control={control}
            //         render={({ field }) => (
            //             <select {...field} className="select select-bordered ">
            //                 <option disabled>Choose Tier</option>
            //                 <option value="public">Public</option>
            //                 <option value="private">Only Followers</option>
            //                 {tiersQuery.data.map((model) => (
            //                     <option
            //                         key={model.id}
            //                         value={model.id}
            //                     >{`${model.name} : ${model.price} ${model.creator.pageAsset?.code}`}</option>
            //                 ))}
            //             </select>
            //         )}
            //     />
            // </div>
        );
    }
}

export function EnhanceDescriptionButton({ className }: { className?: string }) {
    const { watch, setValue } = useFormContext<z.infer<typeof createPinFormSchema>>()
    const description = watch("description")
    const [isLoading, setIsLoading] = useState(false)
    const enhanceDescriptionMutation = api.pinAgent.enhanceDescription.useMutation({
        onSuccess: (data) => {
            setValue("description", data.enhancedDescription)
            toast.success("Description enhanced!")
        },
        onError: (err) => {
            toast.error(err.message || "Failed to enhance description")
        },
    })

    const handleEnhance = async () => {
        if (!description || description.trim().length === 0) {
            toast.error("Please enter a description first")
            return
        }

        setIsLoading(true)
        enhanceDescriptionMutation.mutate({
            description: description.trim(),
        })
        setIsLoading(false)
    }

    return (
        <Button
            type="button"

            size="sm"
            onClick={handleEnhance}
            disabled={!description || description.trim().length === 0 || enhanceDescriptionMutation.isPending}
            className={`${className} h-6 w-6 px-2 text-xs gap-1 hover:bg-primary/10  rounded-full`}
        >
            {enhanceDescriptionMutation.isPending ? (
                <>
                    <Loader className="w-3 h-3 animate-spin" />

                </>
            ) : (
                <>
                    <Wand2 className="w-3 h-3" />

                </>
            )}
        </Button>
    )
}
export function TagsSection({ suggestions }: { suggestions?: string[] } = {}) {
    const { watch, getValues } = useFormContext<CreatePinType>()
    const title = watch("title")
    const description = watch("description")
    const type = watch("type")

    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
    const [newTagInput, setNewTagInput] = useState("")
    const [aiTags, setAiTags] = useState<string[]>([]) // AI suggested labels
    // "Fill with AI" hands its tag ideas in here as one-click suggestions.
    useEffect(() => {
        if (suggestions?.length) setAiTags(suggestions)
    }, [suggestions])

    const myTagsQuery = api.tag.myTags.useQuery({})

    const createTagM = api.tag.create.useMutation({
        onSuccess: () => { void myTagsQuery.refetch() },
        onError: (err) => toast.error(err.message),
    })

    const aiGenerateM = api.tag.aiGenerate.useMutation({
        onSuccess: (data) => {
            setAiTags(data.tags)
            toast.success("AI tags generated!")
        },
        onError: (err) => toast.error(err.message),
    })

    const handleCreateTag = () => {
        const label = newTagInput.trim()
        if (!label) return
        createTagM.mutate({ label }, {
            onSuccess: (tag) => {
                setSelectedTagIds((prev) => [...prev, tag.id])
                setNewTagInput("")
            },
        })
    }

    const handleAiGenerate = () => {
        aiGenerateM.mutate({
            title: title ?? "",
            description: description ?? "",
            type: type ?? "OTHER",
            latitude: getValues("lat"),
            longitude: getValues("lng"),
        })
    }

    const handleAddAiTag = (label: string) => {
        createTagM.mutate({ label }, {
            onSuccess: (tag) => {
                setSelectedTagIds((prev) =>
                    prev.includes(tag.id) ? prev : [...prev, tag.id]
                )
                setAiTags((prev) => prev.filter((t) => t !== label))
            },
        })
    }

    const toggleTag = (id: string) => {
        setSelectedTagIds((prev) =>
            prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
        )
    }

    // sync to form
    const { setValue } = useFormContext<CreatePinType>()
    useEffect(() => {
        setValue("tags", selectedTagIds)
    }, [selectedTagIds, setValue])

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Tag className="w-5 h-5 text-primary" />
                    Tags
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

                {/* Action buttons */}
                <div className="flex gap-2">
                    <div className="flex items-center gap-2 flex-1">
                        <Input
                            placeholder="New tag name..."
                            value={newTagInput}
                            onChange={(e) => setNewTagInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateTag())}
                            className="bg-card border-border"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleCreateTag}
                            disabled={!newTagInput.trim() || createTagM.isPending}
                        >
                            {createTagM.isPending ? <Loader className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
                            New Tag
                        </Button>
                    </div>

                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAiGenerate}
                        disabled={!title || aiGenerateM.isPending}
                        className="border-primary/40 text-primary hover:bg-primary/10"
                    >
                        {aiGenerateM.isPending
                            ? <Loader className="w-3 h-3 animate-spin mr-1" />
                            : <Wand2 className="w-3 h-3 mr-1" />}
                        AI Tags
                    </Button>
                </div>

                {/* AI suggested tags */}
                {aiTags.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">AI Suggestions — click to add:</p>
                        <div className="flex flex-wrap gap-2">
                            {aiTags.map((label) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => handleAddAiTag(label)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-primary/50 text-primary text-xs hover:bg-primary/10 transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Creator's existing tags */}
                {myTagsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading tags...</p>}
                {myTagsQuery.data && myTagsQuery.data.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Your tags:</p>
                        <div className="flex flex-wrap gap-2">
                            {myTagsQuery.data.map((tag) => {
                                const selected = selectedTagIds.includes(tag.id)
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => toggleTag(tag.id)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${selected
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                                            }`}
                                    >
                                        {selected && <span className="mr-1">✓</span>}
                                        {tag.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {selectedTagIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{selectedTagIds.length} tag(s) selected</p>
                )}
            </CardContent>
        </Card>
    )
}