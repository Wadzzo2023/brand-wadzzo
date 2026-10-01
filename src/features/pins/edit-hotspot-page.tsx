"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PinType } from "@prisma/client";
import { CalendarClock, Hexagon, Loader2, Repeat, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import type { z } from "zod";

import type { StoredFeature } from "~/components/map-kit/geo";
import { ImageUploadField } from "~/components/pins/pin-form-parts";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Label } from "~/components/shadcn/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Switch } from "~/components/shadcn/ui/switch";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { cn } from "~/lib/utils";
import { updateHotspotFormSchema } from "~/types/hotspot";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { CenteredSpinner } from "~/ui/spinner";
import { api, type RouterOutputs } from "~/utils/api";

import { AreaPreview, AreaSize, DROP_EVERY, LIFETIME, toInput } from "./hotspot-parts";

type UpdateForm = z.infer<typeof updateHotspotFormSchema>;
type Hotspot = NonNullable<RouterOutputs["maps"]["pin"]["hotspotForEdit"]>;

const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

export default function EditHotspotPage({ hotspotId }: { hotspotId: string }) {
  const hotspotQuery = api.maps.pin.hotspotForEdit.useQuery(hotspotId);

  if (hotspotQuery.isLoading) return <CenteredSpinner />;

  if (hotspotQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <ErrorState
          message={hotspotQuery.error.message || "Failed to load hotspot"}
          onRetry={() => void hotspotQuery.refetch()}
        />
      </div>
    );
  }

  const hotspot = hotspotQuery.data;
  if (!hotspot) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={Hexagon}
          title="Hotspot not found"
          description="This hotspot may have been removed or you may not have permission to edit it."
          action={
            <Button asChild>
              <Link href="/pins/manage?tab=hotspot">Back to hotspots</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <EditHotspotForm hotspot={hotspot} />;
}

function EditHotspotForm({ hotspot: h }: { hotspot: Hotspot }) {
  const router = useRouter();
  const utils = api.useUtils();

  const template = h.template;

  const defaultValues: UpdateForm = {
    title: template?.title ?? "Untitled hotspot",
    description: template?.description ?? "",
    image: template?.image ?? "",
    url: template?.link ?? "",
    type: template?.type ?? PinType.OTHER,
    limit: template?.limit ?? 0,
    autoCollect: h.autoCollect ?? false,
    multiPin: h.multiPin ?? false,
    dropEveryDays: h.dropEveryDays,
    pinDurationDays: h.pinDurationDays,
    hotspotStartDate: new Date(h.hotspotStartDate),
    hotspotEndDate: new Date(h.hotspotEndDate),
    scope: "future_drops",
  };

  const methods = useForm<UpdateForm>({
    resolver: zodResolver(updateHotspotFormSchema),
    defaultValues,
  });

  const { register, handleSubmit, setValue, watch, setError, formState } = methods;
  const { errors, isDirty } = formState;
  const values = watch();

  const update = api.maps.pin.updateHotspot.useMutation({
    onSuccess: () => {
      toast.success("Hotspot updated");
      void utils.maps.pin.hotspotForEdit.invalidate(h.id);
      void utils.maps.pin.getHotspot.invalidate({ hotspotId: h.id });
      void utils.maps.pin.myHotspots.invalidate();
      router.push(`/pins?hotspot=${h.id}`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update hotspot");
    },
  });

  const onSubmit = (data: UpdateForm) => {
    if (data.hotspotEndDate <= data.hotspotStartDate) {
      setError("hotspotEndDate", { message: "End date must be after start date" });
      return;
    }

    update.mutate({
      hotspotId: h.id,
      scope: data.scope,
      hotspotStartDate: data.hotspotStartDate,
      hotspotEndDate: data.hotspotEndDate,
      dropEveryDays: data.dropEveryDays,
      pinDurationDays: data.pinDurationDays,
      autoCollect: data.autoCollect,
      multiPin: data.multiPin,
      details: {
        title: data.title,
        description: data.description ?? null,
        image: data.image ?? null,
        link: data.url ?? null,
        type: data.type,
        limit: data.limit,
      },
    });
  };

  const feature = h.geoJson as unknown as StoredFeature | null;
  const stats = h.stats;

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push(`/pins?hotspot=${h.id}`)}>
        Cancel
      </Button>
      <Button type="submit" disabled={update.isPending || !isDirty}>
        {update.isPending && <Loader2 className="animate-spin" />}
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={`Edit ${template?.title ?? "hotspot"}`}
      description="Update the drop schedule, collection rules, or pin template."
      back={{ href: "/pins/manage?tab=hotspot", label: "Hotspots" }}
      actions={actions}
      onSubmit={handleSubmit(onSubmit)}
      aside={
        <aside className="space-y-4">
          {feature && (
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <p className="font-hud text-xs font-semibold uppercase tracking-wider text-muted-foreground">Area</p>
              <AreaPreview feature={feature} />
              <p className="text-xs text-muted-foreground">
                <AreaSize feature={feature} shape={(h.shape.toLowerCase() as "circle" | "rectangle" | "polygon") ?? "polygon"} />
              </p>
            </div>
          )}

          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="font-hud text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stats</p>
            <div className="grid grid-cols-3 divide-x rounded-lg border text-center">
              <div className="p-2">
                <p className="font-hud text-lg font-bold">{stats.drops}</p>
                <p className="text-[11px] text-muted-foreground">Drops</p>
              </div>
              <div className="p-2">
                <p className="font-hud text-lg font-bold text-primary">{stats.live}</p>
                <p className="text-[11px] text-muted-foreground">Live</p>
              </div>
              <div className="p-2">
                <p className="font-hud text-lg font-bold">{stats.collected}</p>
                <p className="text-[11px] text-muted-foreground">Collected</p>
              </div>
            </div>
          </div>
        </aside>
      }
    >
      {/* Drop schedule */}
      <FormSection title="Drop schedule" icon={CalendarClock} description="When the hotspot runs and how often it drops a new pin.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" required error={errors.hotspotStartDate?.message}>
            <Input
              type="datetime-local"
              value={toInput(values.hotspotStartDate)}
              onChange={(e) => {
                const d = e.target.value ? new Date(e.target.value) : undefined;
                if (d) setValue("hotspotStartDate", d, { shouldValidate: true });
              }}
            />
          </Field>

          <Field label="Ends" required error={errors.hotspotEndDate?.message}>
            <Input
              type="datetime-local"
              value={toInput(values.hotspotEndDate)}
              onChange={(e) => {
                const d = e.target.value ? new Date(e.target.value) : undefined;
                if (d) setValue("hotspotEndDate", d, { shouldValidate: true });
              }}
            />
          </Field>

          <Field label="Drop frequency" required error={errors.dropEveryDays?.message}>
            <Select value={String(values.dropEveryDays)} onValueChange={(v) => setValue("dropEveryDays", Number(v), { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DROP_EVERY.map(([days, label]) => (
                  <SelectItem key={days} value={String(days)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Pin lifetime" required error={errors.pinDurationDays?.message}>
            <Select value={String(values.pinDurationDays)} onValueChange={(v) => setValue("pinDurationDays", Number(v), { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIFETIME.map(([days, label]) => (
                  <SelectItem key={days} value={String(days)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Apply changes to" hint="Choose whether modifications affect only upcoming drops or all past and upcoming drops.">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { id: "future_drops", label: "Future drops only", desc: "Keep past drops unchanged; apply new timing to future drops" },
              { id: "all_drops", label: "All drops", desc: "Cascade settings to existing drops as well as future drops" },
            ].map((opt) => (
              <label
                key={opt.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors",
                  values.scope === opt.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="scope"
                    value={opt.id}
                    checked={values.scope === opt.id}
                    onChange={() => setValue("scope", opt.id as "future_drops" | "all_drops", { shouldValidate: true })}
                    className="accent-primary"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{opt.desc}</span>
              </label>
            ))}
          </div>
        </Field>
      </FormSection>

      {/* Pin template */}
      <FormSection title="Pin template" icon={Tag} description="The appearance and details for pins generated by this hotspot.">
        <Field label="Title" required error={errors.title?.message}>
          <Input {...register("title")} placeholder="e.g. Daily Coffee Reward" />
        </Field>

        <Field label="Description" error={errors.description?.message}>
          <Textarea {...register("description")} rows={3} placeholder="Tell fans what they can collect here..." />
        </Field>

        <Field label="Image" hint="Square artwork or brand icon shown on the map pin and card." error={errors.image?.message}>
          <ImageUploadField value={values.image} onChange={(url) => setValue("image", url, { shouldValidate: true })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pin type" required error={errors.type?.message}>
            <Select value={values.type} onValueChange={(t) => setValue("type", t as PinType, { shouldValidate: true })}>
              <SelectTrigger>
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
          </Field>

          <Field label="Collection limit" hint="0 for unlimited collections per pin." error={errors.limit?.message}>
            <Input
              type="number"
              min={0}
              {...register("limit", { valueAsNumber: true })}
              placeholder="0"
            />
          </Field>
        </div>

        <Field label="Website / Action URL" error={errors.url?.message}>
          <Input {...register("url")} placeholder="https://..." />
        </Field>
      </FormSection>

      {/* Collection mode */}
      <FormSection title="Collection rules" icon={Repeat} description="How fans interact with and claim pins in this hotspot.">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="auto-collect-switch" className="text-sm font-medium">Auto-collect</Label>
              <p className="text-xs text-muted-foreground">Fans collect pins automatically when walking within GPS range.</p>
            </div>
            <Switch
              id="auto-collect-switch"
              checked={values.autoCollect}
              onCheckedChange={(c) => setValue("autoCollect", c, { shouldValidate: true })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="multi-pin-switch" className="text-sm font-medium">Allow multiple claims</Label>
              <p className="text-xs text-muted-foreground">Fans can collect multiple drops from this hotspot across days.</p>
            </div>
            <Switch
              id="multi-pin-switch"
              checked={values.multiPin}
              onCheckedChange={(c) => setValue("multiPin", c, { shouldValidate: true })}
            />
          </div>
        </div>
      </FormSection>
    </FormPage>
  );
}
