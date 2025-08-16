
import { api } from "~/utils/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Separator } from "~/components/shadcn/ui/separator"
import { User, Link, Settings, Copy } from "lucide-react"
import { z } from "zod"
import { Creator, VanitySubscription } from "@prisma/client"
import { type SubmitHandler, useForm } from "react-hook-form"
import { UploadS3Button } from "~/components/common/upload-button"
import toast from "react-hot-toast"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { PLATFORM_ASSET } from "~/lib/stellar/constant"
import { useSession } from "next-auth/react"
import useNeedSign from "~/lib/hook"
import { clientsign } from "package/connect_wallet"
import { clientSelect } from "~/lib/stellar/fan/utils"
import { env } from "~/env"
import { format, formatDistanceToNow } from "date-fns"

export default function CreatorSettings() {
    const session = useSession()
    const creator = api.fan.creator.meCreator.useQuery(undefined, {
        enabled: !!session.data
    })
    const subscription = api.fan.creator.vanitySubscription.useQuery(undefined, {
        enabled: !!session.data
    })
    console.log("creator", creator.data)
    if (creator.data)
        return (

            <div className="min-h-screen ">
                {/* Header Section */}
                <div className="bg-card border-b">
                    <div className="max-w-4xl mx-auto px-6 py-8">
                        <div className="mt-6">
                            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                                <Settings className="h-8 w-8 text-primary" />
                                Creator Settings
                            </h1>
                            <p className="text-muted-foreground mt-2">Manage your creator profile and customize your presence</p>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-6xl mx-auto px-6 py-8">
                    <div className="grid gap-8 lg:grid-cols-2">
                        {/* Profile Settings Card */}
                        <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
                            <CardHeader className="pb-4">
                                <CardTitle className="flex items-center gap-2 text-xl">
                                    <User className="h-5 w-5 text-primary" />
                                    Profile Information
                                </CardTitle>
                                <CardDescription>Update your display name, bio, and profile images</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <About creator={creator.data} />
                            </CardContent>
                        </Card>

                        {/* Vanity URL Card */}
                        <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
                            <CardHeader className="pb-4">
                                <CardTitle className="flex items-center gap-2 text-xl">
                                    <Link className="h-5 w-5 text-primary" />
                                    Custom URL
                                </CardTitle>
                                <CardDescription>Set up your personalized vanity URL for easy sharing</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <VanityURLManager creator={subscription.data as CreatorWithSubscription} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Additional Settings Placeholder */}

                </div>
            </div>

        )
}
export const CreatorAboutShema = z.object({
    description: z.string().max(100, { message: "Bio must be less than 101 characters" }).nullable(),
    name: z
        .string()
        .min(3, { message: "Name must be between 3 to 98 characters" })
        .max(98, { message: "Name must be between 3 to 98 characters" }),
    profileUrl: z.string().nullable().optional(),
})

export function About({ creator }: { creator: Creator }) {
    const mutation = api.fan.creator.updateCreatorProfile.useMutation({
        onSuccess: () => {
            toast.success("Information updated successfully")
        },
    })
    const updateProfileMutation = api.fan.creator.changeCreatorProfilePicture.useMutation({
        onSuccess: () => {
            toast.success("Profile Picture changed successfully")
        },
    })
    const coverChangeMutation = api.fan.creator.changeCreatorCoverPicture.useMutation({
        onSuccess: () => {
            toast.success("Cover Changed Successfully")
        },
    })
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<z.infer<typeof CreatorAboutShema>>({
        resolver: zodResolver(CreatorAboutShema),
        defaultValues: {
            name: creator.name,
            description: creator.bio,
        },
    })

    const onSubmit: SubmitHandler<z.infer<typeof CreatorAboutShema>> = (data) => mutation.mutate(data)

    return (
        <div className="space-y-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <div className="text-center">
                                <h4 className="font-medium text-sm text-foreground mb-1">Profile Picture</h4>
                                <p className="text-xs text-muted-foreground">200 x 200 pixels</p>
                            </div>
                            <div className="flex justify-center">
                                <UploadS3Button
                                    endpoint="profileUploader"
                                    onClientUploadComplete={(res) => {
                                        const fileUrl = res.url
                                        updateProfileMutation.mutate(fileUrl)
                                    }}
                                    onUploadError={(error: Error) => {
                                        toast.error(`ERROR! ${error.message}`)
                                    }}
                                    type="profile"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="text-center">
                                <h4 className="font-medium text-sm text-foreground mb-1">Cover Image</h4>
                                <p className="text-xs text-muted-foreground">851 x 315 pixels</p>
                            </div>
                            <div className="flex justify-center">
                                <UploadS3Button
                                    endpoint="coverUploader"
                                    onClientUploadComplete={(res) => {
                                        const fileUrl = res.url
                                        coverChangeMutation.mutate(fileUrl)
                                    }}
                                    onUploadError={(error: Error) => {
                                        toast.error(`ERROR! ${error.message}`)
                                    }}
                                    type="cover"
                                />
                            </div>
                        </div>
                    </div>

                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Display Name</label>
                        <input
                            type="text"
                            placeholder="Enter your display name..."
                            {...register("name")}
                            className="input input-bordered w-full focus:ring-2 focus:ring-primary/20"
                        />
                        <p className="text-xs text-muted-foreground">Name must be between 3 to 98 characters</p>
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Bio</label>
                        <textarea
                            {...register("description")}
                            className="textarea textarea-bordered h-24 w-full focus:ring-2 focus:ring-primary/20 resize-none"
                            placeholder="Tell your audience about yourself..."
                        />
                        <p className="text-xs text-muted-foreground">Bio can be up to 101 characters</p>
                        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
                    </div>
                </div>

                <button
                    className="btn btn-primary w-full h-11 text-base font-medium"
                    type="submit"
                    disabled={mutation.isLoading}
                >
                    {mutation.isLoading && <span className="loading loading-spinner loading-sm"></span>}
                    Save Changes
                </button>
            </form>
        </div>
    )
}
const VanityURLSchema = z.object({
    vanityURL: z.string().min(2).max(30),
})

type VanityURLFormData = z.infer<typeof VanityURLSchema>

export type CreatorWithSubscription = Creator & {
    vanitySubscription: VanitySubscription | null
}

export function VanityURLManager({ creator }: { creator: CreatorWithSubscription }) {
    const [subscriptionStatus, setSubscriptionStatus] = useState<"active" | "expired" | "none">("none")
    const changingCost = PLATFORM_ASSET.code.toLocaleLowerCase() === "wadzzo" ? 500 : 750000
    const settingCost = PLATFORM_ASSET.code.toLocaleLowerCase() === "wadzzo" ? 200 : 300000
    const session = useSession()
    const [loading, setLoading] = useState(false)
    const { needSign } = useNeedSign()
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null)

    const CreateOrUpdateVanityURL = api.fan.creator.createOrUpdateVanityURL.useMutation({
        onSuccess: (data, variables) => {
            if (variables.isChanging) {
                toast.success("Vanity URL changed successfully")
            } else {
                toast.success("Vanity URL set successfully")
            }
        },
        onError: (error) => {
            toast.error(`Error: ${error.message}`)
        },
    })

    const mutation = api.fan.creator.updateVanityURL.useMutation({
        onSuccess: async (data, variables) => {
            if (data) {
                try {
                    setLoading(true)
                    const clientResponse = await clientsign({
                        presignedxdr: data,
                        walletType: session.data?.user?.walletType,
                        pubkey: session.data?.user?.id,
                        test: clientSelect(),
                    })
                    if (clientResponse) {
                        setLoading(true)
                        CreateOrUpdateVanityURL.mutate({
                            amount: variables.cost,
                            isChanging: variables.isChanging,
                            vanityURL: variables.vanityURL ?? "",
                        })
                        setLoading(false)
                        reset()
                    } else {
                        setLoading(false)
                        reset()
                        toast.error("Error in signing transaction")
                    }
                } catch (error) {
                    setLoading(false)
                    console.error("", error)
                    reset()
                }
            }
        },
        onError: (error) => {
            toast.error(`Error: ${error.message}`)
        },
    })

    const { data: updatedCreator, refetch: refetchCreator } = api.fan.creator.meCreator.useQuery(undefined, {
        initialData: creator,
        refetchInterval: false,
    })

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
        watch,
    } = useForm<VanityURLFormData>({
        resolver: zodResolver(VanityURLSchema),
        defaultValues: {
            vanityURL: updatedCreator?.vanityURL ?? "",
        },
    })
    const checkAvailability = api.fan.creator.checkVanityURLAvailability.useQuery(
        { vanityURL: watch("vanityURL") },
        {
            onSuccess: (data) => {
                //console.log("data", data)
                setIsAvailable(data.isAvailable)
            },
        },
    )
    useEffect(() => {
        const subscription = watch((value, { name }) => {
            if (name === "vanityURL" && value.vanityURL && value.vanityURL !== updatedCreator?.vanityURL) {
                checkAvailability.refetch()
            }
        })
        return () => subscription.unsubscribe()
    }, [watch, checkAvailability, updatedCreator?.vanityURL])

    useEffect(() => {
        if (creator?.vanitySubscription) {
            setSubscriptionStatus(creator.vanitySubscription.endDate >= new Date() ? "active" : "expired")
        } else {
            setSubscriptionStatus("none")
        }
        reset({ vanityURL: updatedCreator?.vanityURL ?? "" })
    }, [updatedCreator, reset])

    const onSubmit = (data: VanityURLFormData) => {
        if (data.vanityURL === updatedCreator?.vanityURL && subscriptionStatus === "active") {
            toast.error("No changes detected")
            return
        }
        if (data.vanityURL === "") {
            toast.error("Vanity URL cannot be empty")
            return
        }
        if (!isAvailable) {
            toast.error("This vanity URL is not available")
            return
        }

        mutation.mutate({
            vanityURL:
                subscriptionStatus === "active" || subscriptionStatus === "none" ? data.vanityURL : updatedCreator?.vanityURL,
            cost: subscriptionStatus === "active" ? changingCost : settingCost,
            isChanging: subscriptionStatus === "active" ? true : false,
            signWith: needSign(),
        })
    }
    const copyToClipboard = () => {
        const vanityURL = `${env.NEXT_PUBLIC_ASSET_CODE.toLocaleLowerCase() === "wadzzo" ? "https://app.wadzzo.com" : "https://bandcoin.io"}/${watch("vanityURL")}`
        navigator.clipboard
            .writeText(vanityURL)
            .then(() => {
                toast.success("Vanity URL copied to clipboard")
            })
            .catch((err) => {
                console.error("Failed to copy: ", err)
                toast.error("Failed to copy Vanity URL")
            })
    }
    return (
        <div className="space-y-6 bg-base-200 p-6 rounded-lg shadow-md w-full">
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Custom URL</h3>
                <p className="text-sm text-muted-foreground">Create a memorable link for your creator page</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">Your Vanity URL</label>
                        <button
                            type="button"
                            onClick={copyToClipboard}
                            className="btn btn-ghost btn-xs gap-1"
                            aria-label="Copy Vanity URL"
                        >
                            <Copy className="h-3 w-3" />
                            Copy
                        </button>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center bg-muted/50 rounded-lg p-3 gap-2">
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {env.NEXT_PUBLIC_ASSET_CODE.toLocaleLowerCase() === "wadzzo" ? "app.wadzzo.com" : "bandcoin.io"}/
                            </span>
                            <input
                                disabled={subscriptionStatus === "expired"}
                                type="text"
                                onInput={(e) => (e.currentTarget.value = e.currentTarget.value.toLowerCase())}
                                {...register("vanityURL")}
                                className={`input input-bordered flex-1 ${isAvailable === true ? "border-success" : isAvailable === false ? "border-error" : ""
                                    }`}
                                placeholder="your-custom-url"
                            />
                        </div>

                        {isAvailable !== null && (
                            <div className={`text-xs font-medium ${isAvailable ? "text-success" : "text-error"}`}>
                                {isAvailable ? "✓ Available" : "✗ Not Available"}
                            </div>
                        )}
                    </div>

                    {errors.vanityURL && <p className="text-xs text-destructive">{errors.vanityURL.message}</p>}
                </div>

                <div className="space-y-3">
                    {subscriptionStatus === "none" && (
                        <button disabled={loading || mutation.isLoading} type="submit" className="btn btn-primary w-full h-11">
                            Set Vanity URL
                        </button>
                    )}
                    {subscriptionStatus === "active" && (
                        <button
                            type="submit"
                            disabled={loading || mutation.isLoading || updatedCreator?.vanityURL === ""}
                            className="btn btn-secondary w-full h-11"
                        >
                            Change Vanity URL
                        </button>
                    )}
                    {subscriptionStatus === "expired" && (
                        <button
                            disabled={loading || mutation.isLoading || updatedCreator?.vanityURL === ""}
                            type="submit"
                            className="btn btn-secondary w-full h-11"
                        >
                            Renew Vanity URL
                        </button>
                    )}
                </div>
            </form>

            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Pricing Information</p>
                    <p>
                        {subscriptionStatus === "active"
                            ? `Changing your vanity URL costs ${PLATFORM_ASSET.code.toLocaleLowerCase() === "wadzzo" ? "500 Wadzzo" : "750,000 Bandcoin"}.`
                            : `Setting up a vanity URL costs ${PLATFORM_ASSET.code.toLocaleLowerCase() === "wadzzo" ? "200 Wadzzo" : "300,000 Bandcoin"} per month.`}
                    </p>
                </div>

                {subscriptionStatus !== "none" && (
                    <div className="border-t border-border pt-3">
                        <h4 className="font-medium text-foreground mb-2">Subscription Status</h4>
                        <div className="space-y-1 text-sm">
                            <p className={`font-medium ${subscriptionStatus === "active" ? "text-success" : "text-error"}`}>
                                {subscriptionStatus === "active" ? "● Active" : "● Expired"}
                            </p>
                            {creator.vanitySubscription && (
                                <>
                                    <p className="text-muted-foreground">
                                        Start: {format(new Date(creator.vanitySubscription.startDate), "MMM dd, yyyy")}
                                    </p>
                                    <p className="text-muted-foreground">
                                        End: {format(new Date(creator.vanitySubscription.endDate), "MMM dd, yyyy")}
                                    </p>
                                    {subscriptionStatus === "active" && (
                                        <p className="text-muted-foreground">
                                            Expires in: {formatDistanceToNow(new Date(creator.vanitySubscription.endDate))}
                                        </p>
                                    )}
                                    <p className="text-muted-foreground">
                                        Last Payment: {creator.vanitySubscription?.lastPaymentAmount} {PLATFORM_ASSET.code}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
