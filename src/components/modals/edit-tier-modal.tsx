"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Pencil, Trash2, AlertTriangle } from "lucide-react"
import React from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { Label } from "~/components/shadcn/ui/label"

// import { api } from "~/utils/api"

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/shadcn/ui/dialog"

import toast from "react-hot-toast"
import { Editor } from "../common/quill-editor"
import { z } from "zod"
import { api } from "~/utils/api"

export type SubscriptionType = {
    id: number
    name: string
    features: string
    price: number
    creatorId: string
}

export const EditTierSchema = z.object({
    name: z
        .string()
        .min(4, { message: "Must be a minimum of 4 characters" })
        .max(12, { message: "Must be a maximum of 12 characters" })
        .refine(
            (value) => {
                return /^\w+$/.test(value)
            },
            {
                message: "Input must be a single word",
            },
        ),
    price: z
        .number({
            required_error: "Price must be entered as a number",
            invalid_type_error: "Price must be entered as a number",
        })
        .min(1, {
            message: "Price must be greater than 0",
        }),
    featureDescription: z.string().min(20, { message: "Description must be longer than 20 characters" }),
    id: z.number(),
})

export default function EditTierModal({ item }: { item: SubscriptionType }) {
    const [isOpen, setIsOpen] = React.useState(false)

    const mutation = {
        mutate: (data: z.infer<typeof EditTierSchema>) => {
            console.log("Updating tier:", data)
            setTimeout(() => {
                toast.success("Tier updated successfully")
                setIsOpen(false)
            }, 1000)
        },
        isLoading: false,
    }

    const {
        register,
        handleSubmit,
        formState: { errors },
        getValues,
        setValue,
        reset,
    } = useForm<z.infer<typeof EditTierSchema>>({
        resolver: zodResolver(EditTierSchema),
        defaultValues: {
            featureDescription: item.features,
            name: item.name,
            price: item.price,
            id: item.id,
        },
    })

    const onSubmit: SubmitHandler<z.infer<typeof EditTierSchema>> = (data) => {
        mutation.mutate(data)
    }

    function handleEditorChange(value: string): void {
        setValue("featureDescription", value)
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted">
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit tier</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-3">
                    <DialogTitle className="text-2xl font-semibold text-center">Edit Subscription Tier</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-sm font-medium">
                                Tier Name
                            </Label>
                            <Input
                                id="name"
                                placeholder="Enter tier name"
                                {...register("name")}
                                className={errors.name ? "border-destructive" : ""}
                            />
                            {errors.name && (
                                <p className="text-sm text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {errors.name.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="price" className="text-sm font-medium">
                                Price
                            </Label>
                            <Input
                                id="price"
                                type="number"
                                step="1"
                                min="1"
                                placeholder="Enter price"
                                {...register("price", { valueAsNumber: true })}
                                className={errors.price ? "border-destructive" : ""}
                            />
                            {errors.price && (
                                <p className="text-sm text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {errors.price.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Tier Features</Label>
                            <div className="min-h-[200px] border rounded-md">
                                <Editor onChange={handleEditorChange} value={getValues("featureDescription")} />
                            </div>
                            {errors.featureDescription && (
                                <p className="text-sm text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {errors.featureDescription.message}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <Button type="submit" disabled={mutation.isLoading} className="w-full">
                            {mutation.isLoading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                    Saving Changes...
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </Button>

                        <DeleteTier id={item.id} />
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function DeleteTier({ id }: { id: number }) {
    const [isOpen, setIsOpen] = React.useState(false)

    const mutation = api.fan.member.deleteTier.useMutation({
        onSuccess: () => {
            toast.success("Tier deleted");
            setIsOpen(false);
        },
    });
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground bg-transparent"
                    disabled={mutation.isLoading}
                >
                    {mutation.isLoading ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                            Deleting...
                        </>
                    ) : (
                        <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Tier
                        </>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <DialogTitle className="text-center">Delete Tier</DialogTitle>
                </DialogHeader>

                <div className="text-center text-muted-foreground">
                    <p>
                        Are you sure you want to delete this tier? This action cannot be undone and will remove all associated data.
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <DialogClose asChild>
                        <Button variant="outline" className="w-full sm:w-auto bg-transparent">
                            Cancel
                        </Button>
                    </DialogClose>
                    <Button
                        variant="destructive"
                        onClick={() => mutation.mutate({ id })}
                        disabled={mutation.isLoading}
                        className="w-full sm:w-auto"
                    >
                        {mutation.isLoading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Deleting...
                            </>
                        ) : (
                            "Delete Tier"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
