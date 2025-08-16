import { zodResolver } from "@hookform/resolvers/zod";
import { MediaType } from "@prisma/client";
import clsx from "clsx";
import { DollarSign, Package, PlusIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { clientsign } from "package/connect_wallet";
import { WalletType } from "package/connect_wallet/src/lib/enums";
import { ChangeEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTrigger,
} from "~/components/shadcn/ui/dialog";
import useNeedSign from "~/lib/hook";
import { useCreatorStorageAcc, useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { PLATFORM_ASSET, PLATFORM_FEE, TrxBaseFeeInPlatformAsset } from "~/lib/stellar/constant";
import { AccountSchema, clientSelect } from "~/lib/stellar/fan/utils";
import { api } from "~/utils/api";
import { BADWORDS } from "~/utils/banned-word";

import * as React from "react";

import { Button } from "../shadcn/ui/button";


import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "~/components/shadcn/ui/select";


import { Label } from "../shadcn/ui/label";
import { Input } from "../shadcn/ui/input";

import { Textarea } from "../shadcn/ui/textarea";
// Remove the pageAsset reference from the schema

export const SellPageAssetSchema = z.object({
    title: z
        .string()
        .refine(
            (value) => {
                return !BADWORDS.some((word) => value.toLowerCase().includes(word.toLowerCase()))
            },
            {
                message: "Title contains banned words.",
            },
        ).optional(),
    description: z.string().optional(),
    amountToSell: z
        .number({
            required_error: "Amount to sell must be entered as a number",
            invalid_type_error: "Amount to sell must be entered as a number",
        })
        .int({ message: "Amount must be a whole number" })
        .positive({ message: "Amount must be greater than 0" }),
    price: z
        .number({
            required_error: "Price must be entered as a number",
            invalid_type_error: "Price must be entered as a number",
        })
        .positive({ message: "Price must be greater than 0" }),
    priceUSD: z
        .number({
            required_error: "USD price must be entered as a number",
            invalid_type_error: "USD price must be entered as a number",
        })
        .positive({ message: "USD price must be greater than 0" })
        .default(1),
    priceXLM: z
        .number({
            required_error: "XLM price must be entered as a number",
            invalid_type_error: "XLM price must be entered as a number",
        })
        .nonnegative({ message: "XLM price cannot be negative" })
        .default(0),
})

type SellPageAssetFormData = z.infer<typeof SellPageAssetSchema>

type SellPageAssetProps = {
    isOpen: boolean,
    onClose: () => void,
}

export default function SellPageAssetModal({ isOpen, onClose }: SellPageAssetProps) {
    const session = useSession()
    const [submitLoading, setSubmitLoading] = useState(false)
    const [pageAsset, setPageAsset] = useState<string | null>(null)

    // Add this function inside the component after pageAsset state is declared
    const validateAmountToSell = (value: number) => {
        const availableBalance = pageAsset ? Number.parseInt(pageAsset) : 0
        if (value > availableBalance) {
            return "Amount exceeds available balance"
        }
        return true
    }

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isValid },
        setValue,
        watch,
    } = useForm<SellPageAssetFormData>({
        resolver: zodResolver(SellPageAssetSchema),
        mode: "onChange",
        defaultValues: {
            title: "",
            priceUSD: 1,
            priceXLM: 0,
        },
    })

    const pageAssetBalance = api.wallate.acc.getCreatorPageAssetBallances.useQuery(undefined, {
        onSuccess: (data) => {
            if (data) {
                setPageAsset(data.balance)
            }
        },
        onError: (error) => {
            console.log(error)
        },
        refetchOnWindowFocus: false,
    })

    const watchedAmountToSell = watch("amountToSell")
    const watchedPrice = watch("price")
    const watchedPriceUSD = watch("priceUSD")

    const createSellPageAsset = api.fan.asset.sellPageAsset.useMutation({
        onSuccess: () => {
            toast.success("Sell Page Asset Created Successfully", {
                position: "top-center",
                duration: 4000,
            })
            reset()
        },
        onError: (error) => {
            toast.error(`Failed to create asset: ${error.message}`)
        },
        onSettled: () => {
            setSubmitLoading(false)
        },
    })

    const calculateRemaining = () => {
        const availableBalance = pageAsset ? Number.parseInt(pageAsset) : 0
        const amountToSell = watchedAmountToSell ?? 0
        return Math.max(0, availableBalance - amountToSell)
    }

    const availableBalance = pageAsset ? Number.parseInt(pageAsset) : 0

    const onSubmit = (data: SellPageAssetFormData) => {
        if (!session.data?.user?.id) {
            toast.error("You must be logged in to create an asset")
            return
        }

        setSubmitLoading(true)

        // Use the pageAssetBalance code as title if it exists
        const assetCode = `${data.amountToSell} ${pageAssetBalance.data?.code}` || "Unknown Asset";

        // Create a modified data object with the title set to the asset code
        const modifiedData = {
            ...data,
            title: assetCode
        };

        createSellPageAsset.mutate(modifiedData);
    }

    const handlePriceChange = (value: number) => {
        setValue("price", value)
        const usdValue = value * 0.5
        setValue("priceUSD", Number(usdValue.toFixed(2)))
    }
    const handleClose = () => {
        onClose()
        reset()
    }
    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>


            <DialogContent>
                <DialogHeader>
                    <h2 className="text-lg font-semibold">Sell Page Asset</h2>
                    {pageAssetBalance.isLoading && (
                        <div className="rounded-lg bg-base-200 p-4 text-center">
                            <span className="loading loading-spinner mr-2"></span>
                            Loading your asset balance...
                        </div>
                    )}

                    {pageAssetBalance.isError && (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center text-red-600">
                            Failed to load asset balance. Please refresh and try again.
                        </div>
                    )}

                    {availableBalance === 0 && !pageAssetBalance.isLoading && (
                        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-center text-yellow-700">
                            You don{"'"}t have any page assets available to sell.
                        </div>
                    )}
                </DialogHeader>
                <div className="space-y-6">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                        {/* Asset Information Section */}
                        <div className="rounded-lg bg-base-200 p-4 space-y-4">

                            {/* <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-red-600">*</span>
            </Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="Enter asset title"
              className={errors.title ? "border-red-500" : ""}
            />
            {errors.title && <p className="text-red-500 text-sm">{errors.title.message}</p>}
          </div> */}

                            <div className="space-y-2">
                                <Label htmlFor="description">Description </Label>
                                <Textarea
                                    id="description"
                                    {...register("description")}
                                    placeholder="Enter asset description (optional)"
                                    rows={3}
                                />
                                {errors.description && <p className="text-red-500 text-sm">{errors.description.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="amountToSell">
                                    Amount to Sell {pageAssetBalance.data?.code} <span className="text-red-600">*</span>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="amountToSell"
                                        type="number"
                                        min="1"
                                        max={availableBalance}
                                        step="1"
                                        {...register("amountToSell", {
                                            valueAsNumber: true,
                                            validate: validateAmountToSell,
                                        })}
                                        placeholder="Enter quantity to sell"
                                        className={errors.amountToSell ? "border-red-500" : ""}
                                    />
                                    {pageAssetBalance.isLoading && (
                                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                            <span className="loading loading-spinner loading-xs"></span>
                                        </div>
                                    )}
                                </div>

                                {/* Balance Information */}
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                        Available: <span className="font-medium text-foreground">{availableBalance}</span>
                                    </span>
                                    {watchedAmountToSell > 0 && (
                                        <span className="text-muted-foreground">
                                            Remaining:{" "}
                                            <span className={`font-medium ${calculateRemaining() === 0 ? "text-orange-500" : "text-green-600"}`}>
                                                {calculateRemaining()}
                                            </span>
                                        </span>
                                    )}
                                </div>

                                {errors.amountToSell && <p className="text-red-500 text-sm">{errors.amountToSell.message}</p>}

                                {/* Quick select buttons */}
                                {availableBalance > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setValue("amountToSell", Math.floor(availableBalance * 0.25))}
                                            className="text-xs"
                                        >
                                            25%
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setValue("amountToSell", Math.floor(availableBalance * 0.5))}
                                            className="text-xs"
                                        >
                                            50%
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setValue("amountToSell", Math.floor(availableBalance * 0.75))}
                                            className="text-xs"
                                        >
                                            75%
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setValue("amountToSell", availableBalance)}
                                            className="text-xs"
                                        >
                                            Max
                                        </Button>
                                    </div>
                                )}

                                <p className="text-xs text-muted-foreground">How many units of this asset do you want to sell?</p>
                            </div>
                        </div>

                        {/* Pricing Section */}
                        <div className="rounded-lg bg-base-200 p-4 space-y-4">
                            <Label className="text-base font-bold">Pricing Information</Label>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="price">
                                        {PLATFORM_ASSET.code} Price <span className="text-red-600">*</span>
                                    </Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        step="0.01"
                                        {...register("price", {
                                            valueAsNumber: true,
                                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => handlePriceChange(Number(e.target.value)),
                                        })}
                                        placeholder="0.00"
                                        className={errors.price ? "border-red-500" : ""}
                                    />
                                    {errors.price && <p className="text-red-500 text-sm">{errors.price.message}</p>}
                                </div>

                                {/* <div className="space-y-2">
              <Label htmlFor="priceUSD">
                Price in USD <span className="text-red-600">*</span>
              </Label>
              <Input
                id="priceUSD"
                type="number"
                step="0.01"
                {...register("priceUSD", { valueAsNumber: true })}
                placeholder="1.00"
                className={errors.priceUSD ? "border-red-500" : ""}
              />
              {errors.priceUSD && <p className="text-red-500 text-sm">{errors.priceUSD.message}</p>}
            </div> */}

                                <div className="space-y-2">
                                    <Label htmlFor="priceXLM">Price in XLM</Label>
                                    <Input
                                        id="priceXLM"
                                        type="number"
                                        step="0.0000001"
                                        {...register("priceXLM", { valueAsNumber: true })}
                                        placeholder="0.00"
                                        className={errors.priceXLM ? "border-red-500" : ""}
                                    />
                                    {errors.priceXLM && <p className="text-red-500 text-sm">{errors.priceXLM.message}</p>}
                                </div>
                            </div>

                            <div className="text-sm text-muted-foreground">
                                <p>• Platform Price: Main pricing in your platform currency</p>
                                {/* <p>• USD Price: Equivalent price in US Dollars</p> */}
                                <p>• XLM Price: Optional price in Stellar Lumens (0 = not available in XLM)</p>
                            </div>
                        </div>
                        {watchedPrice > 0 && (
                            <div className="rounded-lg bg-base-100 p-4 border">
                                <Label className="text-base font-bold mb-2 block">Preview</Label>
                                <div className="space-y-2 text-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p>
                                                <strong>Available Balance:</strong> {availableBalance} units
                                            </p>
                                            <p>
                                                <strong>Amount to Sell:</strong> {watchedAmountToSell ?? 0} units
                                            </p>
                                            <p className={`${calculateRemaining() === 0 ? "text-orange-500" : "text-green-600"}`}>
                                                <strong>Remaining After Sale:</strong> {calculateRemaining()} units
                                            </p>
                                        </div>
                                        <div>
                                            <p>
                                                <strong>Price per Unit:</strong> {watchedPrice ?? 0}
                                            </p>
                                            {/* <p>
                  <strong>USD Price per Unit:</strong> ${watchedPriceUSD || 0}
                </p> */}
                                            <p>
                                                <strong>XLM Price per Unit:</strong> {watch("priceXLM") ?? 0} XLM
                                            </p>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        )}
                        {/* Submit Section */}
                        <div className="flex gap-2 pt-4">

                            <Button type="submit" disabled={!isValid || submitLoading} className="flex-1">
                                {submitLoading && <span className="loading loading-spinner mr-2"></span>}
                                Create Sell Page Asset
                            </Button>
                        </div>
                    </form>

                    {/* Preview Section */}

                </div>
            </DialogContent>
        </Dialog>
    )
}