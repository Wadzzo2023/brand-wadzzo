"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "~/utils/api";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "~/components/shadcn/ui/select";
import {
    ArrowRight,
    Gift,
    RefreshCcw,
    Sparkles,
    Users,
    Wallet,
} from "lucide-react";
import { clientsign } from "package/connect_wallet";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/shadcn/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/shadcn/ui/dialog";

import { fetchPubkeyfromEmail } from "~/utils/get-pubkey";
import { addrShort } from "~/utils/utils";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import {
    PLATFORM_ASSET,
    TrxBaseFee,
    TrxBaseFeeInPlatformAsset,
} from "~/lib/stellar/constant";
import useNeedSign from "~/lib/hook";
import { useSession } from "next-auth/react";
import { clientSelect } from "~/lib/stellar/fan/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "~/components/shadcn/ui/input";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/shadcn/ui/card";
import { Badge } from "~/components/shadcn/ui/badge";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "~/components/shadcn/ui/tabs";
import { Skeleton } from "~/components/shadcn/ui/skeleton";
import CustomAvatar from "~/components/common/custom-avatar";

enum assetType {
    PAGEASSET = "PAGEASSET",
    PLATFORMASSET = "PLATFORMASSET",
    SHOPASSET = "SHOPASSET",
}

export const FanGitFormSchema = z.object({
    pubkey: z.string().length(56),
    amount: z
        .number({
            required_error: "Amount is required",
            invalid_type_error: "Amount must be a number",
            message: "Amount must be a number",
        })
        .int()
        .positive(),
});

type selectedAssetType = {
    assetCode: string;
    assetIssuer: string;
    balance: number;
    assetType: assetType;
};

export default function GiftPage() {
    const session = useSession();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<selectedAssetType | null>(
        null,
    );
    const [remainingToken, setRemainingToken] = useState<number>(0);
    const [tokenBalance, setTokenBalance] = useState<number>(0);
    const [activeTab, setActiveTab] = useState<string>("gift");
    const { needSign } = useNeedSign();
    const {
        register,
        handleSubmit,
        reset,
        control,
        setValue,
        getValues,
        watch,
        formState: { errors, isValid },
    } = useForm<z.infer<typeof FanGitFormSchema>>({
        resolver: zodResolver(FanGitFormSchema),
        defaultValues: {
            amount: 1,
        },
    });

    const pageAssetbal = api.fan.creator.getCreatorPageAssetBalance.useQuery();
    const shopAssetbal = api.fan.creator.getCreatorShopAssetBalance.useQuery();
    const { data: extraCost } =
        api.bounty.Bounty.getplatformAssetNumberForXLM.useQuery({
            xlm: 1,
        });
    let cost = 0;

    const { platformAssetBalance } = useUserStellarAcc();
    const xdr = api.fan.trx.giftFollowerXDR.useMutation({
        onSuccess: async (xdr) => {
            if (xdr) {
                try {
                    const clientResponse = await clientsign({
                        presignedxdr: xdr,
                        walletType: session.data?.user?.walletType,
                        pubkey: session.data?.user.id,
                        test: clientSelect(),
                    });

                    if (clientResponse) {
                        toast.success("Gift sent successfully!", {
                            icon: "🎁",
                            style: {
                                borderRadius: "10px",
                                background: "#333",
                                color: "#fff",
                            },
                        });
                    } else {
                        toast.error("Transaction failed");
                        setIsDialogOpen(false);
                    }
                } catch (signError) {
                    if (signError instanceof Error) {
                        toast.error(`Error: ${signError.message}`);
                    } else {
                        toast.error("Something went wrong.");
                    }
                } finally {
                    setIsDialogOpen(false);
                }
            }
        },
        onError: (e) => {
            setIsDialogOpen(false);
            toast.error(e.message);
        },
    });

    const onSubmit: SubmitHandler<z.infer<typeof FanGitFormSchema>> = (data) => {
        if (!selectedAsset) {
            return;
        }

        xdr.mutate({
            amount: data.amount,
            assetCode: selectedAsset.assetCode,
            assetIssuer: selectedAsset.assetIssuer,
            assetType: selectedAsset.assetType,
            pubkey: data.pubkey,
            signWith: needSign(),
        });
    };

    if (extraCost) {
        cost = Number(TrxBaseFee) + Number(TrxBaseFeeInPlatformAsset) + extraCost;
    }

    const pubkey = watch("pubkey");
    const maxTokens = watch("amount");

    async function fetchPubKey(): Promise<void> {
        try {
            const pub = await toast.promise(fetchPubkeyfromEmail(pubkey), {
                error: "Email doesn't have a pubkey",
                success: "Pubkey fetched successfully",
                loading: "Fetching pubkey...",
            });

            setValue("pubkey", pub, { shouldValidate: true });
        } catch (e) {
            console.error(e);
        }
    }

    const handleFanAvatarClick = (pubkey: string) => {
        setValue("pubkey", pubkey, { shouldValidate: true });
        setActiveTab("gift");
    };

    useEffect(() => {
        if (selectedAsset?.balance) {
            setRemainingToken(selectedAsset.balance - Number(maxTokens));
        }
    }, [maxTokens, selectedAsset]);

    if (pageAssetbal.isLoading)
        return (

            <GiftPageSkeleton />

        );

    if (pageAssetbal.data) {
        return (

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="flex h-full flex-col items-center px-4 py-8"
            >
                <div className="w-full max-w-3xl">
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.5 }}
                    >
                        <h1 className="mb-2 text-center text-3xl font-bold">
                            Gift Your Fans
                        </h1>
                        <p className="mb-6 text-center text-muted-foreground">
                            Show appreciation to your supporters with token gifts
                        </p>
                    </motion.div>

                    <Tabs
                        defaultValue="gift"
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="w-full"
                    >
                        <TabsList className="mb-6 grid grid-cols-2">
                            <TabsTrigger value="gift" className="flex items-center gap-2">
                                <Gift className="h-4 w-4" />
                                <span>Send Gift</span>
                            </TabsTrigger>
                            <TabsTrigger value="fans" className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span>Your Fans</span>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="gift">
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ duration: 0.4 }}
                            >
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Gift className="h-5 w-5 text-purple-500" />
                                            Send Gift
                                        </CardTitle>
                                        <CardDescription>
                                            Send tokens to your fans as a token of appreciation
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <form
                                            onSubmit={handleSubmit(onSubmit)}
                                            className="space-y-4"
                                        >
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">
                                                    Recipient
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <div className="relative flex-1">
                                                        <Input
                                                            type="text"
                                                            {...register("pubkey")}
                                                            placeholder="Email or Pubkey"
                                                            className="pr-10"
                                                        />
                                                        {z.string().email().safeParse(pubkey).success && (
                                                            <motion.button
                                                                whileHover={{ scale: 1.1 }}
                                                                whileTap={{ scale: 0.95 }}
                                                                type="button"
                                                                onClick={fetchPubKey}
                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                                            >
                                                                <RefreshCcw className="h-4 w-4" />
                                                            </motion.button>
                                                        )}
                                                    </div>
                                                </div>

                                                {pubkey && pubkey.length === 56 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        className="overflow-hidden text-xs text-muted-foreground"
                                                    >
                                                        <p>Pubkey: {addrShort(pubkey)}</p>
                                                    </motion.div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">
                                                    Select Asset
                                                </label>
                                                <Select
                                                    onValueChange={(value) => {
                                                        const parts = value.split(" ");
                                                        if (parts.length === 4) {
                                                            setSelectedAsset({
                                                                assetCode: parts[0] ?? "",
                                                                assetIssuer: parts[1] ?? "",
                                                                balance: Number.parseFloat(parts[2] ?? "0"),
                                                                assetType:
                                                                    (parts[3] as assetType) ??
                                                                    "defaultAssetType",
                                                            });
                                                        } else {
                                                            setSelectedAsset(null);
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="focus-visible:ring-0 focus-visible:ring-offset-0">
                                                        <SelectValue placeholder="Select Asset" />
                                                    </SelectTrigger>
                                                    <SelectContent className="w-full">
                                                        <SelectGroup>
                                                            <SelectLabel className="text-center font-semibold text-purple-500">
                                                                PAGE ASSET
                                                            </SelectLabel>
                                                            <SelectItem
                                                                value={
                                                                    pageAssetbal.data.assetCode +
                                                                    " " +
                                                                    pageAssetbal.data.assetCode +
                                                                    " " +
                                                                    pageAssetbal.data.balance +
                                                                    " " +
                                                                    "PAGEASSET"
                                                                }
                                                            >
                                                                <div className="flex w-full items-center justify-between">
                                                                    <span>{pageAssetbal.data.assetCode}</span>
                                                                    <Badge variant="outline" className="ml-2">
                                                                        {pageAssetbal.data.balance}
                                                                    </Badge>
                                                                </div>
                                                            </SelectItem>

                                                            <SelectLabel className="mt-2 text-center font-semibold text-purple-500">
                                                                PLATFORM ASSET
                                                            </SelectLabel>
                                                            <SelectItem
                                                                value={
                                                                    PLATFORM_ASSET.code +
                                                                    " " +
                                                                    PLATFORM_ASSET.issuer +
                                                                    " " +
                                                                    platformAssetBalance +
                                                                    " " +
                                                                    "PLATFORMASSET"
                                                                }
                                                            >
                                                                <div className="flex w-full items-center justify-between">
                                                                    <span>{PLATFORM_ASSET.code}</span>
                                                                    <Badge variant="outline" className="ml-2">
                                                                        {platformAssetBalance}
                                                                    </Badge>
                                                                </div>
                                                            </SelectItem>

                                                            <SelectLabel className="mt-2 text-center font-semibold text-purple-500">
                                                                SHOP ASSET
                                                            </SelectLabel>
                                                            {!shopAssetbal.data ||
                                                                shopAssetbal.data.length < 2 ? (
                                                                <div className="flex w-full items-center justify-between p-2 text-sm text-muted-foreground">
                                                                    <span>No Shop Asset Available!</span>
                                                                </div>
                                                            ) : (
                                                                shopAssetbal.data.map((asset) =>
                                                                    asset.asset_type === "credit_alphanum4" ||
                                                                        (asset.asset_type === "credit_alphanum12" &&
                                                                            asset.asset_code !==
                                                                            pageAssetbal.data.assetCode &&
                                                                            asset.asset_issuer !==
                                                                            pageAssetbal.data.assetIssuer) ? (
                                                                        <SelectItem
                                                                            key={asset.asset_code}
                                                                            value={
                                                                                asset.asset_code +
                                                                                " " +
                                                                                asset.asset_issuer +
                                                                                " " +
                                                                                asset.balance +
                                                                                " " +
                                                                                "SHOPASSET"
                                                                            }
                                                                        >
                                                                            <div className="flex w-full items-center justify-between">
                                                                                <span>{asset.asset_code}</span>
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className="ml-2"
                                                                                >
                                                                                    {asset.balance}
                                                                                </Badge>
                                                                            </div>
                                                                        </SelectItem>
                                                                    ) : null,
                                                                )
                                                            )}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <AnimatePresence>
                                                {selectedAsset && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="space-y-2 overflow-hidden"
                                                    >
                                                        <label className="text-sm font-medium">
                                                            Amount of {selectedAsset.assetCode} to gift
                                                        </label>
                                                        <div className="relative">
                                                            <Input
                                                                type="number"
                                                                placeholder={`Amount in ${selectedAsset.assetCode}`}
                                                                {...register("amount", {
                                                                    valueAsNumber: true,
                                                                    min: 1,
                                                                })}
                                                                className="pr-16"
                                                            />
                                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                                                <span className="text-sm text-muted-foreground">
                                                                    {selectedAsset.assetCode}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-muted-foreground">
                                                                Available:
                                                            </span>
                                                            <span className="font-medium">
                                                                {selectedAsset.balance}{" "}
                                                                {selectedAsset.assetCode}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-muted-foreground">
                                                                Remaining after gift:
                                                            </span>
                                                            <span
                                                                className={`font-medium ${remainingToken < 0 ? "text-red-500" : ""}`}
                                                            >
                                                                {remainingToken > 0 ? remainingToken : 0}{" "}
                                                                {selectedAsset.assetCode}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-muted-foreground">
                                                                Transaction fee:
                                                            </span>
                                                            <span className="font-medium">
                                                                {cost} {PLATFORM_ASSET.code}
                                                            </span>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <Dialog
                                                open={isDialogOpen}
                                                onOpenChange={setIsDialogOpen}
                                            >
                                                <DialogTrigger asChild>
                                                    <motion.div
                                                        whileHover={{ scale: 1.02 }}
                                                        whileTap={{ scale: 0.98 }}
                                                    >
                                                        <Button
                                                            className="mt-4 w-full gap-2 shadow-sm shadow-foreground"
                                                            disabled={
                                                                xdr.isLoading || !isValid || !selectedAsset
                                                            }
                                                            type="button"
                                                            size="lg"
                                                        >
                                                            <Gift className="h-4 w-4" />
                                                            Send Gift
                                                            <ArrowRight className="ml-1 h-4 w-4" />
                                                        </Button>
                                                    </motion.div>
                                                </DialogTrigger>
                                                <DialogContent className="sm:max-w-[425px]">
                                                    <DialogHeader>
                                                        <DialogTitle className="flex items-center gap-2">
                                                            <Sparkles className="h-5 w-5 text-purple-500" />
                                                            Confirm Your Gift
                                                        </DialogTitle>
                                                    </DialogHeader>
                                                    <div className="mt-6 space-y-4">
                                                        <div className="rounded-lg border bg-muted/30 p-4">
                                                            <div className="space-y-3">
                                                                <div className="flex justify-between">
                                                                    <span className="text-muted-foreground">
                                                                        Recipient:
                                                                    </span>
                                                                    <span className="font-medium">
                                                                        {addrShort(getValues("pubkey"))}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-muted-foreground">
                                                                        Amount:
                                                                    </span>
                                                                    <span className="font-medium">
                                                                        {getValues("amount")}{" "}
                                                                        {selectedAsset?.assetCode}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-muted-foreground">
                                                                        Fee:
                                                                    </span>
                                                                    <span className="font-medium">
                                                                        {cost} {PLATFORM_ASSET.code}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="text-center text-sm text-muted-foreground">
                                                            This action cannot be undone. The gift will be
                                                            sent immediately.
                                                        </div>
                                                    </div>
                                                    <DialogFooter className="w-full">
                                                        <div className="flex w-full gap-4">
                                                            <DialogClose asChild>
                                                                <Button
                                                                    disabled={xdr.isLoading}
                                                                    variant="outline"
                                                                    onClick={() => setIsDialogOpen(false)}
                                                                    className="w-full shadow-sm shadow-foreground"
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </DialogClose>
                                                            <Button
                                                                disabled={xdr.isLoading || !isValid}
                                                                onClick={handleSubmit(onSubmit)}
                                                                className="w-full shadow-sm shadow-foreground"
                                                                type="submit"
                                                            >
                                                                {xdr.isLoading ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="animate-spin">
                                                                            <RefreshCcw className="h-4 w-4" />
                                                                        </span>
                                                                        <span>Processing...</span>
                                                                    </div>
                                                                ) : (
                                                                    <span>Confirm Gift</span>
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </form>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </TabsContent>

                        <TabsContent value="fans">
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ duration: 0.4 }}
                            >
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Users className="h-5 w-5 text-purple-500" />
                                            Your Fans
                                        </CardTitle>
                                        <CardDescription>
                                            Select a fan to send them a gift
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="-mr-2 max-h-[400px] overflow-y-auto pr-2">
                                            <FansList handleFanAvatarClick={handleFanAvatarClick} />
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </TabsContent>
                    </Tabs>
                </div>
            </motion.div>

        );
    } else if (pageAssetbal.data === undefined) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full items-center justify-center p-8"
            >
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-center gap-2">
                            <Wallet className="h-5 w-5 text-purple-500" />
                            No Assets Available
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="mb-4 text-muted-foreground">
                            You don{"'t"} have any page assets to gift to your fans.
                        </p>
                        <Button variant="outline">Create Page Asset</Button>
                    </CardContent>
                </Card>
            </motion.div>
        );
    }
}

function FansList({
    handleFanAvatarClick,
}: {
    handleFanAvatarClick: (pubkey: string) => void;
}) {
    const fans = api.fan.creator.getFansList.useQuery();

    if (fans.isLoading) return <FansListSkeleton />;

    if (fans.data && fans.data.length > 0) {
        return (
            <div className="space-y-1">
                {fans.data.map((fan, index) => (
                    <motion.div
                        key={fan.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                    >
                        <FanAvater
                            handleFanAvatarClick={handleFanAvatarClick}
                            name={fan.user.name}
                            pubkey={fan.user.id}
                            url={fan.user.image}
                        />
                    </motion.div>
                ))}
            </div>
        );
    }

    return (
        <div className="py-8 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p>You don{"'t"} have any fans yet</p>
        </div>
    );
}

export function FanAvater({
    name,
    pubkey,
    handleFanAvatarClick,
    url,
}: {
    name: string | null;
    pubkey: string;
    handleFanAvatarClick: (pubkey: string) => void;
    url: string | null;
}) {
    return (
        <motion.div
            whileHover={{
                scale: 1.01,
                backgroundColor: "rgba(var(--card-foreground-rgb), 0.05)",
            }}
            className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors"
            onClick={() => handleFanAvatarClick(pubkey)}
        >
            <div className="relative">
                <CustomAvatar url={url} />
                <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-green-500"></div>
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{name ?? "Anonymous Fan"}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {addrShort(pubkey, 7)}
                </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </motion.div>
    );
}

function GiftPageSkeleton() {
    return (
        <div className="flex h-full flex-col items-center px-4 py-8">
            <div className="w-full max-w-3xl">
                {/* Header skeleton */}
                <div className="mb-6 flex flex-col items-center">
                    <Skeleton className="mb-2 h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                </div>

                {/* Tabs skeleton */}
                <div className="mb-6">
                    <Skeleton className="h-10 w-full rounded-lg" />
                </div>

                {/* Card skeleton */}
                <div className="w-full space-y-6 rounded-lg border bg-card p-6">
                    {/* Card header */}
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-40" />
                        <Skeleton className="h-4 w-64" />
                    </div>

                    {/* Form fields */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-10 w-full" />
                        </div>

                        <div className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-10 w-full" />
                        </div>

                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-10 w-full" />
                        </div>

                        {/* Asset details */}
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                        </div>

                        {/* Button */}
                        <Skeleton className="mt-4 h-11 w-full" />
                    </div>
                </div>

                {/* Fans list skeleton (hidden initially) */}
                <div className="mt-6 hidden w-full space-y-4 rounded-lg border bg-card p-6">
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-48" />
                    </div>

                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                                <Skeleton className="h-4 w-4" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FansListSkeleton() {
    return (
        <div className="space-y-3 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-4" />
                </div>
            ))}
        </div>
    );
}
