"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, AlertTriangle } from "lucide-react"
import React from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import toast from "react-hot-toast"
import { z } from "zod"

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/shadcn/ui/dialog"
import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { Label } from "~/components/shadcn/ui/label"
import { BADWORDS } from "~/utils/banned-word"
import { Editor } from "../common/quill-editor"
import { api } from "~/utils/api"

export const TierSchema = z.object({
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
        )
        .refine(
            (value) => {
                return !BADWORDS.some((word) => value.includes(word))
            },
            {
                message: "Input contains banned words.",
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
    featureDescription: z.string().min(10, { message: "Make description longer" }),
})


export default function AddTierModal() {
    const [isOpen, setIsOpen] = React.useState(false)

    const mutation = api.fan.member.createMembership.useMutation({
        onSuccess: () => {
            toast.success("Tier created successfully");
            setIsOpen(false);
            reset();
        },
    });


    const {
        register,
        handleSubmit,
        formState: { errors },
        getValues,
        setValue,
        reset,
    } = useForm<z.infer<typeof TierSchema>>({
        resolver: zodResolver(TierSchema),
        defaultValues: {},
    })

    const onSubmit: SubmitHandler<z.infer<typeof TierSchema>> = (data) => {
        mutation.mutate(data)
    }

    function handleEditorChange(value: string): void {
        setValue("featureDescription", value)
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="lg" className="rounded-full shadow-lg hover:shadow-xl transition-all duration-300 h-14 w-14 p-0">
                    <Plus className="h-6 w-6" />
                    <span className="sr-only">Add new tier</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-3">
                    <DialogTitle className="text-2xl font-semibold text-center">Create New Subscription Tier</DialogTitle>
                    <p className="text-muted-foreground text-center">
                        Set up a new tier with custom pricing and exclusive features for your subscribers.
                    </p>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-sm font-medium">
                                Tier Name
                            </Label>
                            <Input
                                id="name"
                                placeholder="e.g., Basic, Premium, VIP"
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
                                Required Asset Amount
                            </Label>
                            <Input
                                id="price"
                                type="number"
                                step="1"
                                min="1"
                                placeholder="Enter minimum asset requirement"
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
                            <Label className="text-sm font-medium">Tier Features & Benefits</Label>
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

                    <DialogFooter className="gap-2 sm:gap-0 pt-6">
                        <DialogClose asChild>
                            <Button variant="outline" className="w-full sm:w-auto bg-transparent">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button type="submit" disabled={mutation.isLoading} className="w-full sm:w-auto">
                            {mutation.isLoading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                    Creating Tier...
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Tier
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
