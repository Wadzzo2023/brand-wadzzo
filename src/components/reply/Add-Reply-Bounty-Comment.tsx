import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
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
              className="w-full  border  shadow-sm shadow-slate-300"
            />
            <Button
              disabled={ReplyMutation.isLoading || !contentValue?.trim()}
              className="flex items-center gap-1 shadow-sm shadow-black"
              type="submit"
            >
              {ReplyMutation.isLoading && (
                <span className="loading loading-spinner" />
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
