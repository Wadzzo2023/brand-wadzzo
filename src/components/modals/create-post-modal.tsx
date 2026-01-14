"use client"

import { useState, useRef } from "react"
import { useForm, type SubmitHandler, Controller, useFormContext, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { api } from "~/utils/api"

import { MediaType } from "@prisma/client"
import {
    FileAudio,
    FileVideo,
    ImageIcon,
    Music,
    Users2,
    Video,
    X,
    Sparkles,
    Play,
    Pause,
    Volume2,
    VolumeX,
    ArrowLeft,
    ArrowRight,
    Check,
    Eye,
    Loader,
    Wand2,
} from "lucide-react"
import clsx from "clsx"
import Image from "next/image"

import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import toast from "react-hot-toast"
import { useRouter } from "next/router"

import { motion, AnimatePresence } from "framer-motion"
import CustomAvatar from "../common/custom-avatar"
import { Editor } from "../common/quill-editor"
import { UploadS3Button } from "../common/upload-button"
import ReactQuill from "react-quill"

const mediaTypes = [
    { type: MediaType.IMAGE, icon: ImageIcon, label: "Image" },
    { type: MediaType.VIDEO, icon: Video, label: "Video" },
    { type: MediaType.MUSIC, icon: Music, label: "Music" },
]

export const MediaInfo = z.object({
    url: z.string(),
    type: z.nativeEnum(MediaType),
})

type MediaInfoType = z.TypeOf<typeof MediaInfo>

export const PostSchema = z.object({
    heading: z.string().min(1, { message: "Post must contain a title" }),
    content: z.string().min(2, { message: "Minimum 2 characters required." }),
    subscription: z.string().optional(),
    medias: z.array(MediaInfo).optional(),
})

type FormStep = "content" | "preview"

type CreatePostModalProps = {
    isOpen: boolean
    setIsOpen: (value: boolean) => void
}

export function CreatePostModal({ isOpen, setIsOpen }: CreatePostModalProps) {
    const methods = useForm<z.infer<typeof PostSchema>>({
        resolver: zodResolver(PostSchema),
        mode: "onChange",
        defaultValues: {
            heading: "",
            content: "",
            subscription: "public",
        },
    })
    const { register, handleSubmit, setValue, getValues, reset, watch, formState: { errors }, control, trigger } = methods
    // Watch form values for reactive updates
    const watchedHeading = watch("heading")

    const [media, setMedia] = useState<MediaInfoType[]>([])
    const [wantMediaType, setWantMedia] = useState<MediaType>()
    const [previewMedia, setPreviewMedia] = useState<MediaInfoType | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [currentStep, setCurrentStep] = useState<FormStep>("content")
    const [showConfetti, setShowConfetti] = useState(false)
    const audioRef = useRef<HTMLAudioElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const router = useRouter()

    const creator = api.fan.creator.meCreator.useQuery()

    const createPostMutation = api.fan.post.create.useMutation({
        onSuccess: async (data) => {
            setShowConfetti(true)
            setMedia([])
            setTimeout(() => {
                handleClose()
                router.push(`/posts/${data.id}`)
            }, 2000)
        },
    })

    const tiers = api.fan.member.getAllMembership.useQuery({})

    const onSubmit: SubmitHandler<z.infer<typeof PostSchema>> = (data) => {
        data.medias = media
        createPostMutation.mutate(data)
    }

    const addMediaItem = (url: string, type: MediaType) => {
        setMedia((prevMedia) => [...prevMedia, { url, type }])
    }

    const handleWantMediaType = (type: MediaType) => {
        setWantMedia((prevType) => (prevType === type ? undefined : type))
    }



    const openMediaPreview = (item: MediaInfoType) => {
        setPreviewMedia(item)
        setIsPlaying(false)
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
        }
        if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.currentTime = 0
        }
    }

    const closeMediaPreview = () => {
        setPreviewMedia(null)
        setIsPlaying(false)
        if (audioRef.current) {
            audioRef.current.pause()
        }
        if (videoRef.current) {
            videoRef.current.pause()
        }
    }

    const togglePlay = () => {
        if (previewMedia?.type === MediaType.MUSIC && audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause()
            } else {
                audioRef.current.play()
            }
            setIsPlaying(!isPlaying)
        } else if (previewMedia?.type === MediaType.VIDEO && videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause()
            } else {
                videoRef.current.play()
            }
            setIsPlaying(!isPlaying)
        }
    }

    const toggleMute = () => {
        if (previewMedia?.type === MediaType.MUSIC && audioRef.current) {
            audioRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        } else if (previewMedia?.type === MediaType.VIDEO && videoRef.current) {
            videoRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        }
    }

    const goToNextStep = async () => {
        if (currentStep === "content") {
            // Only trigger validation when actually trying to proceed
            const isContentValid = await trigger(["heading"])
            if (isContentValid) {
                setCurrentStep("preview")
            } else {
                toast.error("Please fill in all required fields")
            }
        }
    }

    const goToPreviousStep = () => {
        if (currentStep === "preview") {
            setCurrentStep("content")
        }
    }

    const handleClose = () => {
        setIsOpen(false)
        resetForm()
    }

    const resetForm = () => {
        reset()
        setMedia([])
        setCurrentStep("content")
        setIsOpen(false)
    }

    // Check if content step is valid using watched values
    const isContentStepValid = () => {
        const heading = watchedHeading?.trim() || ""

        return heading.length >= 1 && !errors.heading
    }

    function TiersOptions() {
        if (tiers.isLoading) return <div className="h-10 w-full animate-pulse bg-muted sm:w-[180px]"></div>
        if (tiers.data) {
            return (
                <Controller
                    name="subscription"
                    control={control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Choose Subscription Model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="public">Public</SelectItem>
                                {tiers.data.map((model) => (
                                    <SelectItem
                                        key={model.id}
                                        value={model.id.toString()}
                                    >{`${model.name} : ${model.price} ${model.creator.pageAsset?.code ? model.creator.pageAsset.code : model.creator?.customPageAssetCodeIssuer?.split("-")[0]}`}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
            )
        }
    }

    if (creator.data)
        return (
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault()
                    }}
                    className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto p-0"
                >
                    {showConfetti && (
                        <div className="fixed inset-0 pointer-events-none z-50">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1, opacity: [0, 1, 0] }}
                                    transition={{ duration: 2 }}
                                    className="text-4xl"
                                >
                                    <div className="flex items-center justify-center gap-2 ">
                                        <Sparkles className="h-8 w-8" />
                                        <span className="font-bold">Post created successfully!</span>
                                        <Sparkles className="h-8 w-8" />
                                    </div>
                                </motion.div>
                            </div>
                            {Array.from({ length: 100 }).map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-2 h-2 rounded-full"
                                    initial={{
                                        top: "50%",
                                        left: "50%",
                                        scale: 0,
                                        backgroundColor: ["#FF5733", "#33FF57", "#3357FF", "#F3FF33", "#FF33F3"][
                                            Math.floor(Math.random() * 5)
                                        ],
                                    }}
                                    animate={{
                                        top: `${Math.random() * 100}%`,
                                        left: `${Math.random() * 100}%`,
                                        scale: [0, 1, 0],
                                        opacity: [0, 1, 0],
                                    }}
                                    transition={{
                                        duration: 2 + Math.random() * 2,
                                        delay: Math.random() * 0.5,
                                        ease: "easeOut",
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    <DialogHeader className=" px-6 py-2">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            <Sparkles className="h-5 w-5" /> Create a New Post
                        </DialogTitle>
                        <DialogDescription className="">Share your amazing content with your fans and followers</DialogDescription>
                    </DialogHeader>

                    <FormProvider {...methods}>
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <div className="px-6 ">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center w-full">
                                        <div
                                            className={clsx(
                                                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
                                                currentStep === "content"
                                                    ? "bg-primary  shadow-sm shadow-foreground"
                                                    : "bg-gray-100 text-gray-400",
                                            )}
                                        >
                                            1
                                        </div>
                                        <div className={clsx("flex-1 h-1 mx-2", currentStep === "preview" ? "bg-primary" : "bg-gray-200")} />
                                        <div
                                            className={clsx(
                                                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
                                                currentStep === "preview"
                                                    ? "bg-primary  shadow-sm shadow-foreground"
                                                    : "bg-gray-100 text-gray-400",
                                            )}
                                        >
                                            2
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-between text-sm mb-6">
                                    <div className={clsx("font-medium", currentStep === "content" ? "" : "text-gray-500")}>
                                        Create
                                    </div>
                                    <div className={clsx("font-medium", currentStep === "preview" ? "" : "text-gray-500")}>Review</div>
                                </div>
                            </div>

                            <div className="px-6">
                                <div className="flex flex-col items-start justify-between space-y-2 pb-4 sm:flex-row sm:items-center sm:space-y-0 border-b mb-4">
                                    <div className="flex items-center space-x-2">
                                        <CustomAvatar className="h-12 w-12 ring-2 " url={creator.data.profileUrl} />
                                        <span className="font-semibold text-lg">{creator.data.name}</span>
                                    </div>
                                    <div className="flex w-full items-center space-x-2 sm:w-auto">
                                        <Users2 size={20} className="" />
                                        <TiersOptions />
                                    </div>
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                {currentStep === "content" && (
                                    <motion.div
                                        className="px-6 py-4"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <h3 className="text-lg font-medium mb-4">Step 1: Create Your Content & Add Media</h3>
                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <Input
                                                    type="text"
                                                    placeholder="Add a compelling title..."
                                                    {...register("heading")}
                                                    className={clsx(
                                                        "text-lg font-medium border-2 ",
                                                        errors.heading ? "border-red-500" : "border-gray-200",
                                                    )}
                                                />
                                                {errors.heading && <p className="text-sm text-red-500">{errors.heading.message}</p>}
                                            </div>
                                            <div className="space-y-2 relative">
                                                <ReactQuill
                                                    className="quill-editor"
                                                    value={getValues("content")}
                                                    onChange={(value) => setValue("content", value)}
                                                />
                                                <EnhanceDescriptionButton className="absolute bottom-2 right-2" />
                                                {errors.content && <p className="text-sm text-red-500">{errors.content.message}</p>}
                                            </div>

                                            <div className="border-t pt-6">
                                                <h4 className="text-md font-medium mb-4">Add Media (Optional)</h4>
                                                <AnimatePresence>
                                                    {media.length > 0 ? (
                                                        <motion.div
                                                            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            exit={{ opacity: 0 }}
                                                        >
                                                            {media.map((el, id) => (
                                                                <motion.div
                                                                    key={id}
                                                                    className="relative group"
                                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.8 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    layout
                                                                    whileHover={{ scale: 1.05 }}
                                                                    onClick={() => openMediaPreview(el)}
                                                                >
                                                                    <div className="aspect-square rounded-lg overflow-hidden shadow-md cursor-pointer border-2 border-transparent hover:border-purple-500 transition-all duration-300">
                                                                        {el.type === MediaType.IMAGE ? (
                                                                            <div className="relative h-full w-full">
                                                                                <Image
                                                                                    src={el.url ?? "/placeholder.svg"}
                                                                                    alt="Uploaded media"
                                                                                    fill
                                                                                    className="object-cover"
                                                                                />
                                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all duration-300">
                                                                                    <ImageIcon className="text-white opacity-0 group-hover:opacity-100 h-8 w-8" />
                                                                                </div>
                                                                            </div>
                                                                        ) : el.type === MediaType.VIDEO ? (
                                                                            <div className="relative h-full w-full bg-gray-100 flex items-center justify-center">
                                                                                <FileVideo className="h-12 w-12 text-gray-400" />
                                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all duration-300">
                                                                                    <Play className="text-white opacity-0 group-hover:opacity-100 h-8 w-8" />
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="relative h-full w-full bg-gray-100 flex items-center justify-center">
                                                                                <FileAudio className="h-12 w-12 text-gray-400" />
                                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all duration-300">
                                                                                    <Music className="text-white opacity-0 group-hover:opacity-100 h-8 w-8" />
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="destructive"
                                                                        className="absolute -right-2 -top-2 h-6 w-6 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setMedia(media.filter((_, index) => index !== id))
                                                                        }}
                                                                    >
                                                                        <X className="h-3 w-3" />
                                                                    </Button>
                                                                </motion.div>
                                                            ))}
                                                        </motion.div>
                                                    ) : (
                                                        <motion.div
                                                            className="text-center py-6 rounded-lg border-2 border-dashed border-gray-300 mb-6"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            exit={{ opacity: 0 }}
                                                        >
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="p-3 rounded-full bg-purple-100">
                                                                    <ImageIcon className="h-6 w-6 text-purple-500" />
                                                                </div>
                                                                <h4 className="font-medium">No media added yet</h4>
                                                                <p className="text-gray-500 text-sm max-w-md mx-auto">
                                                                    Add images, videos, or music to make your post more engaging
                                                                </p>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="flex flex-wrap items-center justify-center gap-3">
                                                        {mediaTypes.map(({ type, icon: IconComponent, label }) => (
                                                            <motion.div key={type} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                                                <Button
                                                                    size="sm"
                                                                    type="button"
                                                                    variant={wantMediaType === type ? "default" : "outline"}
                                                                    onClick={() => handleWantMediaType(type)}
                                                                    className={clsx(
                                                                        "flex-1 sm:flex-none px-4 py-2",
                                                                        wantMediaType === type && "bg-purple-600 hover:bg-purple-700",
                                                                    )}
                                                                >
                                                                    <IconComponent className="mr-2 h-4 w-4" />
                                                                    {label}
                                                                </Button>
                                                            </motion.div>
                                                        ))}
                                                    </div>

                                                    <AnimatePresence>
                                                        {wantMediaType && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: "auto" }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ duration: 0.3 }}
                                                                className="overflow-hidden w-full flex justify-center"
                                                            >
                                                                <div className="bg-gray-50 p-4 rounded-lg border w-full max-w-md">
                                                                    <h4 className="font-medium text-center mb-3 text-sm">
                                                                        {wantMediaType === "IMAGE"
                                                                            ? "Upload an Image"
                                                                            : wantMediaType === "VIDEO"
                                                                                ? "Upload a Video"
                                                                                : "Upload Music"}
                                                                    </h4>
                                                                    {wantMediaType === "IMAGE" ? (
                                                                        <UploadS3Button
                                                                            endpoint="imageUploader"
                                                                            className="w-full"
                                                                            label="Upload Image"
                                                                            onClientUploadComplete={(res) => {
                                                                                const data = res
                                                                                if (data?.url) {
                                                                                    addMediaItem(data.url, wantMediaType)
                                                                                    setWantMedia(undefined)
                                                                                    toast.success("Image uploaded successfully!")
                                                                                }
                                                                            }}
                                                                            onUploadError={(error: Error) => {
                                                                                toast.error(`ERROR! ${error.message}`)
                                                                            }}
                                                                        />
                                                                    ) : wantMediaType === "VIDEO" ? (
                                                                        <UploadS3Button
                                                                            className="w-full"
                                                                            label="Upload Video"
                                                                            endpoint="videoUploader"
                                                                            onClientUploadComplete={(res) => {
                                                                                const data = res
                                                                                if (data?.url) {
                                                                                    addMediaItem(data.url, wantMediaType)
                                                                                    setWantMedia(undefined)
                                                                                    toast.success("Video uploaded successfully!")
                                                                                }
                                                                            }}
                                                                            onUploadError={(error: Error) => {
                                                                                toast.error(`ERROR! ${error.message}`)
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        wantMediaType === "MUSIC" && (
                                                                            <UploadS3Button
                                                                                className="w-full"
                                                                                label="Upload Audio"
                                                                                endpoint="musicUploader"
                                                                                onClientUploadComplete={(res) => {
                                                                                    const data = res
                                                                                    if (data?.url) {
                                                                                        addMediaItem(data.url, wantMediaType)
                                                                                        setWantMedia(undefined)
                                                                                        toast.success("Music uploaded successfully!")
                                                                                    }
                                                                                }}
                                                                                onUploadError={(error: Error) => {
                                                                                    toast.error(`ERROR! ${error.message}`)
                                                                                }}
                                                                            />
                                                                        )
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === "preview" && (
                                    <motion.div
                                        className="px-6 py-4"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <h3 className="text-lg font-medium mb-4">Step 2: Review Your Post</h3>
                                        <div className="border rounded-lg p-6 bg-white shadow-sm">
                                            <div className="flex items-center gap-3 mb-4">
                                                <CustomAvatar className="h-10 w-10" url={creator.data.profileUrl} />
                                                <div>
                                                    <div className="font-medium">{creator.data.name}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {tiers.data?.find((t) => t.id.toString() === getValues("subscription"))?.name ?? "Public"}
                                                    </div>
                                                </div>
                                            </div>
                                            <h2 className="text-xl font-bold mb-3">{watchedHeading}</h2>
                                            <div
                                                className="prose max-w-none mb-6"
                                                dangerouslySetInnerHTML={{ __html: getValues("content") ?? "" }}
                                            />
                                            {media.length > 0 && (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                                                    {media.map((item, index) => (
                                                        <div
                                                            key={index}
                                                            className="relative aspect-square rounded-md overflow-hidden cursor-pointer border"
                                                            onClick={() => openMediaPreview(item)}
                                                        >
                                                            {item.type === MediaType.IMAGE ? (
                                                                <Image
                                                                    src={item.url ?? "/placeholder.svg"}
                                                                    alt="Media preview"
                                                                    fill
                                                                    className="object-cover"
                                                                />
                                                            ) : item.type === MediaType.VIDEO ? (
                                                                <div className="flex items-center justify-center h-full bg-gray-100">
                                                                    <FileVideo className="h-10 w-10 text-gray-400" />
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-center h-full bg-gray-100">
                                                                    <FileAudio className="h-10 w-10 text-gray-400" />
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center transition-all duration-300">
                                                                <Eye className="text-white opacity-0 hover:opacity-100 h-6 w-6" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex justify-between gap-3 mt-4 pt-4 border-t px-6 pb-6">
                                {currentStep !== "content" ? (
                                    <Button type="button" variant="outline" onClick={goToPreviousStep} className="px-6 bg-transparent">
                                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                                    </Button>
                                ) : (
                                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="px-6">
                                        Cancel
                                    </Button>
                                )}

                                {currentStep !== "preview" ? (
                                    <Button
                                        type="button"
                                        onClick={goToNextStep}
                                        disabled={currentStep === "content" && !isContentStepValid()}
                                    >
                                        Review Post <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Button type="button" disabled={createPostMutation.isLoading} onClick={handleSubmit(onSubmit)}>
                                        {createPostMutation.isLoading ? (
                                            <>
                                                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"></span>
                                                Publishing...
                                            </>
                                        ) : (
                                            <>
                                                <Check className="mr-2 h-4 w-4" /> Publish Post
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </form>
                    </FormProvider>
                </DialogContent>

                {/* Media Preview Dialog */}
                <Dialog open={!!previewMedia} onOpenChange={(open) => !open && closeMediaPreview()}>
                    <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden bg-black/95 border-none text-white">
                        <div className="relative">
                            {previewMedia?.type === MediaType.IMAGE && (
                                <div className="flex items-center justify-center p-4 h-[80vh] max-h-[600px]">
                                    <Image
                                        src={previewMedia.url ?? "/placeholder.svg"}
                                        alt="Media preview"
                                        width={800}
                                        height={600}
                                        className="max-h-full max-w-full object-contain"
                                    />
                                </div>
                            )}

                            {previewMedia?.type === MediaType.VIDEO && (
                                <div className="flex flex-col items-center justify-center p-4 h-[80vh] max-h-[600px]">
                                    <video
                                        ref={videoRef}
                                        src={previewMedia.url}
                                        className="max-h-full max-w-full"
                                        controls={false}
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                        onEnded={() => setIsPlaying(false)}
                                    />
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="bg-black/50 border-white/20 hover:bg-black/70"
                                            onClick={togglePlay}
                                        >
                                            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="bg-black/50 border-white/20 hover:bg-black/70"
                                            onClick={toggleMute}
                                        >
                                            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {previewMedia?.type === MediaType.MUSIC && (
                                <div className="flex flex-col items-center justify-center p-8 h-[50vh]">
                                    <div className="w-64 h-64 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-8">
                                        <Music className="h-24 w-24 text-white" />
                                    </div>
                                    <audio
                                        ref={audioRef}
                                        src={previewMedia.url}
                                        className="hidden"
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                        onEnded={() => setIsPlaying(false)}
                                    />
                                    <div className="flex justify-center gap-4">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="bg-black/50 border-white/20 hover:bg-black/70 h-12 w-12"
                                            onClick={togglePlay}
                                        >
                                            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="bg-black/50 border-white/20 hover:bg-black/70 h-12 w-12"
                                            onClick={toggleMute}
                                        >
                                            {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </Dialog>
        )
}
function EnhanceDescriptionButton({ className }: { className?: string }) {
    const { watch, setValue } = useFormContext<z.infer<typeof PostSchema>>()
    const description = watch("content")
    const [isLoading, setIsLoading] = useState(false)
    const enhanceDescriptionMutation = api.pinAgent.enhanceDescription.useMutation({
        onSuccess: (data) => {
            setValue("content", data.enhancedDescription)
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
            disabled={!description || description.trim().length === 0 || enhanceDescriptionMutation.isLoading}
            className={`${className} h-6 w-6 px-2 text-xs gap-1 hover:bg-primary/10  rounded-full`}
        >
            {enhanceDescriptionMutation.isLoading ? (
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
