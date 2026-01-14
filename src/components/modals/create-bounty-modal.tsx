"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MediaType } from "@prisma/client";
import {
  Camera,
  Coins,
  DollarSign,
  Trophy,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Check,
  Loader2,
  Sparkles,
  Loader,
  Wand2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { clientsign } from "package/connect_wallet";
import { useState, useEffect } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  type SubmitHandler,
} from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "~/components/shadcn/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/shadcn/ui/dialog";
import { Input } from "~/components/shadcn/ui/input";
import { Card, CardContent } from "~/components/shadcn/ui/card";
import { Badge } from "~/components/shadcn/ui/badge";
import { Separator } from "~/components/shadcn/ui/separator";
import { Label } from "~/components/shadcn/ui/label";
import { Progress } from "~/components/shadcn/ui/progress";

import useNeedSign from "~/lib/hook";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import {
  PLATFORM_ASSET,
  PLATFORM_FEE,
  SIMPLIFIED_FEE_IN_XLM,
  TrxBaseFeeInPlatformAsset,
} from "~/lib/stellar/constant";
import { clientSelect } from "~/lib/stellar/fan/utils";
import { api } from "~/utils/api";

import { UploadS3Button } from "../common/upload-button";
import { Editor } from "../common/quill-editor";
import { cn } from "~/lib/utils";
import { PaymentChoose, usePaymentMethodStore } from "../common/payment-options";
import ReactQuill from "react-quill";

// Schema definitions
const MediaInfo = z.object({
  url: z.string(),
  type: z.string().default(MediaType.IMAGE),
});

type MediaInfoType = z.TypeOf<typeof MediaInfo>;

const BountySchema = z.object({
  title: z
    .string()
    .max(65, {
      message: "Title can't be more than 65 characters",
    })
    .min(1, { message: "Title can't be empty" }),
  totalWinner: z
    .number({
      required_error: "Total Winner must be a number",
      invalid_type_error: "Total Winner must be a number",
    })
    .min(1, { message: "Please select at least 1 winner" }),
  prizeInUSD: z
    .number({
      required_error: "Prize must be a number",
      invalid_type_error: "Prize must be a number",
    })
    .min(0.00001, { message: "Prize can't be less than 0.00001" }),
  prize: z
    .number({
      required_error: "Prize must be a number",
      invalid_type_error: "Prize must be a number",
    })
    .min(0.00001, { message: "Prize can't be less than 0.00001" }),
  requiredBalance: z
    .number({
      required_error: "Required Balance must be a number",
      invalid_type_error: "Required Balance must be a number",
    })
    .nonnegative({ message: "Required Balance can't be less than 0" })
    .optional(),
  content: z.string().min(2, { message: "Description can't be empty" }),
  medias: z.array(MediaInfo).optional(),
});

// Define the steps
type FormStep = "details" | "media" | "review";
const FORM_STEPS: FormStep[] = ["details", "media", "review"];


type CreateBountyProps = {
  isDialogOpen: boolean;
  onClose: () => void;
};

const CreateBountyModal = ({ isDialogOpen, onClose }: CreateBountyProps) => {
  // State management
  const [media, setMedia] = useState<MediaInfoType[]>([]);
  const [wantMediaType, setWantMedia] = useState<MediaType>();
  const [loading, setLoading] = useState(false);
  const [prizeInAsset, setPrizeInAsset] = useState<number>(0);
  const [activeStep, setActiveStep] = useState<FormStep>("details");
  const [formProgress, setFormProgress] = useState(33);
  const [showConfetti, setShowConfetti] = useState(false);
  // Hooks
  const { needSign } = useNeedSign();
  const session = useSession();
  const { platformAssetBalance } = useUserStellarAcc();
  console.log("Platform Asset Balance:", platformAssetBalance);
  const { isOpen, setIsOpen, paymentMethod } = usePaymentMethodStore();

  const utils = api.useUtils();

  // Calculate fees
  const totalFees =
    2 * Number(TrxBaseFeeInPlatformAsset) + Number(PLATFORM_FEE);
  const xlmFee = 2 * SIMPLIFIED_FEE_IN_XLM; // for two time, fee (now and on winner)

  // Form setup
  const methods = useForm<z.infer<typeof BountySchema>>({
    resolver: zodResolver(BountySchema),
    mode: "onChange",
    defaultValues: {
      content: "",
      title: "",
      totalWinner: 1,
      prizeInUSD: 0,
      prize: 0,
      requiredBalance: 0,
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    trigger,
    watch,
    formState: { errors, isValid },
  } = methods;

  // Update progress based on active step
  useEffect(() => {
    const stepIndex = FORM_STEPS.indexOf(activeStep);
    setFormProgress((stepIndex + 1) * (100 / FORM_STEPS.length));
  }, [activeStep]);

  // Navigation functions
  const goToNextStep = () => {
    const currentIndex = FORM_STEPS.indexOf(activeStep);
    if (currentIndex < FORM_STEPS.length - 1) {
      const nextStep = FORM_STEPS[currentIndex + 1];
      if (nextStep) {
        setActiveStep(nextStep);
      }
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = FORM_STEPS.indexOf(activeStep);
    if (currentIndex > 0) {
      const previousStep = FORM_STEPS[currentIndex - 1];
      if (previousStep) {
        setActiveStep(previousStep);
      }
    }
  };

  // Check if current step is valid before allowing to proceed
  const canProceed = async () => {
    // Define fields to validate for each step
    const fieldsToValidate: Record<
      FormStep,
      (keyof z.infer<typeof BountySchema>)[]
    > = {
      details: ["title", "content", "prizeInUSD", "prize", "totalWinner"],
      media: [],
      review: [],
    };

    // Trigger validation for the current step's fields
    return await trigger(fieldsToValidate[activeStep]);
  };

  const handleNext = async () => {
    const isValid = await canProceed();
    if (isValid) {
      goToNextStep();
    }
  };

  // API mutations
  const CreateBountyMutation = api.bounty.Bounty.createBounty.useMutation({
    onSuccess: async (data) => {
      toast.success("Bounty Created Successfully! 🎉");
      setShowConfetti(true);
      utils.bounty.Bounty.getAllBounties.refetch().catch((error) => {
        console.error("Error refetching bounties", error);
      });
      setTimeout(() => {
        handleClose();
      }, 2000);
    },
  });

  const SendBalanceToBountyMother =
    api.bounty.Bounty.sendBountyBalanceToMotherAcc.useMutation({
      onSuccess: async (data, { method }) => {
        if (data) {
          try {
            setLoading(true);
            const clientResponse = await clientsign({
              presignedxdr: data.xdr,
              walletType: session.data?.user?.walletType,
              pubkey: data.pubKey,
              test: clientSelect(),
            });

            if (clientResponse) {
              CreateBountyMutation.mutate({
                title: getValues("title"),
                prizeInUSD: getValues("prizeInUSD"),
                totalWinner: getValues("totalWinner"),
                prize: getValues("prize"),
                requiredBalance: getValues("requiredBalance") ?? 0,
                priceInXLM:
                  method == "xlm" ? getValues("prizeInUSD") * 0.7 : undefined,
                content: getValues("content"),
                medias: media.map((item) => ({
                  ...item,
                  type: item.type as MediaType,
                })),
              });
              setLoading(false);
              reset();
              setMedia([]);
            } else {
              setLoading(false);
              reset();
              toast.error("Error in signing transaction");
              setMedia([]);
            }
            setIsOpen(false);
          } catch (error) {
            setLoading(false);
            console.error("Error sending balance to bounty mother", error);
            reset();
            setMedia([]);
          }
        }
      },
      onError: (error) => {
        console.error("Error creating bounty", error);
        toast.error(error.message);
        reset();
        setMedia([]);
        setLoading(false);
        setIsOpen(false);
      },
    });


  // Handlers
  const onSubmit: SubmitHandler<z.infer<typeof BountySchema>> = (data) => {
    data.medias = media;
    setLoading(true);
    SendBalanceToBountyMother.mutate({
      signWith: needSign(),
      prize: data.prize,
      xlmPrice: data.prizeInUSD * 0.7,
      method: paymentMethod,
    });
  };

  const addMediaItem = (url: string, type: MediaType) => {
    setMedia((prevMedia) => [...prevMedia, { url, type }]);
  };

  const removeMediaItem = (index: number) => {
    setMedia((prevMedia) => prevMedia.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    onClose();
    reset();
    setMedia([]);
    setActiveStep("details");
  };

  // Watch values for preview
  const watchedTitle = watch("title");
  const watchedPrizeUSD = watch("prizeInUSD");
  const watchedPrizeAsset = watch("prize");
  const watchedWinners = watch("totalWinner");
  const watchedRequiredBalance = watch("requiredBalance");

  //

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleClose}>
      <DialogContent
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-xl p-2"
      >
        {showConfetti && (
          <div className="pointer-events-none fixed inset-0 z-50">
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, opacity: [0, 1, 0] }}
                transition={{ duration: 2 }}
                className="text-4xl"
              >
                <div className="flex items-center justify-center gap-2 ">
                  <Sparkles className="h-8 w-8" />
                  <span className="font-bold">
                    Bounty created successfully!
                  </span>
                  <Sparkles className="h-8 w-8" />
                </div>
              </motion.div>
            </div>
            {Array.from({ length: 100 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-2 w-2 rounded-full"
                initial={{
                  top: "50%",
                  left: "50%",
                  scale: 0,
                  backgroundColor: [
                    "#FF5733",
                    "#33FF57",
                    "#3357FF",
                    "#F3FF33",
                    "#FF33F3",
                  ][Math.floor(Math.random() * 5)],
                }}
                animate={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  delay: Math.random() * 0.5,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="flex h-full flex-col"
        >
          <DialogHeader className="px-2 py-4 md:px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5" />
                <DialogTitle className="text-xl font-bold">
                  Create New Bounty
                </DialogTitle>
              </div>
            </div>
            <DialogDescription>
              Create a bounty for users to complete and earn rewards
            </DialogDescription>

            <Progress value={formProgress} className="mt-2 h-2" />

            <div className="w-full px-2 md:px-4">
              <div className="flex items-center justify-between">
                {FORM_STEPS.map((step, index) => (
                  <div key={step} className="flex flex-col items-center">
                    <div
                      className={cn(
                        "mb-1 flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium",
                        activeStep === step
                          ? "bg-primary  shadow-sm shadow-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={cn(
                        "text-xs",
                        activeStep === step
                          ? "font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {step === "details"
                        ? "Details"
                        : step === "media"
                          ? "Media"
                          : "Review"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DialogHeader>

          <FormProvider {...methods}>
            <form>
              <div className="p-2 md:p-4">
                <AnimatePresence mode="wait">
                  {activeStep === "details" && <DetailsStep key="details" />}
                  {activeStep === "media" && (
                    <MediaStep
                      key="media"
                      media={media}
                      removeMediaItem={removeMediaItem}
                      addMediaItem={addMediaItem}
                      loading={loading}
                    />
                  )}
                  {activeStep === "review" && (
                    <ReviewStep
                      key="review"
                      media={media}
                      title={watchedTitle}
                      prizeUSD={watchedPrizeUSD}
                      prizeAsset={watchedPrizeAsset}
                      winners={watchedWinners}
                      requiredBalance={watchedRequiredBalance}
                    />
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-between border-t p-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousStep}
                  disabled={activeStep === "details" || loading}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                {activeStep !== "review" ? (
                  <Button
                    type="button"
                    onClick={handleNext}
                    className="shadow-sm shadow-foreground"
                  >
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    {platformAssetBalance < getValues("prize") + totalFees ? (
                      <Button disabled className="shadow-sm shadow-foreground">
                        Insufficient Balance
                      </Button>
                    ) : (
                      <PaymentChoose
                        costBreakdown={[
                          {
                            label: "Bounty Prize",
                            amount:
                              paymentMethod === "asset"
                                ? Number(getValues("prize"))
                                : Number(getValues("prizeInUSD")) * 0.7,
                            highlighted: true,
                            type: "cost",
                          },
                          {
                            label: "Platform Fee",
                            amount:
                              paymentMethod === "asset" ? totalFees : xlmFee,
                            highlighted: false,
                            type: "fee",
                          },
                          {
                            label: "Total Cost",
                            amount:
                              paymentMethod === "asset"
                                ? Number(getValues("prize")) + totalFees
                                : Number(getValues("prizeInUSD")) * 0.7 +
                                xlmFee,
                            highlighted: false,
                            type: "total",
                          },
                        ]}
                        XLM_EQUIVALENT={
                          Number(getValues("prizeInUSD")) * 0.7 + xlmFee
                        }
                        handleConfirm={handleSubmit(onSubmit)}
                        loading={loading}
                        requiredToken={Number(getValues("prize")) + totalFees}
                        trigger={
                          <Button
                            disabled={loading || !isValid}
                            className="shadow-sm shadow-foreground"
                          >
                            {loading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating Bounty...
                              </>
                            ) : (
                              <>
                                <Coins className="mr-2 h-4 w-4" />
                                Create Bounty
                              </>
                            )}
                          </Button>
                        }
                      />
                    )}
                  </>
                )}
              </div>
            </form>
          </FormProvider>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

function DetailsStep() {
  const {
    register,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<z.infer<typeof BountySchema>>();

  const title = watch("title", "");
  const prizeRate = 0.01;

  const handlePrizeChange = (value: string) => {
    const prizeUSD = Number(value) || 0;
    setValue("prizeInUSD", prizeUSD);

    if (prizeRate && Number(prizeRate) > 0) {
      const prizeValue = prizeUSD / Number(prizeRate);
      setValue("prize", prizeValue);
    } else {
      setValue("prize", 0);
    }
  };

  const handleEditorChange = (value: string): void => {
    setValue("content", value);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Basic Information</h2>
        <p className="text-sm text-muted-foreground">
          Enter the basic details about your bounty
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Bounty Title
          </Label>
          <div className="relative">
            <Input
              id="title"
              {...register("title")}
              placeholder="Enter a catchy title"
              maxLength={65}
              className="transition-all duration-200 focus:ring-2 focus:ring-amber-500/20"
            />
            <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
              {65 - (title?.length || 0)} characters left
            </div>
          </div>
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2 relative">
          <Label htmlFor="description" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Description
          </Label>
          <ReactQuill

            className="quill-editor min-h-24 resize-none transition-all duration-200 focus:ring-2 focus:ring-amber-500/20"

            value={getValues("content")}
            onChange={(value) => setValue("content", value)}
          />
          <EnhanceDescriptionButton className="absolute bottom-2 right-2" />
          {errors.content && (
            <p className="text-sm text-destructive">{errors.content.message}</p>
          )}
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <h3 className="text-base font-medium text-amber-800">
            Bounty Rewards
          </h3>
          <p className="mb-4 text-sm text-amber-700">
            Specify reward amounts and winner details
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* USD Prize */}
            <div className="space-y-2">
              <Label htmlFor="prizeInUSD" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-600" />
                USD Amount
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <DollarSign className="h-4 w-4 text-amber-500" />
                </div>
                <Input
                  id="prizeInUSD"
                  onChange={(e) => handlePrizeChange(e.target.value)}
                  value={watch("prizeInUSD") || ""}
                  className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-amber-500/20"
                  type="number"
                  step={0.00001}
                  min={0.00001}
                  placeholder="Enter USD amount"
                />
              </div>
              {errors.prizeInUSD && (
                <p className="text-sm text-destructive">
                  {errors.prizeInUSD.message}
                </p>
              )}
            </div>

            {/* Platform asset amount */}
            <div className="space-y-2">
              <Label htmlFor="prize" className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-600" />
                {PLATFORM_ASSET.code.toLocaleUpperCase()} Amount
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Coins className="h-4 w-4 text-amber-500" />
                </div>
                <Input
                  id="prize"
                  value={watch("prize") ? watch("prize").toFixed(5) : ""}
                  readOnly
                  className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-amber-500/20"
                  placeholder={`${PLATFORM_ASSET.code.toLocaleUpperCase()} equivalent`}
                />
              </div>
              {errors.prize && (
                <p className="text-sm text-destructive">
                  {errors.prize.message}
                </p>
              )}
            </div>
          </div>

          {/* Add a summary section to show the conversion */}
          {watch("prizeInUSD") > 0 && watch("prize") > 0 && (
            <div className="mt-4 rounded-md bg-amber-100 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-amber-800">Total Reward:</span>
                <span className="font-medium text-amber-900">
                  ${watch("prizeInUSD")} = {watch("prize").toFixed(5)}{" "}
                  {PLATFORM_ASSET.code.toLocaleUpperCase()}
                </span>
              </div>
              {watch("totalWinner") > 1 && (
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-amber-800">Per Winner:</span>
                  <span className="font-medium text-amber-900">
                    ${(watch("prizeInUSD") / watch("totalWinner")).toFixed(2)} ={" "}
                    {(watch("prize") / watch("totalWinner")).toFixed(5)}{" "}
                    {PLATFORM_ASSET.code.toLocaleUpperCase()}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="totalWinner" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Number of Winners
          </Label>
          <div className="relative">
            <Trophy className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="totalWinner"
              type="number"
              step={1}
              min={1}
              {...register("totalWinner", {
                valueAsNumber: true,
              })}
              className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-amber-500/20"
              placeholder="How many winners?"
            />
          </div>
          {errors.totalWinner && (
            <p className="text-sm text-destructive">
              {errors.totalWinner.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="requiredBalance" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Required Balance
          </Label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="requiredBalance"
              type="number"
              step={0.00001}
              min={0}
              {...register("requiredBalance", {
                valueAsNumber: true,
              })}
              className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-amber-500/20"
              placeholder={`Min balance in ${PLATFORM_ASSET.code}`}
            />
          </div>
          {errors.requiredBalance && (
            <p className="text-sm text-destructive">
              {errors.requiredBalance.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Minimum balance users need to claim this bounty (optional)
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function MediaStep({
  media,
  removeMediaItem,
  addMediaItem,
  loading,
}: {
  media: MediaInfoType[];
  removeMediaItem: (index: number) => void;
  addMediaItem: (url: string, type: MediaType) => void;
  loading: boolean;
}) {
  const { trigger } = useFormContext<z.infer<typeof BountySchema>>();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Bounty Media</h2>
        <p className="text-sm text-muted-foreground">
          Add images to make your bounty more engaging
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2 text-amber-800">
            <Camera className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm">
              Upload up to 4 images to showcase your bounty. The first image
              will be used as the main thumbnail.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Media Upload */}
      <div className="space-y-4">
        {media.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {media.map((item, index) => (
              <div
                key={index}
                className="relative aspect-square overflow-hidden rounded-md border"
              >
                <Image
                  src={item.url || "/placeholder.svg"}
                  alt={`Uploaded media ${index + 1}`}
                  fill
                  className="object-cover"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute right-1 top-1 h-6 w-6 rounded-full"
                  onClick={() => removeMediaItem(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
                {index === 0 && (
                  <Badge className="absolute bottom-1 left-1 bg-primary/80">
                    Main
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <Camera className="mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No images uploaded yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload images to increase user engagement
            </p>
          </div>
        )}

        {media.length < 4 && (
          <UploadS3Button
            variant="button"
            className="w-full"
            label={
              media.length === 0 ? "Upload Thumbnail Images" : "Add More Images"
            }
            disabled={media.length >= 4 || loading}
            endpoint="imageUploader"
            onClientUploadComplete={(res) => {
              const data = res;
              if (data?.url) {
                addMediaItem(data.url, MediaType.IMAGE);
                trigger().catch((e) => console.log(e));
              }
            }}
            onUploadError={(error: Error) => {
              toast.error(`Upload Error: ${error.message}`);
            }}
          />
        )}

        {media.length >= 4 && (
          <p className="text-xs text-amber-600">
            Maximum number of uploads reached (4/4)
          </p>
        )}
      </div>

      <Card className="border-gray-200 bg-gray-50">
        <CardContent className="p-4">
          <h4 className="mb-2 text-sm font-medium text-gray-700">
            Tips for great bounty images:
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-xs text-gray-600">
            <li>Use high-quality, relevant images</li>
            <li>Include a clear main thumbnail</li>
            <li>Show examples of what you{"'re"} looking for</li>
            <li>Avoid text-heavy images; put details in the description</li>
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ReviewStep({
  media,
  title,
  prizeUSD,
  prizeAsset,
  winners,
  requiredBalance,
}: {
  media: MediaInfoType[];
  title: string;
  prizeUSD: number;
  prizeAsset: number;
  winners: number;
  requiredBalance?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Review Your Bounty</h2>
        <p className="text-sm text-muted-foreground">
          Please review all information before submitting
        </p>
      </div>

      <Card className="border-amber-200">
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-lg font-semibold">
              {title || "Untitled Bounty"}
            </h3>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Reward Details</p>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Prize Amount (USD):
                </span>
                <span className="font-medium">${prizeUSD || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Prize Amount ({PLATFORM_ASSET.code.toLocaleUpperCase()}):
                </span>
                <span className="font-medium">
                  {(prizeAsset || 0).toFixed(5)}{" "}
                  {PLATFORM_ASSET.code.toLocaleUpperCase()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Number of Winners:
                </span>
                <span className="font-medium">{winners || 1}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Prize per Winner (USD):
                </span>
                <span className="font-medium">
                  ${((prizeUSD || 0) / (winners || 1)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Prize per Winner ({PLATFORM_ASSET.code.toLocaleUpperCase()}):
                </span>
                <span className="font-medium">
                  {((prizeAsset || 0) / (winners || 1)).toFixed(5)}{" "}
                  {PLATFORM_ASSET.code.toLocaleUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium">Required Balance</p>
            <p className="text-sm">
              {requiredBalance
                ? `${requiredBalance} ${PLATFORM_ASSET.code}`
                : "No minimum balance required"}
            </p>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium">Media</p>
            {media.length > 0 ? (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {media.map((item, index) => (
                  <div
                    key={index}
                    className="relative aspect-square overflow-hidden rounded-md border"
                  >
                    <Image
                      src={item.url || "/placeholder.svg"}
                      alt={`Thumbnail ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                    {index === 0 && (
                      <Badge className="absolute bottom-1 left-1 bg-primary/80">
                        Main
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No images uploaded
              </p>
            )}
          </div>

          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-2 p-3">
              <Check className="h-5 w-5 text-green-500" />
              <p className="text-sm text-amber-800">
                Your bounty is ready to be created. Click the button below to
                finalize.
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default CreateBountyModal;

function EnhanceDescriptionButton({ className }: { className?: string }) {
  const { watch, setValue } = useFormContext<z.infer<typeof BountySchema>>()
  const description = watch("content")
  const [isLoading, setIsLoading] = useState(false)
  const enhanceDescriptionMutation = api.pinAgent.enhanceDescription.useMutation({
    onSuccess: (data) => {
      setValue("content", data.enhancedDescription)
      toast.success("Description enhanced!")
    },
    onError: (err) => {
      toast.error(err.message || "Failed to enhance description")
    },
  })

  const handleEnhance = async () => {
    if (!description || description.trim().length === 0) {
      toast.error("Please enter a description first")
      return
    }

    setIsLoading(true)
    enhanceDescriptionMutation.mutate({
      description: description.trim(),
    })
    setIsLoading(false)
  }

  return (
    <Button
      type="button"

      size="sm"
      onClick={handleEnhance}
      disabled={!description || description.trim().length === 0 || enhanceDescriptionMutation.isLoading}
      className={`${className} h-6 w-6 px-2 text-xs gap-1 hover:bg-primary/10  rounded-full`}
    >
      {enhanceDescriptionMutation.isLoading ? (
        <>
          <Loader className="w-3 h-3 animate-spin" />

        </>
      ) : (
        <>
          <Wand2 className="w-3 h-3" />

        </>
      )}
    </Button>
  )
}
