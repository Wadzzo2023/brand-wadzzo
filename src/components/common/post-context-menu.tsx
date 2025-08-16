import { useSession } from "next-auth/react";
import { api } from "~/utils/api";
import ContextMenu from "./context-menu";

export function PostContextMenu({
    creatorId,
    postId,
    setDeletePostId
}: {
    creatorId: string;
    postId: number;
    setDeletePostId: (postId: number) => void;
}) {
    const { data } = useSession();
    const deletePost = api.fan.post.deletePost.useMutation();

    const handleDelete = () => {
        setDeletePostId(postId);
        deletePost.mutate(postId)
    };

    if (data?.user && data.user.id === creatorId) {
        return (
            <ContextMenu
                handleDelete={handleDelete}
                isLoading={deletePost.isLoading}
            />
        );
    }
}
