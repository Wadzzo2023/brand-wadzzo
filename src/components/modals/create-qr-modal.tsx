import { zodResolver } from "@hookform/resolvers/zod";
import { MediaType } from "@prisma/client";
import clsx from "clsx";
import { Box, ChevronDown, ChevronUp, DollarSign, Package, Plus, PlusIcon, QrCode, X } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { clientsign } from "package/connect_wallet";
import { WalletType } from "package/connect_wallet/src/lib/enums";
import { ChangeEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTrigger,
} from "~/components/shadcn/ui/dialog";
import useNeedSign from "~/lib/hook";
import { useCreatorStorageAcc, useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { PLATFORM_ASSET, PLATFORM_FEE, TrxBaseFeeInPlatformAsset } from "~/lib/stellar/constant";
import { AccountSchema, clientSelect } from "~/lib/stellar/fan/utils";
import { api } from "~/utils/api";
import { BADWORDS } from "~/utils/banned-word";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/shadcn/ui/collapsible"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/shadcn/ui/card"

import * as React from "react";

import { Button } from "../shadcn/ui/button";
import { UploadS3Button } from "../common/upload-button";
import { Label } from "../shadcn/ui/label";
import { Input } from "../shadcn/ui/input";
import { Textarea } from "../shadcn/ui/textarea";



function CreateQrCodeModal({
    open,
    onClose,
}: {
    open: boolean
    onClose: () => void
}) {
    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-h-[90vh] overflow-auto max-w-2xl">
                <div className="flex items-center gap-2 mb-4">

                    <h2 className="text-lg font-bold">Create QR Code Item</h2>
                </div>


                <QrCodeCreate onClose={onClose} />

            </DialogContent>
        </Dialog>
    )
}
interface DescriptionField {
    id: string
    content: string
    isCollapsed: boolean,
}
interface DescriptionField {
    id: string
    title: string
    content: string
    isCollapsed: boolean
    order: number
}

const QrCodeCreate = ({

    onClose,
}: {

    onClose: () => void
}) => {
    const { data: session } = useSession()
    const [progress, setProgress] = useState(0)

    const [formData, setFormData] = useState({
        title: "",
        modelUrl: "",
        externalLink: "",
        startDate: "",
        endDate: "",
    })

    const [descriptions, setDescriptions] = useState<DescriptionField[]>([
        { id: "temp-1", title: "", content: "", isCollapsed: false, order: 1 },
    ])

    const [errors, setErrors] = useState<{
        title?: string
        descriptions?: Record<string, { title?: string; content?: string }>
        modelUrl?: string
        startDate?: string
        endDate?: string
    }>({})

    const createQRItem = api.qr.createQRItem.useMutation({
        onSuccess: () => {
            toast.success("QR item created successfully!")
            resetForm()
            onClose()
        },
        onError: (error) => {
            toast.error(error.message)
        },
    })

    const resetForm = () => {
        setFormData({
            title: "",
            modelUrl: "",
            externalLink: "",
            startDate: "",
            endDate: "",
        })
        setDescriptions([{ id: "temp-1", title: "", content: "", isCollapsed: false, order: 1 }])
        setErrors({})
    }

    const validateForm = (): boolean => {
        const newErrors: typeof errors = {}

        // Validate main title
        if (!formData.title.trim()) {
            newErrors.title = "Title is required"
        } else if (formData.title.length > 100) {
            newErrors.title = "Title must be 100 characters or less"
        }

        // Validate descriptions
        const descriptionErrors: Record<string, { title?: string; content?: string }> = {}
        let hasValidDescription = false

        descriptions.forEach((desc) => {
            const descError: { title?: string; content?: string } = {}

            // Validate description title
            if (!desc.title.trim()) {
                descError.title = "Description title is required"
            } else if (desc.title.length > 50) {
                descError.title = "Description title must be 50 characters or less"
            }

            // Validate description content - UPDATED TO USE CHARACTER LIMIT
            if (!desc.content.trim()) {
                descError.content = "Description content cannot be empty"
            } else {
                const charCount = desc.content.length
                if (charCount > 600) {
                    descError.content = `Description must be 600 characters or less (current: ${charCount} characters)`
                } else if (desc.title.trim()) {
                    hasValidDescription = true
                }
            }

            if (descError.title ?? descError.content) {
                descriptionErrors[desc.id] = descError
            }
        })

        if (!hasValidDescription) {
            newErrors.descriptions = descriptionErrors
        } else if (Object.keys(descriptionErrors).length > 0) {
            newErrors.descriptions = descriptionErrors
        }

        // Validate model URL
        if (!formData.modelUrl) {
            newErrors.modelUrl = "3D Model is required"
        }

        // Validate dates
        if (!formData.startDate) {
            newErrors.startDate = "Start date is required"
        }
        if (!formData.endDate) {
            newErrors.endDate = "End date is required"
        }
        if (formData.startDate && formData.endDate && new Date(formData.startDate) >= new Date(formData.endDate)) {
            newErrors.endDate = "End date must be after start date"
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!validateForm()) {
            toast.error("Please fix the errors in the form")
            return
        }

        // Prepare descriptions data for the new schema
        const validDescriptions = descriptions
            .filter((desc) => desc.title.trim() && desc.content.trim())
            .sort((a, b) => a.order - b.order)
            .map((desc) => ({
                title: desc.title.trim(),
                content: desc.content.trim(),
                order: desc.order,
            }))

        createQRItem.mutate({
            title: formData.title,
            descriptions: validDescriptions,
            modelUrl: formData.modelUrl,
            externalLink: formData.externalLink || undefined,
            startDate: new Date(formData.startDate),
            endDate: new Date(formData.endDate),
        })
    }

    const handleModelUpload = () => {
        const hiddenInput = document.getElementById("qr-model-upload") as HTMLInputElement
        if (hiddenInput) {
            hiddenInput.click()
        }
    }

    const addDescription = () => {
        if (descriptions.length >= 4) {
            toast.error("Maximum 4 descriptions allowed")
            return
        }

        // Collapse all existing descriptions
        const updatedDescriptions = descriptions.map((desc) => ({
            ...desc,
            isCollapsed: true,
        }))

        // Find the next order number
        const nextOrder = Math.max(...descriptions.map((d) => d.order)) + 1

        // Add new description
        const newDescription: DescriptionField = {
            id: `temp-${Date.now()}`,
            title: "",
            content: "",
            isCollapsed: false,
            order: nextOrder,
        }

        setDescriptions([...updatedDescriptions, newDescription])
    }

    const removeDescription = (id: string) => {
        if (descriptions.length <= 1) {
            toast.error("At least one description is required")
            return
        }

        const remainingDescriptions = descriptions.filter((desc) => desc.id !== id)

        // Reorder remaining descriptions to fill gaps
        const reorderedDescriptions = remainingDescriptions
            .sort((a, b) => a.order - b.order)
            .map((desc, index) => ({
                ...desc,
                order: index + 1,
            }))

        setDescriptions(reorderedDescriptions)

        // Clear errors for removed description
        if (errors.descriptions) {
            const newDescriptionErrors = { ...errors.descriptions }
            delete newDescriptionErrors[id]
            setErrors({
                ...errors,
                descriptions: Object.keys(newDescriptionErrors).length > 0 ? newDescriptionErrors : undefined,
            })
        }
    }

    const updateDescription = (id: string, field: "title" | "content", value: string) => {
        setDescriptions(descriptions.map((desc) => (desc.id === id ? { ...desc, [field]: value } : desc)))

        // Clear error for this description field if it's now valid
        if (errors.descriptions?.[id]?.[field]) {
            const newDescriptionErrors = { ...errors.descriptions }
            if (field === "title" && value.trim() && value.length <= 50) {
                delete newDescriptionErrors[id]?.title
            } else if (field === "content" && value.trim() && value.length <= 600) {
                // UPDATED TO USE CHARACTER LIMIT
                delete newDescriptionErrors[id]?.content
            }

            // Clean up empty error objects
            if (newDescriptionErrors[id] && !newDescriptionErrors[id]?.title && !newDescriptionErrors[id]?.content) {
                delete newDescriptionErrors[id]
            }

            setErrors({
                ...errors,
                descriptions: Object.keys(newDescriptionErrors).length > 0 ? newDescriptionErrors : undefined,
            })
        }
    }

    const toggleDescriptionCollapse = (id: string) => {
        setDescriptions(descriptions.map((desc) => (desc.id === id ? { ...desc, isCollapsed: !desc.isCollapsed } : desc)))
    }

    const getDescriptionDisplayTitle = (desc: DescriptionField): string => {
        if (desc.title.trim()) {
            return desc.title.trim()
        }
        return `Description ${desc.order}`
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Main Title */}
            <div className="space-y-2">
                <Label htmlFor="title">Main Title *</Label>
                <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => {
                        setFormData((prev) => ({ ...prev, title: e.target.value }))
                        if (errors.title) {
                            setErrors({ ...errors, title: undefined })
                        }
                    }}
                    placeholder="Enter main item title"
                    className={errors.title ? "border-red-500" : ""}
                />
                {errors.title && <p className="text-sm text-red-500">{errors.title}</p>}
            </div>

            {/* Descriptions */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label>Descriptions * (Max 4, 600 characters each)</Label>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addDescription}
                        disabled={descriptions.length >= 4}
                        className="gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add Description
                    </Button>
                </div>

                <div className="space-y-3">
                    {descriptions
                        .sort((a, b) => a.order - b.order)
                        .map((desc) => (
                            <Card key={desc.id} className={errors.descriptions?.[desc.id] ? "border-red-500" : ""}>
                                <Collapsible open={!desc.isCollapsed} onOpenChange={() => toggleDescriptionCollapse(desc.id)}>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-sm font-medium">
                                                <span className="text-muted-foreground">#{desc.order}</span> {getDescriptionDisplayTitle(desc)}
                                                {desc.content.trim() && (
                                                    <span className="ml-2 text-xs text-muted-foreground">({desc.content.length} chars)</span>
                                                )}
                                            </CardTitle>
                                            <div className="flex items-center gap-2">
                                                <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="sm">
                                                        {desc.isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                                    </Button>
                                                </CollapsibleTrigger>
                                                {descriptions.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeDescription(desc.id)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="pt-0 space-y-4">
                                            {/* Description Title */}
                                            <div className="space-y-2">
                                                <Label htmlFor={`desc-title-${desc.id}`}>Description Title *</Label>
                                                <Input
                                                    id={`desc-title-${desc.id}`}
                                                    value={desc.title}
                                                    onChange={(e) => updateDescription(desc.id, "title", e.target.value)}
                                                    placeholder={`Enter title for description ${desc.order}`}
                                                    className={errors.descriptions?.[desc.id]?.title ? "border-red-500" : ""}
                                                />
                                                {errors.descriptions?.[desc.id]?.title && (
                                                    <p className="text-sm text-red-500">{errors.descriptions[desc.id]?.title}</p>
                                                )}
                                                <div className="text-xs text-muted-foreground">Characters: {desc.title.length}/50</div>
                                            </div>

                                            {/* Description Content */}
                                            <div className="space-y-2">
                                                <Label htmlFor={`desc-content-${desc.id}`}>Description Content *</Label>
                                                <Textarea
                                                    id={`desc-content-${desc.id}`}
                                                    value={desc.content}
                                                    onChange={(e) => updateDescription(desc.id, "content", e.target.value)}
                                                    placeholder={`Enter content for ${desc.title || `description ${desc.order}`}...`}
                                                    rows={4}
                                                    className={errors.descriptions?.[desc.id]?.content ? "border-red-500" : ""}
                                                    maxLength={600} // Add HTML maxLength attribute for additional UX
                                                />
                                                {errors.descriptions?.[desc.id]?.content && (
                                                    <p className="text-sm text-red-500">{errors.descriptions[desc.id]?.content}</p>
                                                )}
                                                <div className="flex justify-between items-center text-xs text-muted-foreground">
                                                    <span className={desc.content.length > 600 ? "text-red-500 font-medium" : ""}>
                                                        Characters: {desc.content.length}/600
                                                    </span>
                                                    <span>
                                                        {desc.content.length > 600 && (
                                                            <span className="text-red-500">Exceeds limit by {desc.content.length - 600}</span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </CollapsibleContent>
                                </Collapsible>
                            </Card>
                        ))}
                </div>
            </div>

            {/* 3D Model Upload */}
            <div className="space-y-2">
                <Label>3D Model * (GLB)</Label>
                <div className="flex items-center gap-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleModelUpload}
                        className={`gap-2 bg-transparent ${errors.modelUrl ? "border-red-500" : ""}`}
                    >
                        <Box className="h-4 w-4" />
                        {formData.modelUrl ? "Change Model" : "Upload 3D Model"}
                    </Button>
                    {formData.modelUrl && (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                            <Box className="h-4 w-4" />
                            Model uploaded successfully
                        </div>
                    )}

                </div>
                <UploadS3Button
                    id="qr-model-upload"
                    variant="hidden"
                    endpoint="modelUploader"
                    onBeforeUploadBegin={(file) => {
                        if (!file.name.endsWith(".glb")) {
                            toast.error("Invalid file type. Please upload a .glb file.")
                            return undefined
                        }
                        return file
                    }}
                    onClientUploadComplete={(file) => {
                        if (!file) {
                            toast.error("No file uploaded")
                            return
                        }
                        setFormData((prev) => ({ ...prev, modelUrl: file.url }))
                        toast.success("3D Model uploaded successfully!")
                    }}
                />
                {errors.modelUrl && <p className="text-sm text-red-500">{errors.modelUrl}</p>}
            </div>

            {/* External Link */}
            <div className="space-y-2">
                <Label htmlFor="externalLink">External Link (Optional)</Label>
                <Input
                    id="externalLink"
                    type="url"
                    value={formData.externalLink}
                    onChange={(e) => setFormData((prev) => ({ ...prev, externalLink: e.target.value }))}
                    placeholder="https://example.com"
                />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                        id="startDate"
                        type="datetime-local"
                        value={formData.startDate}
                        onChange={(e) => {
                            setFormData((prev) => ({ ...prev, startDate: e.target.value }))
                            if (errors.startDate) {
                                setErrors({ ...errors, startDate: undefined })
                            }
                        }}
                        className={errors.startDate ? "border-red-500" : ""}
                    />
                    {errors.startDate && <p className="text-sm text-red-500">{errors.startDate}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                        id="endDate"
                        type="datetime-local"
                        value={formData.endDate}
                        onChange={(e) => {
                            setFormData((prev) => ({ ...prev, endDate: e.target.value }))
                            if (errors.endDate) {
                                setErrors({ ...errors, endDate: undefined })
                            }
                        }}
                        className={errors.endDate ? "border-red-500" : ""}
                    />
                    {errors.endDate && <p className="text-sm text-red-500">{errors.endDate}</p>}
                </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={createQRItem.isLoading}>
                    {createQRItem.isLoading ? "Creating..." : "Create QR Item"}
                </Button>
            </div>
        </form>
    )
}
export default CreateQrCodeModal