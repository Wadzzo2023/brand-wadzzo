import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Loader2 } from "lucide-react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { type z } from "zod";
import { api } from "~/utils/api";
import { BountyCommentSchema } from "../comment/Add-Bounty-Comment";
import { Button } from "../shadcn/ui/button";
import { Textarea } from "../shadcn/ui/textarea";

export function AddBountyReplyComment({
  parentId,
  bountyId,
}: {
  parentId: number;
  bountyId: number;
}) {
  const ReplyMutation = api.bounty.Bounty.createBountyComment.useMutation({
    onSuccess: (data) => {
      // console.log(data);
      reset();
    },
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof BountyCommentSchema>>({
    resolver: zodResolver(BountyCommentSchema),
    defaultValues: { parentId: parentId, bountyId: bountyId, content: "" },
  });
  const contentValue = watch("content");
  const onSubmit: SubmitHandler<z.infer<typeof BountyCommentSchema>> = (
    data,
  ) => {
    ReplyMutation.mutate(data);
  };

  return (
    <div className=" ">
      <form onSubmit={handleSubmit(onSubmit)}>
        <label className="form-control ">
          <div className="flex w-full  items-center gap-2">
            <Textarea
              {...register("content")}
              className="w-full  border  shadow-xs shadow-slate-300"
            />
            <Button
              disabled={ReplyMutation.isPending || !contentValue?.trim()}
              className="flex items-center gap-1 shadow-xs shadow-black"
              type="submit"
            >
              {ReplyMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              <Send size={14} /> Reply
            </Button>
          </div>
          {errors.content && (
            <div className="label">
              <span className="label-text-alt text-warning">
                {errors.content.message}
              </span>
            </div>
          )}
        </label>
      </form>
    </div>
  );
}
