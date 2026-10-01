"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PinType } from "@prisma/client";
import { CalendarClock, Hexagon, Loader2, Settings, Sparkles, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import type { z } from "zod";

import { featureCenter, type StoredFeature } from "~/components/map-kit/geo";
import {
  CollectionInputs,
  ImageUploadField,
  PinTypeToggles,
  TiersOptions,
  type AssetType,
  type CreatePinType,
} from "~/components/pins/pin-form-parts";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { cn } from "~/lib/utils";
import { useHotspotDraft } from "~/store/hotspot-draft";
import { createHotspotFormSchema } from "~/types/hotspot";
import { EmptyState } from "~/ui/empty-state";
import { CenteredSpinner } from "~/ui/spinner";
import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiTextButton } from "~/ui/ai/ai-text";
import { fromLocal } from "~/ui/ai/shared";
import { Field, FormPage, FormSection } from "~/ui/form-page";

import { AreaPreview, AreaSize, DROP_EVERY, LIFETIME, toInput } from "./hotspot-parts";
import { api } from "~/utils/api";

type HotspotForm = z.infer<typeof createHotspotFormSchema>;

const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();


/**
 * Pins › New hotspot. The area drawn on the map, then one page: how fans
 * collect, the drop schedule, what each pin is, and the collection rules.
 */
/** Nothing to subscribe to: only used to tell the server render from the client one. */
const noSubscribe = () => () => undefined;

export default function NewHotspotPage() {
  const { feature, shape } = useHotspotDraft();
  // The draft lives in sessionStorage: wait for the client before deciding.
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);

  if (!ready) return <CenteredSpinner />;
  if (!feature)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={Hexagon}
          title="Draw the area first"
          description="On the Pins map, choose Draw hotspot and outline where pins should drop."
          action={
            <Button asChild>
              <Link href="/pins?draw=1">Draw on the map</Link>
            </Button>
          }
        />
      </div>
    );
  return <HotspotForm feature={feature} shape={shape} />;
}

function HotspotForm({ feature, shape }: { feature: StoredFeature; shape: HotspotForm["hotspotShape"] }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const inOneYear = useMemo(() => new Date(today.getFullYear() + 1, today.getMonth(), today.getDate(), today.getHours(), today.getMinutes()), [today]);

  const methods = useForm<HotspotForm>({
    resolver: zodResolver(createHotspotFormSchema),
    defaultValues: {
      title: "",
      description: "",
      pinNumber: 1,
      pinCollectionLimit: 0,
      autoCollect: false,
      multiPin: false,
      type: PinType.OTHER,
      hotspotShape: shape,
      dropEveryDays: 1,
      pinDurationDays: 3,
      hotspotStartDate: today,
      hotspotEndDate: inOneYear,
      url: "",
    },
  });
  const { register, handleSubmit, setValue, watch, control, setError, formState } = methods;
  const { errors } = formState;
  const values = watch();

  const [collectionMode, setCollectionMode] = useState<"manual" | "auto">("manual");
  const [imageBrief, setImageBrief] = useState("");
  const aiContext = {
    title: values.title ?? "",
    description: values.description ?? "",
    area: `${shape} hotspot near ${featureCenter(feature).lat.toFixed(4)}, ${featureCenter(feature).lng.toFixed(4)}`,
  };
  const imagePrompt = imageBrief || [values.title, values.description?.slice(0, 400)].filter(Boolean).join(". ");
  const DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
  const nearestDays = (n: number) => DAY_OPTIONS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  const [selectedToken, setSelectedToken] = useState<(AssetType & { bal: number }) | undefined>();
  const [remainingBalance, setRemainingBalance] = useState(0);
  const assetsQuery = api.fan.asset.myAssets.useQuery();

  useEffect(() => {
    setRemainingBalance(selectedToken ? selectedToken.bal - (values.pinCollectionLimit ?? 0) : 0);
  }, [values.pinCollectionLimit, selectedToken]);

  const clearDraft = useHotspotDraft((st) => st.clear);
  const create = api.maps.pin.createHotspot.useMutation({
    onSuccess: () => {
      clearDraft();
      toast.success("Hotspot created — the first pins drop on schedule");
      router.push("/pins");
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = handleSubmit((data) => {
    if (data.hotspotEndDate <= data.hotspotStartDate) {
      setError("hotspotEndDate", { message: "Must be after the start" });
      return;
    }
    if (selectedToken && data.pinCollectionLimit > selectedToken.bal) {
      setError("pinCollectionLimit", { message: "Collection limit can't be more than your token balance" });
      return;
    }
    create.mutate({ ...data, autoCollect: collectionMode === "auto", description: data.description ?? "", url: data.url ?? "", geoJson: feature });
  });

  const drops = (() => {
    const s = values.hotspotStartDate?.getTime();
    const e = values.hotspotEndDate?.getTime();
    if (!s || !e || e < s) return null;
    return Math.floor((e - s) / 86_400_000 / (values.dropEveryDays || 1)) + 1;
  })();

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          clearDraft();
          router.push("/pins");
        }}
      >
        Cancel
      </Button>
      <Button type="submit" disabled={create.isPending || remainingBalance < 0}>
        {create.isPending && <Loader2 className="animate-spin" />}
        {create.isPending ? "Creating…" : "Create hotspot"}
      </Button>
    </>
  );

  return (
    // CollectionInputs / TiersOptions / PinTypeToggles share field names with the pin form.
    <FormProvider {...(methods as unknown as ReturnType<typeof useForm<CreatePinType>>)}>
      <FormPage
        title="New hotspot"
        description="An area that keeps dropping pins on a schedule. Each drop lands somewhere inside it."
        back={{ href: "/pins", label: "Pins" }}
        onSubmit={(e) => void onSubmit(e)}
        actions={actions}
        aside={
          <>
            <FormSection title="Area" icon={Hexagon} description={<AreaSize feature={feature} shape={shape} />}>
              <AreaPreview feature={feature} />
              <Button type="button" variant="outline" size="sm" className="w-full" asChild>
                <Link href={`/pins?draw=1&shape=${shape}`}>Redraw on the map</Link>
              </Button>
            </FormSection>
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 font-hud text-base font-semibold">Summary</h2>
              {values.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.image} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
              )}
              <p className="font-hud text-sm font-semibold">{values.title || "Untitled hotspot"}</p>
              <div className="mt-2 divide-y text-sm">
                {(
                  [
                    ["Collection", collectionMode === "auto" ? "Auto" : "Manual"],
                    ["First drop", values.hotspotStartDate?.toLocaleString() ?? "—"],
                    ["Frequency", DROP_EVERY.find(([d]) => d === values.dropEveryDays)?.[1] ?? `Every ${values.dropEveryDays} days`],
                    ["Each pin lasts", LIFETIME.find(([d]) => d === values.pinDurationDays)?.[1] ?? `${values.pinDurationDays} days`],
                    ["Pins per drop", values.pinNumber ?? 1],
                    ["Est. drops", drops ?? "—"],
                    ...(selectedToken ? ([["Token", `${selectedToken.code} · ${selectedToken.bal} held`]] as const) : []),
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-1.5">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-right font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        }
      >
        <AiFillCard
          form="hotspot"
          context={aiContext}
          examples={["Daily coffee coupons around our 3 cafés for a month", "Weekly art drops in the park all summer", "Festival weekend: new pins every day, auto collect"]}
          apply={(r) => {
            const before = { ...values, mode: collectionMode };
            setValue("title", r.title, { shouldValidate: true });
            setValue("description", r.description);
            setValue("type", r.type);
            if (r.url) setValue("url", r.url);
            const start = fromLocal(r.hotspotStartDate);
            const end = fromLocal(r.hotspotEndDate);
            if (start) setValue("hotspotStartDate", start, { shouldValidate: true });
            if (end) setValue("hotspotEndDate", end, { shouldValidate: true });
            setValue("dropEveryDays", nearestDays(r.dropEveryDays));
            setValue("pinDurationDays", nearestDays(r.pinDurationDays));
            setValue("pinNumber", r.pinNumber);
            setValue("pinCollectionLimit", r.pinCollectionLimit);
            setValue("multiPin", r.multiPin);
            setCollectionMode(r.autoCollect ? "auto" : "manual");
            setImageBrief(r.imagePrompt);
            return () => {
              (
                ["title", "description", "type", "url", "hotspotStartDate", "hotspotEndDate", "dropEveryDays", "pinDurationDays", "pinNumber", "pinCollectionLimit", "multiPin"] as const
              ).forEach((k) => setValue(k, before[k] as never));
              setCollectionMode(before.mode);
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
                className={cn("rounded-lg border p-3 text-left transition-colors", collectionMode === id ? "border-primary bg-primary/5" : "hover:border-line-bright")}
              >
                <span className="block font-hud text-sm font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title="Drop schedule" icon={CalendarClock} description="When the hotspot runs and how often it drops a new pin.">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["hotspotStartDate", "hotspotEndDate"] as const).map((name) => (
              <Field key={name} label={name === "hotspotStartDate" ? "Starts" : "Ends"} required error={errors[name]?.message}>
                <Controller
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <Input type="datetime-local" value={toInput(field.value)} onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)} />
                  )}
                />
              </Field>
            ))}
            <Field label="Drop a new pin" error={errors.dropEveryDays?.message}>
              <Controller
                name="dropEveryDays"
                control={control}
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DROP_EVERY.map(([d, l]) => (
                        <SelectItem key={d} value={String(d)}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Each pin stays for" error={errors.pinDurationDays?.message}>
              <Controller
                name="pinDurationDays"
                control={control}
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFETIME.map(([d, l]) => (
                        <SelectItem key={d} value={String(d)}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Pin details" icon={Sparkles} description="What every dropped pin looks like.">
          <Field
            label="Title"
            htmlFor="title"
            required
            error={errors.title?.message}
            action={<AiTextButton form="hotspot" field="title" maxChars={60} value={values.title ?? ""} context={aiContext} onChange={(t) => setValue("title", t, { shouldValidate: true })} />}
          >
            <Input id="title" placeholder="A catchy name fans will see" {...register("title")} />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description?.message}
            action={<AiTextButton form="hotspot" field="description" value={values.description ?? ""} context={aiContext} onChange={(t) => setValue("description", t)} />}
          >
            <Textarea id="description" rows={4} className="resize-none" placeholder="Why should fans come here?" {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pin type">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
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
          <ImageUploadField value={values.image} onChange={(url) => setValue("image", url)} ai={{ form: "hotspot", suggestedPrompt: imagePrompt }} />
        </FormSection>

        <FormSection title="Collection & tier" icon={Tag} description="Who can collect, how many, and what they get.">
          <TiersOptions />
          <CollectionInputs
            setSelectedToken={setSelectedToken}
            setRemainingBalance={setRemainingBalance}
            assetsQuery={assetsQuery}
            selectedToken={selectedToken}
            remainingBalance={remainingBalance}
          />
          <PinTypeToggles />
        </FormSection>

        {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
      </FormPage>
    </FormProvider>
  );
}


