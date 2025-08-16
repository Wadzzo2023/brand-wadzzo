import { zodResolver } from "@hookform/resolvers/zod";

import { Send } from "lucide-react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "~/utils/api";
import { Button } from "../shadcn/ui/button";
import { Textarea } from "../shadcn/ui/textarea";
import { Spinner } from "../shadcn/ui/spinner";

export const BountyCommentSchema = z.object({
  bountyId: z.number(),
  parentId: z.number().optional(),
  content: z
    .string()
    .min(1, { message: "Minimum 5 character is required!" })
    .trim(),
});

export function AddBountyComment({ bountyId }: { bountyId: number }) {
  const createBountyCommentMutation =
    api.bounty.Bounty.createBountyComment.useMutation({
      onSuccess: () => {
        reset();
      },
    });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof BountyCommentSchema>>({
    resolver: zodResolver(BountyCommentSchema),
    defaultValues: { bountyId: bountyId },
  });
  const contentValue = watch("content");

  const onSubmit: SubmitHandler<z.infer<typeof BountyCommentSchema>> = (
    data,
  ) => {
    createBountyCommentMutation.mutate(data);
  };

  return (
    <div className=" px-4 pb-2 ">
      <form onSubmit={handleSubmit(onSubmit)}>
        <label className="form-control ">
          <div className="flex items-center  gap-2">
            <Textarea
              {...register("content")}
              className="w-full  border  shadow-sm shadow-slate-300"
            />
            <Button
              disabled={
                createBountyCommentMutation.isLoading || !contentValue?.trim()
              }
              className="flex items-center gap-1 shadow-sm shadow-black"
              type="submit"
            >
              {createBountyCommentMutation.isLoading ? (
                <Spinner
                  size='small'
                  className="text-black" />
              ) : (
                <Send size={14} />
              )}
              Comment
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
