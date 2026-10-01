"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PinType } from "@prisma/client";
import { Calendar, Loader2, MapPin, Settings, Sparkles, Tag, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { MapPicker } from "~/components/map-kit/map-picker";
import {
  CollectionInputs,
  createPinFormSchema,
  ImageUploadField,
  PinTypeToggles,
  TagsSection,
  TiersOptions,
  type AssetType,
  type CreatePinType,
} from "~/components/pins/pin-form-parts";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { cn } from "~/lib/utils";
import { useSelectCreatorStore } from "~/components/store/creator-selection-store";
import { api } from "~/utils/api";
import { BrandPicker } from "~/features/admin/brand-picker";
import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiTextButton } from "~/ui/ai/ai-text";
import { Field, FormPage, FormSection } from "~/ui/form-page";

const toInput = (d?: Date) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/**
 * Admin › New pin.
 * Creates a pin on behalf of any creator with modern HUD form layout,
 * live map placement, token rewards, tiers, and instant approval.
 */
export default function AdminNewPinPage() {
  const router = useRouter();
  const search = useSearchParams();

  const qLat = Number(search?.get("lat"));
  const qLng = Number(search?.get("lng"));
  const fromQuery = search?.get("lat") && Number.isFinite(qLat) && Number.isFinite(qLng) ? { lat: qLat, lng: qLng } : null;
  const qCreatorId = search?.get("creatorId");

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const creatorsQuery = api.fan.creator.getCreators.useQuery();
  const { data: storeCreator, setData: setStoreCreator } = useSelectCreatorStore();

  const [selectedCreatorId, setSelectedCreatorId] = useState<string>(qCreatorId ?? storeCreator?.id ?? "");

  // Sync creator selection
  useEffect(() => {
    if (!selectedCreatorId && creatorsQuery.data && creatorsQuery.data.length > 0) {
      const first = qCreatorId ? creatorsQuery.data.find((c) => c.id === qCreatorId) : creatorsQuery.data[0];
      if (first) {
        setSelectedCreatorId(first.id);
        setStoreCreator(first);
      }
    }
  }, [creatorsQuery.data, qCreatorId, selectedCreatorId, setStoreCreator]);

  const selectedCreator = creatorsQuery.data?.find((c) => c.id === selectedCreatorId);

  const methods = useForm<CreatePinType>({
    resolver: zodResolver(createPinFormSchema),
    defaultValues: {
      lat: fromQuery?.lat,
      lng: fromQuery?.lng,
      radius: 50,
      pinNumber: 1,
      pinCollectionLimit: 0,
      description: "",
      autoCollect: false,
      startDate: today,
      endDate: tomorrow,
      multiPin: false,
      type: PinType.OTHER,
      url: "",
      tags: [],
    },
  });

  const { register, handleSubmit, setValue, watch, control, formState } = methods;
  const { errors } = formState;

  const [collectionMode, setCollectionMode] = useState<"manual" | "auto">("manual");
  const [selectedToken, setSelectedToken] = useState<(AssetType & { bal: number }) | undefined>();
  const [remainingBalance, setRemainingBalance] = useState(0);

  const assetsQuery = api.fan.asset.getCreatorPageAsset.useQuery(
    { creatorId: selectedCreatorId },
    { enabled: Boolean(selectedCreatorId) },
  );

  const limit = watch("pinCollectionLimit");
  useEffect(() => {
    setRemainingBalance(selectedToken ? selectedToken.bal - (limit ?? 0) : 0);
  }, [limit, selectedToken]);

  const create = api.maps.pin.createForAdminPin.useMutation({
    onSuccess: () => {
      toast.success(`Pin created for ${selectedCreator?.name ?? "creator"}!`);
      router.push("/admin/maps");
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = handleSubmit((data) => {
    if (!selectedCreatorId) {
      toast.error("Please select a brand/creator first.");
      return;
    }
    create.mutate({
      ...data,
      description: data.description ?? "",
      url: data.url ?? undefined,
      image: data.image ?? undefined,
      token: selectedToken?.id,
      tokenAmount: selectedToken?.bal,
      creatorId: selectedCreatorId,
      autoCollect: collectionMode === "auto",
      tags: data.tags ?? [],
    });
  });

  const lat = watch("lat");
  const lng = watch("lng");
  const values = watch();
  const location = Number.isFinite(lat) && Number.isFinite(lng) && lat !== undefined && lng !== undefined ? { lat, lng } : null;

  const [imageBrief, setImageBrief] = useState("");
  const [tagIdeas, setTagIdeas] = useState<string[]>([]);
  const aiContext = {
    title: values.title ?? "",
    description: values.description ?? "",
    type: values.type ?? "",
    location: location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : "",
  };
  const imagePrompt = imageBrief || [values.title, values.description?.slice(0, 400)].filter(Boolean).join(". ");

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/admin/maps")}>
        Cancel
      </Button>
      <Button type="submit" disabled={create.isPending || !selectedCreatorId}>
        {create.isPending && <Loader2 className="animate-spin" />}
        {create.isPending ? "Dropping pin…" : "Drop pin"}
      </Button>
    </>
  );

  return (
    <FormProvider {...methods}>
      <FormPage
        title="New pin for a brand"
        description="Drop a pin on a brand's behalf. Pins you create as an admin go live right away — no review."
        back={{ href: "/admin/maps", label: "All maps" }}
        onSubmit={(e) => void onSubmit(e)}
        actions={actions}
        aside={
          <>
            <FormSection title="Location" icon={MapPin} description="Click the map, search, or type coordinates.">
              <MapPicker
                value={location}
                radiusMetres={values.radius}
                onChange={(v) => {
                  setValue("lat", v.lat, { shouldValidate: true });
                  setValue("lng", v.lng, { shouldValidate: true });
                }}
              />
              {(errors.lat ?? errors.lng) && <p className="text-xs text-destructive">Choose where the pin goes.</p>}
              <Field label="Collection radius (m)" htmlFor="radius" error={errors.radius?.message} hint="How close fans must be to collect it.">
                <Input id="radius" type="number" min={1} {...register("radius", { valueAsNumber: true })} />
              </Field>
            </FormSection>
            <Summary values={values} mode={collectionMode} token={selectedToken} remaining={remainingBalance} creatorName={selectedCreator?.name} />
          </>
        }
      >
        {/* Creator Selection Header Section */}
        <FormSection title="Brand" icon={UserRound} description="Who this pin belongs to.">
          <Field label="Brand" required hint="The brand owns the pin, sees it on its map, and gives its rewards.">
            <BrandPicker
              className="w-full"
              brands={creatorsQuery.data}
              value={selectedCreator}
              loading={creatorsQuery.isPending}
              onChange={(b) => {
                setSelectedCreatorId(b.id);
                setStoreCreator(b);
              }}
            />
          </Field>
        </FormSection>

        <AiFillCard
          form="pin"
          context={aiContext}
          examples={["Coffee voucher near Central Park", "Exclusive music track drop at the venue", "Secret artwork pin at the gallery"]}
          apply={(r) => {
            const before = { ...values, mode: collectionMode };
            setValue("title", r.title, { shouldValidate: true });
            setValue("description", r.description);
            setValue("type", r.type);
            if (r.url) setValue("url", r.url);
            setValue("radius", r.radius);
            setValue("multiPin", r.multiPin);
            setCollectionMode(r.autoCollect ? "auto" : "manual");
            setTagIdeas(r.tags);
            setImageBrief(r.imagePrompt);
            return () => {
              (["title", "description", "type", "url", "startDate", "endDate", "pinNumber", "pinCollectionLimit", "radius", "multiPin"] as const).forEach((k) =>
                setValue(k, before[k] as never),
              );
              setCollectionMode(before.mode);
              setTagIdeas([]);
            };
          }}
        />

        <FormSection title="How fans collect it" icon={Settings}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Collection mode">
            {(
              [
                ["manual", "Manual collect", "Fans tap to collect when they're in range."],
                ["auto", "Auto collect", "Collected automatically when fans enter the area."],
              ] as const
            ).map(([id, label, text]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={collectionMode === id}
                onClick={() => setCollectionMode(id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  collectionMode === id ? "border-primary bg-primary/5" : "hover:border-line-bright",
                )}
              >
                <span className="block font-hud text-sm font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title="Details" icon={Sparkles}>
          <Field
            label="Title"
            htmlFor="title"
            required
            error={errors.title?.message}
            action={<AiTextButton form="pin" field="title" maxChars={60} value={values.title ?? ""} context={aiContext} onChange={(t) => setValue("title", t, { shouldValidate: true })} />}
          >
            <Input id="title" placeholder="A catchy name fans will see" {...register("title")} />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description?.message}
            action={<AiTextButton form="pin" field="description" value={values.description ?? ""} context={aiContext} onChange={(t) => setValue("description", t)} />}
          >
            <Textarea id="description" rows={4} className="resize-none" placeholder="What makes this drop worth walking to?" {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pin type">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(PinType).map((t) => (
                        <SelectItem key={t} value={t}>
                          {typeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Link" htmlFor="url" error={errors.url?.message} hint="Optional — where the pin sends fans.">
              <Input id="url" type="url" placeholder="https://example.com" {...register("url")} />
            </Field>
          </div>
          <ImageUploadField value={values.image} onChange={(url) => setValue("image", url)} ai={{ form: "pin", suggestedPrompt: imagePrompt }} />
        </FormSection>

        <FormSection title="Collection & tier" icon={Settings} description="Who can collect it, how many, and what they get.">
          <TiersOptions creatorId={selectedCreatorId} />
          {assetsQuery.data && (
            <CollectionInputs
              setSelectedToken={setSelectedToken}
              setRemainingBalance={setRemainingBalance}
              assetsQuery={assetsQuery as Parameters<typeof CollectionInputs>[0]["assetsQuery"]}
              selectedToken={selectedToken}
              remainingBalance={remainingBalance}
            />
          )}
        </FormSection>

        <FormSection title="Schedule" icon={Calendar}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["startDate", "endDate"] as const).map((name) => (
              <Field key={name} label={name === "startDate" ? "Starts" : "Ends"} required error={errors[name]?.message}>
                <Controller
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <Input type="datetime-local" value={toInput(field.value)} onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)} />
                  )}
                />
              </Field>
            ))}
          </div>
        </FormSection>

        <FormSection title="Tags & options" icon={Tag}>
          <TagsSection suggestions={tagIdeas} />
          <PinTypeToggles />
        </FormSection>

        {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
      </FormPage>
    </FormProvider>
  );
}

function Summary({
  values,
  mode,
  token,
  remaining,
  creatorName,
}: {
  values: Partial<CreatePinType>;
  mode: "manual" | "auto";
  token?: AssetType & { bal: number };
  remaining: number;
  creatorName?: string;
}) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 font-hud text-base font-semibold">Summary</h2>
      {values.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={values.image} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
      )}
      <p className="font-hud text-sm font-semibold">{values.title ?? "Untitled pin"}</p>
      <div className="mt-2 divide-y">
        {creatorName && row("Creator", creatorName)}
        {row("Collection", mode === "auto" ? "Auto" : "Manual")}
        {row("Type", values.type ? typeLabel(values.type) : "—")}
        {row("Pins", values.pinNumber ?? 1)}
        {row("Limit per pin", values.pinCollectionLimit ?? 0)}
        {row("Starts", values.startDate ? values.startDate.toLocaleString() : "—")}
        {row("Ends", values.endDate ? values.endDate.toLocaleString() : "—")}
        {token && row("Token", `${token.code} · ${token.bal} held`)}
        {token && row("Left after", <span className={remaining < 0 ? "text-destructive" : undefined}>{remaining}</span>)}
      </div>
    </section>
  );
}
