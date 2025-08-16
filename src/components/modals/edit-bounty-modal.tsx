"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { BountyStatus } from "@prisma/client"
import { X } from "lucide-react"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import toast from "react-hot-toast"
import { z } from "zod"
import { Button } from "~/components/shadcn/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../shadcn/ui/dialog"
import { PLATFORM_ASSET } from "~/lib/stellar/constant"
import { UploadS3Button } from "../common/upload-button"
import { Label } from "../shadcn/ui/label"
import { Input } from "../shadcn/ui/input"
import dynamic from "next/dynamic"
import "react-quill/dist/quill.snow.css"
import { api } from "~/utils/api"
import { Preview } from "../common/quill-preview"
import { Editor } from "../common/quill-editor"
import { Skeleton } from "../shadcn/ui/skeleton"

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false })

export const BountyMediaInfo = z.object({
    url: z.string(),
})

type MediaInfoType = z.TypeOf<typeof BountyMediaInfo>

export const BountySchema = z.object({
    title: z.string().min(1, { message: "Title can't be empty" }),
    requiredBalance: z.number().min(0, { message: "Required Balance can't be less than 0" }),
    content: z.string().min(2, { message: "Description can't be empty" }),
    medias: z.array(BountyMediaInfo).optional(),
    status: z.nativeEnum(BountyStatus).optional(),
})
type EditBountyModalProps = {
    isOpen: boolean
    onClose: () => void
    bountyId: number
}
const EditBountyModal = ({ isOpen, onClose, bountyId }: EditBountyModalProps) => {
    const [media, setMedia] = useState<MediaInfoType[]>([])
    const [isMediaInitialized, setMediaInitialized] = useState(false)

    const { data: CurrentBounty, isLoading: CurrentBountyIsLoading } = api.bounty.Bounty.getBountyByID.useQuery({
        BountyId: bountyId,
    })

    const {
        register,
        handleSubmit,
        setValue,
        getValues,
        reset,
        formState: { errors },
    } = useForm<z.infer<typeof BountySchema>>({
        resolver: zodResolver(BountySchema),
        defaultValues: useMemo(() => {
            return {
                title: CurrentBounty?.title,
                content: CurrentBounty?.description,
                requiredBalance: CurrentBounty?.requiredBalance,
                status: CurrentBounty?.status,
                medias: CurrentBounty?.imageUrls?.map((url) => ({ url })) ?? [],
            }
        }, [CurrentBounty]),
    })

    const utils = api.useUtils()
    const updateBountyMutation = api.bounty.Bounty.updateBounty.useMutation({
        onSuccess: () => {
            utils.bounty.Bounty.getBountyByID.refetch().catch((e) => console.error(e))
            handleClose()
            toast.success("Bounty Updated")
            setMedia([])
        },
    })

    const onSubmit: SubmitHandler<z.infer<typeof BountySchema>> = (data) => {
        data.medias = media
        updateBountyMutation.mutate({
            BountyId: bountyId,
            title: data.title,
            content: data.content,
            requiredBalance: data.requiredBalance,
            medias: data.medias,
            status: data.status,
        })
    }

    const addMediaItem = (url: string) => {
        setMedia((prevMedia) => [...prevMedia, { url }])
    }

    const removeMediaItem = (index: number) => {
        setMedia((prevMedia) => prevMedia.filter((_, i) => i !== index))
    }

    function handleEditorChange(value: string): void {
        setValue("content", value)
    }

    useEffect(() => {
        if (!isMediaInitialized && CurrentBounty?.imageUrls) {
            const initialMedia = CurrentBounty.imageUrls.map((url) => ({ url }))
            setMedia(initialMedia)
            setMediaInitialized(true)
        }
    }, [CurrentBounty, isMediaInitialized])

    const handleClose = () => {
        onClose()
        setMedia([])
        setMediaInitialized(false)

    }

    if (CurrentBountyIsLoading)
        return (
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent className="sm:max-w-[725px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Bounty</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-10 w-full" />
                        </div>

                        <div className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-52 w-full" />
                        </div>

                        <div className="space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-10 w-full" />
                        </div>

                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <div className="flex flex-wrap gap-2">
                                {[...Array({ length: 4 })].map((_, index) => (
                                    <Skeleton key={index} className="h-24 w-24 rounded" />
                                ))}
                            </div>
                            <Skeleton className="h-10 w-32" />
                        </div>

                        <div className="flex justify-end space-x-2 pt-4">
                            <Skeleton className="h-10 w-20" />
                            <Skeleton className="h-10 w-20" />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        )

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[725px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Bounty</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input id="title" defaultValue={CurrentBounty?.title} {...register("title")} className="w-full" />
                        {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="content">Description</Label>
                        <div className="h-52">
                            <Editor
                                value={getValues("content") ?? CurrentBounty?.description}

                                onChange={handleEditorChange}
                                placeholder="Description"
                                className="h-40"
                            />

                        </div>
                        {errors.content && <p className="text-sm text-red-500">{errors.content.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="requiredBalance">Required Balance ({PLATFORM_ASSET.code})</Label>
                        <Input
                            id="requiredBalance"
                            type="number"
                            defaultValue={CurrentBounty?.requiredBalance}
                            {...register("requiredBalance", { valueAsNumber: true })}
                            className="w-full"
                        />
                        {errors.requiredBalance && <p className="text-sm text-red-500">{errors.requiredBalance.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Media</Label>
                        <div className="flex flex-wrap gap-2">
                            {media.map((el, id) => (
                                <div key={id} className="relative">
                                    <Image
                                        src={el.url ?? "/placeholder.svg"}
                                        alt="media"
                                        height={100}
                                        width={100}
                                        className="h-24 w-24 object-cover rounded"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeMediaItem(id)}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <UploadS3Button
                            endpoint="imageUploader"
                            variant="button"
                            className=""
                            onClientUploadComplete={(res) => {
                                const data = res
                                if (data?.url) {
                                    addMediaItem(data.url)
                                }
                            }}
                            onUploadError={(error: Error) => {
                                toast.error(`ERROR! ${error.message}`)
                            }}
                        />
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                        <Button
                            className="shadow-sm shadow-black"
                            type="button"
                            variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button type="button"
                            className="shadow-sm shadow-black"
                            disabled={updateBountyMutation.isLoading}
                            onClick={handleSubmit(onSubmit)}>

                            {updateBountyMutation.isLoading ? "Updating..." : "Update"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default EditBountyModal

