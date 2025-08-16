"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Send } from 'lucide-react'
import { SubmitHandler, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { api } from "~/utils/api"

import { useSession } from "next-auth/react"
import { Button } from "~/components/shadcn/ui/button"
import { Textarea } from "~/components/shadcn/ui/textarea"
import { cn } from "~/lib/utils"
import CustomAvatar from "~/components/common/custom-avatar"

export const CommentSchema = z.object({
    content: z.string().min(1, "Comment cannot be empty").max(1000, "Comment is too long"),
    postId: z.number(),
    parentId: z.number().optional(),
})

export function AddPostComment({ postId }: { postId: number }) {
    const { data: session } = useSession()
    const [isFocused, setIsFocused] = useState(false)

    const commentMutation = api.fan.post.createComment.useMutation({
        onSuccess: () => {
            reset()
            setIsFocused(false)
        },
    })

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors },
    } = useForm<z.infer<typeof CommentSchema>>({
        resolver: zodResolver(CommentSchema),
        defaultValues: { postId, content: "" },
    })

    const contentValue = watch("content")

    const onSubmit: SubmitHandler<z.infer<typeof CommentSchema>> = (data) => {
        commentMutation.mutate(data)
    }

    return (
        <motion.div
            className="flex gap-2 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="flex-shrink-0">
                <CustomAvatar url={session?.user.image ?? ""} />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex-1">
                <div className="space-y-2">
                    <div className="relative">
                        <Textarea
                            {...register("content")}
                            placeholder="Write a comment..."
                            className={cn(
                                "min-h-[40px] resize-none transition-all duration-200 pr-10",
                                isFocused ? "min-h-[80px]" : "min-h-[40px]"
                            )}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => !contentValue && setIsFocused(false)}
                        />

                        <Button
                            type="submit"
                            size="sm"
                            variant="sidebarAccent"
                            className="absolute right-2 bottom-2 h-8 w-8 p-0  shadow-sm shadow-foreground"
                            disabled={commentMutation.isLoading || !contentValue?.trim()}
                        >
                            {commentMutation.isLoading ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : (
                                <Send size={16} />
                            )}
                            <span className="sr-only">Send comment</span>
                        </Button>
                    </div>

                    {errors.content && (
                        <p className="text-xs text-destructive">{errors.content.message}</p>
                    )}
                </div>
            </form>
        </motion.div>
    )
}
