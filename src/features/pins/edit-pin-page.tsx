"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PinType } from "@prisma/client";
import { Calendar, Loader2, MapPin, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import type { z } from "zod";

import { MapPicker } from "~/components/map-kit/map-picker";
import { updateMapFormSchema } from "~/types/pin-edit";
import { ImageUploadField } from "~/components/pins/pin-form-parts";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Switch } from "~/components/shadcn/ui/switch";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { EmptyState } from "~/ui/empty-state";
import { AiTextButton } from "~/ui/ai/ai-text";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { FormSkeleton } from "~/ui/skeleton";
import { api, type RouterOutputs } from "~/utils/api";
import { usePortalAccess } from "~/components/shell/use-portal-access";

type EditForm = z.infer<typeof updateMapFormSchema>;
type Pin = RouterOutputs["maps"]["pin"]["myPinForEdit"];

const toInput = (d?: Date) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/** Pins › Edit pin: details, location, schedule and collection options on one page. */
export default function EditPinPage({ id }: { id: string }) {
  const pin = api.maps.pin.myPinForEdit.useQuery(id, { retry: false });
  const { isAdmin } = usePortalAccess();
  if (pin.isLoading) {
    return (
      <FormSkeleton />
    );
  }
  if (!pin.data)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={MapPin}
          title="Pin not found"
          description={isAdmin ? "This pin may have been deleted." : "It may have been deleted, or it belongs to another brand."}
          action={
            <Button asChild>
              <Link href={isAdmin ? "/admin/pins" : "/pins"}>{isAdmin ? "Back to pin review" : "Back to pins"}</Link>
            </Button>
          }
        />
      </div>
    );
  return <EditPinForm pin={pin.data} />;
}

function EditPinForm({ pin }: { pin: Pin }) {
  const router = useRouter();
  const { isAdmin } = usePortalAccess();
  const backHref = isAdmin ? "/admin/pins" : "/pins";
  const backLabel = isAdmin ? "Pin review" : "Pins";

  const methods = useForm<EditForm>({
    resolver: zodResolver(updateMapFormSchema),
    defaultValues: {
      pinId: pin.id,
      title: pin.title,
      description: pin.description,
      image: pin.image,
      type: pin.type,
      url: pin.url || undefined,
      startDate: pin.startDate,
      endDate: pin.endDate,
      lat: pin.lat,
      lng: pin.lng,
      autoCollect: pin.autoCollect,
      multiPin: pin.multiPin,
      pinRemainingLimit: pin.remaining,
    },
  });
  const { register, handleSubmit, setValue, watch, control, formState } = methods;
  const { errors } = formState;
  const values = watch();

  const utils = api.useUtils();
  const update = api.maps.pin.updatePin.useMutation({
    onSuccess: () => {
      void utils.maps.pin.getMyPins.invalidate();
      void utils.maps.pin.myPinForEdit.invalidate(pin.id);
      void utils.maps.pin.getAdminLocationGroups.invalidate();
      toast.success("Pin updated");
      router.push(backHref);
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = handleSubmit((data) => update.mutate({ ...data, description: data.description ?? "", url: data.url ?? undefined }));

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push(backHref)}>
        Cancel
      </Button>
      <Button type="submit" disabled={update.isPending}>
        {update.isPending && <Loader2 className="animate-spin" />}
        Save changes
      </Button>
    </>
  );

  return (
    <FormProvider {...methods}>
      <FormPage
        title="Edit pin"
        description={
          isAdmin && pin.creatorName
            ? `Editing pin for creator "${pin.creatorName}".`
            : pin.approved === null
              ? "This pin is waiting for review."
              : "Changes go live straight away."
        }
        back={{ href: backHref, label: backLabel }}
        onSubmit={(e) => void onSubmit(e)}
        actions={actions}
        aside={
          <FormSection title="Location" icon={MapPin} description="Click the map, drag the pin, search, or type coordinates.">
            <MapPicker
              value={{ lat: values.lat, lng: values.lng }}
              onChange={(v) => {
                setValue("lat", v.lat, { shouldValidate: true, shouldDirty: true });
                setValue("lng", v.lng, { shouldValidate: true, shouldDirty: true });
              }}
            />
            {(errors.lat ?? errors.lng) && <p className="text-xs text-destructive">Choose a valid location.</p>}
          </FormSection>
        }
      >
        <FormSection title="Details" icon={Sparkles}>
          <Field
            label="Title"
            htmlFor="title"
            required
            error={errors.title?.message}
            action={
              <AiTextButton form="pin" field="title" maxChars={60} value={values.title ?? ""} context={{ description: values.description ?? "" }} onChange={(t) => setValue("title", t, { shouldValidate: true, shouldDirty: true })} />
            }
          >
            <Input id="title" {...register("title")} />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description?.message}
            action={
              <AiTextButton form="pin" field="description" value={values.description ?? ""} context={{ title: values.title ?? "" }} onChange={(t) => setValue("description", t, { shouldDirty: true })} />
            }
          >
            <Textarea id="description" rows={4} className="resize-none" {...register("description")} />
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
              <Input id="url" type="url" placeholder="https://example.com" {...register("url", { setValueAs: (v: string) => v || undefined })} />
            </Field>
          </div>
          <ImageUploadField
            value={values.image}
            onChange={(url) => setValue("image", url ?? "", { shouldDirty: true })}
            ai={{ form: "pin", suggestedPrompt: [values.title, values.description?.slice(0, 400)].filter(Boolean).join(". ") }}
          />
        </FormSection>

        <FormSection title="Schedule" icon={Calendar}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["startDate", "endDate"] as const).map((name) => (
              <Field key={name} label={name === "startDate" ? "Starts" : "Ends"} error={errors[name]?.message}>
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

        <FormSection title="Collection" icon={Settings}>
          <Field
            label="Collections left"
            htmlFor="pinRemainingLimit"
            error={errors.pinRemainingLimit?.message}
            hint={`Of ${pin.limit} in total. Raising it adds to the total.`}
          >
            <Input id="pinRemainingLimit" type="number" min={0} step={1} className="max-w-[200px]" {...register("pinRemainingLimit", { valueAsNumber: true })} />
          </Field>
          <div className="divide-y rounded-lg border">
            {(
              [
                ["autoCollect", "Auto collect", "Collected automatically when fans enter the area."],
                ["multiPin", "Multi pin", "Allow fans to collect more than one pin here."],
              ] as const
            ).map(([name, title, hint]) => (
              <label key={name} className="flex cursor-pointer items-center gap-3 p-4">
                <span className="flex-1">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
                <Controller name={name} control={control} render={({ field }) => <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />} />
              </label>
            ))}
          </div>
        </FormSection>

        {update.isError && <p className="text-sm text-destructive">{update.error.message}</p>}
      </FormPage>
    </FormProvider>
  );
}
