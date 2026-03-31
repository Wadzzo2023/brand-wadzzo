import clsx from "clsx";
import { format } from "date-fns";
import {
    AlertTriangle,
    ArrowDown,
    ArrowRight,
    Award,
    Calendar,
    CheckCircle,
    ChevronDown,
    Clock,
    Crown,
    DollarSign,
    Edit,
    Eye,
    File,
    FileIcon,
    FilePlus,
    FileText,
    FileX,
    Loader2,
    MapPin,
    MessageCircle,
    MessageSquare,
    MessageSquareIcon,
    Paperclip,
    Search,
    Send,
    Trash,
    Trophy,
    UserPlus,
    Users,
    XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { submitSignedXDRToServer4User } from "package/connect_wallet/src/lib/stellar/trx/payment_fb_g";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
    AdvancedMarker,
    APIProvider,
    Map,
    Marker,
} from "@vis.gl/react-google-maps";
import { motion, AnimatePresence } from "framer-motion";

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "~/components/shadcn/ui/avatar";
import { Badge } from "~/components/shadcn/ui/badge";
import { Button } from "~/components/shadcn/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/shadcn/ui/card";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/shadcn/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/shadcn/ui/select";
import { Separator } from "~/components/shadcn/ui/separator";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "~/components/shadcn/ui/tabs";

import useNeedSign from "~/lib/hook";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import {
    PLATFORM_ASSET,
    PLATFORM_FEE,
    TrxBaseFeeInPlatformAsset,
} from "~/lib/stellar/constant";

import { useSession } from "next-auth/react";

import { api } from "~/utils/api";

import {
    Bounty,
    BountySubmission,
    SubmissionAttachment,
    SubmissionViewType,
    UserRole,
} from "@prisma/client";
import { clientsign, WalletType } from "package/connect_wallet";
import { Input } from "~/components/shadcn/ui/input";

import { clientSelect } from "~/lib/stellar/fan/utils";
import { cn } from "~/lib/utils";
import { addrShort } from "~/utils/utils";
import Loading from "~/components/common/loading";
import { Alert } from "~/components/shadcn/ui/alert";
import CustomAvatar from "~/components/common/custom-avatar";
import Chat from "~/components/chat/chat";
import ViewBountyComment from "~/components/comment/View-Bounty-Comment";
import { AddBountyComment } from "~/components/comment/Add-Bounty-Comment";
import DOMPurify from "isomorphic-dompurify";
import EditBountyModal from "~/components/modals/edit-bounty-modal";
import ViewBountyAttachmentModal from "~/components/modals/view-bounty-attachment-modal";
type Message = {
    role: UserRole;
    message: string;
};
function SafeHTML({ html }: { html: string }) {
    return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
const SingleBountyPage = () => {
    const router = useRouter();
    const { id } = router.query;
    const { data: Owner } = api.bounty.Bounty.isOwnerOfBounty.useQuery({
        BountyId: Number(id),
    });

    return (
        <div className="relative flex h-full  w-full flex-col gap-4 overflow-y-auto scrollbar-hide ">
            {Owner?.isOwner && <AdminBountyPage />}
        </div>
    );
};

export default SingleBountyPage;


interface extendedBountySubmission extends BountySubmission {
    user: {
        id: string;
        name?: string | null;
        image?: string | null;
    };
    userWinCount: number;
}

const AdminBountyPage = () => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [attachmentData, setAttachmentData] = useState<SubmissionAttachment[]>([]);
    const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
    const [bountyId, setBountyId] = useState<number>(0);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const router = useRouter();
    const [loadingBountyId, setLoadingBountyId] = useState<number | null>(null);
    const { needSign } = useNeedSign();
    const [input, setInput] = useState("");
    const inputLength = input.trim().length;
    const [messages, setMessages] = useState<Message[]>([]);
    const [isDialogOpenWinner, setIsDialogOpenWinner] = useState(false);
    const { id } = router.query;
    const [selectedSubmission, setSelectedSubmission] =
        useState<extendedBountySubmission | null>(null);


    const { data, isLoading: bountyLoading } =
        api.bounty.Bounty.getBountyByID.useQuery(
            {
                BountyId: Number(id),
            },
            {
                enabled: !!Number(id),
            },
        );

    const DeleteMutation = api.bounty.Bounty.deleteBounty.useMutation({
        onSuccess: async (data, variables) => {
            setLoadingBountyId(variables.BountyId);
            await router.push("/artist/bounty");
            toast.success("Bounty Deleted");
            setLoadingBountyId(null);
        },
        onError: (error) => {
            toast.error(error.message);
            setLoadingBountyId(null);
        },
    });

    const { data: allSubmission, isLoading: allSubmissionLoading } =
        api.bounty.Bounty.getBountyAllSubmission.useQuery(
            {
                BountyId: Number(id),
            },
            {
                enabled: !!Number(id),
            },
        );

    const bountyComment = api.bounty.Bounty.getBountyComments.useQuery(
        {
            bountyId: Number(id),
        },
        {
            enabled: !!Number(id),
        },
    );

    const GetDeleteXDR = api.bounty.Bounty.getDeleteXdr.useMutation({
        onSuccess: async (data, variables) => {
            setLoadingBountyId(variables.bountyId);
            if (data) {
                const res = await submitSignedXDRToServer4User(data);
                if (res) {
                    DeleteMutation.mutate({
                        BountyId: GetDeleteXDR.variables?.bountyId ?? 0,
                    });
                }
            }
            setLoadingBountyId(null);
        },
        onError: (error) => {
            toast.error(error.message);
            setLoadingBountyId(null);
        },
    });

    const MakeWinnerMutation = api.bounty.Bounty.makeBountyWinner.useMutation({
        onSuccess: async (data, variables) => {
            setLoadingBountyId(variables.BountyId);
            toast.success("Winner Marked");
            setLoadingBountyId(null);
            setIsDialogOpenWinner(false);
        },
    });

    const GetSendBalanceToWinnerXdr =
        api.bounty.Bounty.getSendBalanceToWinnerXdr.useMutation({
            onSuccess: async (data, variables) => {
                setLoadingBountyId(variables.BountyId);
                if (data) {
                    const res = await submitSignedXDRToServer4User(data);
                    if (res) {
                        MakeWinnerMutation.mutate({
                            BountyId: variables?.BountyId,
                            userId: variables?.userId,
                        });
                    }
                }
                setLoadingBountyId(null);
            },
            onError: (error) => {
                toast.error(error.message);
                setLoadingBountyId(null);
            },
        });

    const handleWinner = (bountyId: number, userId: string, prize: number) => {
        setLoadingBountyId(bountyId);
        GetSendBalanceToWinnerXdr.mutate({
            BountyId: bountyId,
            userId: userId,
            prize: prize,
        });
        setLoadingBountyId(null);
    };

    const handleDelete = (id: number, prize: number) => {
        setLoadingBountyId(id);
        GetDeleteXDR.mutate({ prize: prize, bountyId: id });
        setLoadingBountyId(null);
    };

    const UpdateSubmissionStatusMutation =
        api.bounty.Bounty.updateBountySubmissionStatus.useMutation();

    const updateSubmissionStatus = (
        creatorId: string,
        submissionId: number,
        status: SubmissionViewType,
    ) => {
        UpdateSubmissionStatusMutation.mutate({
            creatorId: creatorId,
            submissionId: submissionId,
            status: status,
        });
    };

    if (bountyLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin " />
                    <p className="text-lg font-medium">Loading bounty details...</p>
                </div>
            </div>
        );
    }

    if (data)
        return (
            <div className="">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                    className="mx-auto max-w-6xl "
                >
                    <Card className="overflow-hidden border-0 shadow-xll ">
                        <div className="relative">

                            <motion.div
                                initial={{ scale: 1.05, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.7, ease: "easeOut" }}
                                className="h-80 w-full"
                            >
                                <img
                                    src={data?.imageUrls[0] ?? "/images/loading.png"}
                                    alt={data?.title}
                                    width={1200}
                                    height={600}
                                    className="h-80 w-full object-cover"
                                    priority
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                            </motion.div>


                            {/* Title and Creator Info - Overlay on image */}
                            <div className="absolute bottom-0 left-0 right-0 z-10 p-6">
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent"></div>
                                <div className="relative z-10 flex items-end justify-between">
                                    <motion.div
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ duration: 0.5, delay: 0.3 }}
                                        className="flex-1"
                                    >
                                        <h1 className="mb-3 text-3xl font-bold text-white drop-shadow-lg md:text-4xl">
                                            {data?.title}
                                        </h1>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Badge
                                                variant="default"
                                                className="bg-primary/90 shadow-sm hover:bg-primary"
                                            >
                                                <Trophy className="mr-1 h-4 w-4" />
                                                {data?.priceInUSD} USD
                                            </Badge>
                                            <Badge variant="secondary" className=" shadow-sm">
                                                <Award className="mr-1 h-4 w-4" />
                                                {data?.priceInBand.toFixed(3)}{" "}
                                                {PLATFORM_ASSET.code.toLocaleUpperCase()}
                                            </Badge>
                                            <Badge
                                                variant="outline"
                                                className="border-white/30 bg-black/40 text-white shadow-sm backdrop-blur-sm"
                                            >
                                                <Users className="mr-1 h-4 w-4" />
                                                {data?._count.participants} participants
                                            </Badge>
                                        </div>
                                    </motion.div>

                                    <motion.div
                                        initial={{ x: 20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ duration: 0.5, delay: 0.4 }}
                                        className="hidden items-center gap-3 rounded-lg bg-black/20 p-2 backdrop-blur-sm md:flex"
                                    >
                                        <CustomAvatar
                                            className="h-8 w-8"
                                            url={data?.creator.profileUrl}
                                        />
                                        <div className="flex items-center justify-center gap-2">
                                            <p className="text-sm text-white/90">Created by</p>
                                            <Link
                                                href={`/artist/${data?.creator.id}`}
                                                className="hover: font-medium text-white transition-colors"
                                            >
                                                {data?.creator.name}
                                            </Link>
                                        </div>
                                    </motion.div>
                                </div>
                            </div>
                        </div>
                        <CardContent className="px-6 pb-2 pt-6">
                            <Tabs defaultValue="details" className="w-full">
                                <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
                                    <TabsList className="h-auto space-x-6 bg-transparent p-0">
                                        {[
                                            { id: "details", label: "Details", icon: Trophy },
                                            {
                                                id: "submissions",
                                                label: "Submissions",
                                                icon: Paperclip,
                                            },
                                            { id: "doubt", label: "Chat", icon: MessageSquare },
                                            {
                                                id: "comments",
                                                label: "Comments",
                                                icon: MessageSquare,
                                            },
                                        ].map((tab) => (
                                            <TabsTrigger
                                                key={tab.id}
                                                value={tab.id}
                                                className="data-[state=active]: group relative rounded-none bg-transparent px-2 py-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <tab.icon size={18} />
                                                    <span>{tab.label}</span>
                                                </div>
                                                <motion.div
                                                    className="absolute -bottom-[1px] left-0 right-0 h-0.5 scale-x-0 rounded-full bg-primary opacity-0 transition-all duration-200 group-data-[state=active]:scale-x-100 group-data-[state=active]:opacity-100"
                                                    initial={{ opacity: 0, scaleX: 0 }}
                                                />
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                </div>

                                <TabsContent value="details" className="mt-0 space-y-6">
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4 }}
                                        className="prose prose-slate dark:prose-invert max-w-none"
                                    >
                                        <SafeHTML html={data.description} />
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="submissions" className="mt-0">
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                                Recent Submissions ({data?._count.submissions})
                                            </h2>
                                        </div>

                                        {allSubmission?.length === 0 ? (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.4 }}
                                                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 dark:border-slate-700 dark:bg-slate-800/50"
                                            >
                                                <div className="mb-4 text-slate-400 dark:text-slate-500">
                                                    <Paperclip size={48} />
                                                </div>
                                                <h3 className="mb-1 text-lg font-medium text-slate-900 dark:text-white">
                                                    No submissions yet
                                                </h3>
                                                <p className="max-w-md text-center text-slate-500 dark:text-slate-400">
                                                    There are no submissions for this bounty yet.
                                                </p>
                                            </motion.div>
                                        ) : (
                                            <AnimatePresence>
                                                <div className="space-y-4">
                                                    {allSubmissionLoading ? (
                                                        <div className="flex justify-center py-8">
                                                            <Loader2 className="h-8 w-8 animate-spin " />
                                                        </div>
                                                    ) : (
                                                        allSubmission?.map((submission, idx) => (
                                                            <motion.div
                                                                key={submission.id}
                                                                initial={{ opacity: 0, y: 20 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                transition={{ duration: 0.3, delay: idx * 0.1 }}
                                                                className="group relative"
                                                            >
                                                                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 group-hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                                                                    <div className="mb-4 flex items-center">
                                                                        <CustomAvatar
                                                                            className="h-12 w-12"
                                                                            winnerCount={submission.userWinCount}
                                                                            url={submission.user.image}
                                                                        />
                                                                        <div className="flex w-full items-center justify-between">
                                                                            <div className="ml-3">
                                                                                <div className="text-sm font-medium">
                                                                                    {submission.user.name}
                                                                                </div>
                                                                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                                                                    {format(
                                                                                        new Date(submission.createdAt),
                                                                                        "MMM dd, yyyy",
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <SubmissionStatusSelect
                                                                                defaultValue={
                                                                                    submission.status as string
                                                                                }
                                                                                submissionId={submission.id}
                                                                                creatorId={data.creatorId}
                                                                                updateSubmissionStatus={
                                                                                    updateSubmissionStatus
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="mb-4">
                                                                        {submission.content.length > 400 ? (
                                                                            <ShowMore content={submission.content} />
                                                                        ) : (
                                                                            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                                                                                <SafeHTML html={submission?.content} />
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="mt-4 flex flex-wrap gap-3">
                                                                        <motion.div
                                                                            whileHover={{ scale: 1.02 }}
                                                                            whileTap={{ scale: 0.98 }}
                                                                        >
                                                                            <Button
                                                                                onClick={() => {
                                                                                    setIsDialogOpenWinner(true);
                                                                                    setSelectedSubmission(submission);
                                                                                }}
                                                                                disabled={
                                                                                    loadingBountyId === data.id ||
                                                                                    data.totalWinner ===
                                                                                    data.currentWinnerCount ||
                                                                                    data.BountyWinner.some(
                                                                                        (winner) =>
                                                                                            winner.user.id ===
                                                                                            submission.user.id,
                                                                                    ) ||
                                                                                    GetSendBalanceToWinnerXdr.isLoading
                                                                                }
                                                                                className=""
                                                                            >
                                                                                <Crown className="mr-2 h-4 w-4" /> Mark
                                                                                as Winner
                                                                            </Button>
                                                                        </motion.div>
                                                                        <motion.div
                                                                            whileHover={{ scale: 1.02 }}
                                                                            whileTap={{ scale: 0.98 }}
                                                                        >
                                                                            <Button
                                                                                variant="outline"
                                                                                className="border-slate-200 dark:border-slate-700"
                                                                                onClick={() => {
                                                                                    updateSubmissionStatus(
                                                                                        data.creatorId,
                                                                                        submission.id,
                                                                                        "CHECKED",
                                                                                    );
                                                                                    setAttachmentData(submission.medias);
                                                                                    setIsAttachmentModalOpen(true);
                                                                                }}
                                                                            >
                                                                                <Paperclip className="mr-2 h-4 w-4" />{" "}
                                                                                View Attachments
                                                                            </Button>
                                                                        </motion.div>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        ))
                                                    )}
                                                </div>
                                            </AnimatePresence>
                                        )}
                                    </div>

                                    {selectedSubmission && (
                                        <Dialog
                                            open={isDialogOpenWinner}
                                            onOpenChange={setIsDialogOpenWinner}
                                        >
                                            <DialogContent className="sm:max-w-md">
                                                <DialogHeader>
                                                    <DialogTitle className="text-xl">
                                                        Confirm Winner
                                                    </DialogTitle>
                                                </DialogHeader>
                                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                                                    <div className="mb-4 flex items-center gap-3">
                                                        <CustomAvatar
                                                            className="h-12 w-12"
                                                            winnerCount={selectedSubmission.userWinCount}
                                                            url={selectedSubmission.user.image}
                                                        />
                                                        <div>
                                                            <p className="font-medium">
                                                                {selectedSubmission.user.name}
                                                            </p>
                                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                                {addrShort(selectedSubmission.userId, 6)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <p className="text-slate-700 dark:text-slate-300">
                                                        Do you want to make this user a winner? This action
                                                        cannot be undone.
                                                    </p>
                                                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                                                        <p className="text-sm text-amber-800 dark:text-amber-300">
                                                            The prize amount of{" "}
                                                            {(data.priceInBand / data.totalWinner).toFixed(3)}{" "}
                                                            {PLATFORM_ASSET.code} or{" "}
                                                            {data.priceInUSD / data.totalWinner} USDC user can
                                                            claim later.
                                                        </p>
                                                    </div>
                                                </div>
                                                <DialogFooter className="flex flex-col gap-3 sm:flex-row">
                                                    <Button
                                                        variant="outline"
                                                        className="flex-1 border-slate-200 dark:border-slate-700"
                                                        onClick={() => setIsDialogOpenWinner(false)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        disabled={
                                                            loadingBountyId === data.id ||
                                                            data.totalWinner <= data.currentWinnerCount ||
                                                            data.BountyWinner.some(
                                                                (winner) =>
                                                                    winner.user.id === selectedSubmission.userId,
                                                            ) ||
                                                            GetSendBalanceToWinnerXdr.isLoading
                                                        }
                                                        className="flex-1 bg-primary hover:bg-primary/90"
                                                        onClick={() =>
                                                            handleWinner(
                                                                data.id,
                                                                selectedSubmission.userId,
                                                                data.priceInBand,
                                                            )
                                                        }
                                                    >
                                                        {GetSendBalanceToWinnerXdr.isLoading ? (
                                                            <div className="flex items-center gap-2">
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                <span>Processing...</span>
                                                            </div>
                                                        ) : (
                                                            "Confirm Winner"
                                                        )}
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                </TabsContent>

                                <TabsContent value="doubt" className="mt-0 ">
                                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                        <Chat bountyId={data.id} />
                                    </div>
                                </TabsContent>

                                <TabsContent value="comments" className="mt-0">
                                    <div className="space-y-4">
                                        <AddBountyComment bountyId={Number(id)} />
                                        <div className="scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 max-h-[650px] overflow-y-auto pr-1">
                                            {bountyComment.data && bountyComment.data.length > 0 ? (
                                                <div className="space-y-4">
                                                    {bountyComment.data?.map((comment, idx) => (
                                                        <motion.div
                                                            key={comment.id}
                                                            initial={{ opacity: 0, y: 20 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.3, delay: idx * 0.1 }}
                                                        >
                                                            <ViewBountyComment
                                                                comment={comment}
                                                                bountyChildComments={
                                                                    comment.bountyChildComments
                                                                }
                                                            />
                                                            <Separator className="my-4" />
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex h-[300px] flex-col items-center justify-center p-6 text-center">
                                                    <MessageSquare
                                                        size={40}
                                                        className="mb-4 text-slate-300 dark:text-slate-600"
                                                    />
                                                    <h3 className="mb-1 text-lg font-medium text-slate-900 dark:text-white">
                                                        No comments yet
                                                    </h3>
                                                    <p className="max-w-md text-slate-500 dark:text-slate-400">
                                                        There are no comments on this bounty yet.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>

                        <CardFooter className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 dark:border-slate-700 sm:flex-row">
                            <div className="flex w-full flex-wrap gap-3 sm:w-auto">
                                <motion.div
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Button
                                        className="bg-primary hover:bg-primary/90"
                                        onClick={() => {
                                            setBountyId(data.id);
                                            setIsEditModalOpen(true);
                                        }}
                                    >
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit Bounty
                                    </Button>
                                </motion.div>
                                <motion.div
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button
                                                variant="destructive"
                                                disabled={
                                                    DeleteMutation.isLoading ||
                                                    loadingBountyId === data.id ||
                                                    data.currentWinnerCount > 0
                                                }
                                            >
                                                <Trash className="mr-2 h-4 w-4" />
                                                Delete Bounty
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                                <DialogTitle className="text-xl">
                                                    Delete Bounty
                                                </DialogTitle>
                                            </DialogHeader>
                                            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                                                <p className="text-slate-700 dark:text-slate-300">
                                                    Are you sure you want to delete this bounty? This
                                                    action cannot be undone.
                                                </p>
                                                {data.currentWinnerCount > 0 && (
                                                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                                                        <p className="text-sm text-amber-800 dark:text-amber-300">
                                                            This bounty already has winners and cannot be
                                                            deleted.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            <DialogFooter className="flex flex-col gap-3 sm:flex-row">
                                                <Button
                                                    variant="outline"
                                                    className="flex-1 border-slate-200 dark:border-slate-700"
                                                    onClick={() => setIsDialogOpen(false)}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    disabled={
                                                        loadingBountyId === data.id ||
                                                        data.currentWinnerCount > 0
                                                    }
                                                    variant="destructive"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        handleDelete(data.id, data.priceInBand)
                                                    }
                                                >
                                                    {DeleteMutation.isLoading ? (
                                                        <div className="flex items-center gap-2">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            <span>Processing...</span>
                                                        </div>
                                                    ) : (
                                                        "Delete Permanently"
                                                    )}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </motion.div>
                            </div>

                            <div className="flex w-full justify-center sm:w-auto">
                                <div className="flex flex-wrap justify-center gap-3">
                                    <motion.div
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <Badge
                                            variant="outline"
                                            className="gap-1 border-slate-200 px-3 py-2 dark:border-slate-700"
                                        >
                                            <Trophy className="h-4 w-4 text-amber-500" />
                                            <span>
                                                {data.currentWinnerCount}/{data.totalWinner} Winners
                                            </span>
                                        </Badge>
                                    </motion.div>
                                    <motion.div
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <Badge
                                            variant="outline"
                                            className="gap-1 border-slate-200 px-3 py-2 dark:border-slate-700"
                                        >
                                            <Users className="h-4 w-4 text-blue-500" />
                                            <span>{data?._count.participants} Participants</span>
                                        </Badge>
                                    </motion.div>
                                </div>
                            </div>
                        </CardFooter>
                    </Card>
                </motion.div>
                {
                    isEditModalOpen && (
                        <EditBountyModal
                            isOpen={isEditModalOpen}
                            onClose={() => setIsEditModalOpen(false)}
                            bountyId={bountyId}
                        />
                    )
                }
                {
                    isAttachmentModalOpen && (
                        <ViewBountyAttachmentModal
                            data={attachmentData}
                            isOpen={isAttachmentModalOpen}
                            onClose={() => setIsAttachmentModalOpen(false)}
                        />
                    )
                }
            </div>
        );
};

function ShowMore({ content }: { content: string }) {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);

    return (
        <div className="w-full">
            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                {isExpanded ? (
                    <SafeHTML html={content} />
                ) : (
                    <>
                        <SafeHTML html={content.substring(0, 300) + "..."} />
                        <div className="h-8 bg-gradient-to-t from-white to-transparent dark:from-slate-800"></div>
                    </>
                )}
            </div>

            <button
                className="hover:/80  mt-2 flex items-center text-sm font-medium"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {isExpanded ? "Show Less" : "Show More"}
            </button>
        </div>
    );
}

const SubmissionStatusSelect = ({
    defaultValue,
    submissionId,
    creatorId,
    updateSubmissionStatus,
}: {
    defaultValue: string;
    submissionId: number;
    creatorId: string;
    updateSubmissionStatus: (
        creatorId: string,
        submissionId: number,
        status: SubmissionViewType,
    ) => void;
}) => {
    const handleStatusChange = (value: SubmissionViewType) => {
        updateSubmissionStatus(creatorId, submissionId, value);
    };

    return (
        <Select onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[120px] shadow-sm shadow-slate-300">
                <SelectValue placeholder={defaultValue} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="CHECKED">CHECKED</SelectItem>
                <SelectItem value="ONREVIEW">REVIEW</SelectItem>
                <SelectItem value="APPROVED">APPROVED</SelectItem>
                <SelectItem value="REJECTED">REJECTED</SelectItem>
            </SelectContent>
        </Select>
    );
};

function sanitizeInput(input: string) {
    // Updated regex to match more general URL formats (handling more complex domains and paths)
    const regex = /https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(\/[^\s]*)?/g;

    // Find all matching URLs
    const urlMatches = input.match(regex) ?? [];

    // Remove all URLs from the input string
    const sanitizedInput = input.replace(regex, "").trim();

    console.log("Sanitized Input:", sanitizedInput);
    console.log("Matched URLs:", urlMatches);

    return {
        sanitizedInput,
        urls: urlMatches.length ? urlMatches : null,
    };
}

const shortURL = (url: string) => {
    if (url.length > 30) {
        return `${url.slice(0, 30)}...`;
    }
    return url;
};
