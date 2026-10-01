"use client";

import { CalendarClock, ImageIcon, Link2, Loader2, Megaphone, Pin, Settings, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { firstError, fromLocalInput, toLocalInput } from "~/components/events/form-utils";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Switch } from "~/components/shadcn/ui/switch";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { EmptyState } from "~/ui/empty-state";
import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiImageButton } from "~/ui/ai/ai-image";
import { AiTextButton } from "~/ui/ai/ai-text";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { FormSkeleton } from "~/ui/skeleton";
import { Dropzone } from "~/ui/upload/dropzone";
import { api, type RouterOutputs } from "~/utils/api";

type EditableAnnouncement = RouterOutputs["events"]["myAnnouncements"][number];
const MAX_IMAGES = 6;

interface FormState {
  title: string;
  body: string;
  images: string[];
  pinned: boolean;
  withCta: boolean;
  ctaLabel: string;
  ctaUrl: string;
  expires: boolean;
  expiresAt: string;
}

function initialState(a: EditableAnnouncement | null): FormState {
  const weekOut = new Date();
  weekOut.setDate(weekOut.getDate() + 7);
  weekOut.setHours(23, 59, 0, 0);
  return {
    title: a?.title ?? "",
    body: a?.body ?? "",
    images: a?.images ?? [],
    pinned: a?.pinned ?? false,
    withCta: !!a?.ctaUrl,
    ctaLabel: a?.ctaLabel ?? "",
    ctaUrl: a?.ctaUrl ?? "",
    expires: !!a?.expiresAt,
    expiresAt: toLocalInput(a?.expiresAt ?? weekOut),
  };
}

/** Events › New announcement. */
export function NewAnnouncementPage() {
  return <AnnouncementForm announcement={null} />;
}

/** Events › Edit announcement. */
export function EditAnnouncementPage({ id }: { id: string }) {
  const all = api.events.myAnnouncements.useQuery();
  if (all.isLoading) {
    return (
      <FormSkeleton sections={2} />
    );
  }
  const announcement = all.data?.find((a) => a.id === id);
  if (!announcement)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={Megaphone}
          title="Announcement not found"
          description="It may have been deleted."
          action={
            <Button asChild>
              <Link href="/events?tab=announcements">Back to announcements</Link>
            </Button>
          }
        />
      </div>
    );
  return <AnnouncementForm announcement={announcement} />;
}

function AnnouncementForm({ announcement }: { announcement: EditableAnnouncement | null }) {
  const router = useRouter();
  const back = "/events?tab=announcements";
  const [form, setForm] = useState<FormState>(() => initialState(announcement));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const [uploadKey, setUploadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [imageBrief, setImageBrief] = useState("");
  const aiContext = { title: form.title, message: form.body, button: form.withCta ? form.ctaLabel : "" };
  const imagePrompt = imageBrief || [form.title, form.body.slice(0, 400)].filter(Boolean).join(". ");

  const utils = api.useUtils();
  const done = (msg: string) => {
    toast.success(msg);
    void utils.events.myAnnouncements.invalidate();
    router.push(back);
  };
  const create = api.events.createAnnouncement.useMutation({ onSuccess: () => done("Announcement posted") });
  const update = api.events.updateAnnouncement.useMutation({ onSuccess: () => done("Announcement updated") });
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return void toast.error("Give it a title");
    const expiresAt = form.expires ? fromLocalInput(form.expiresAt) : null;
    if (form.expires && (!expiresAt || expiresAt <= new Date())) return void toast.error("Pick an expiry in the future");
    const data = {
      title: form.title,
      body: form.body,
      images: form.images,
      pinned: form.pinned,
      ctaLabel: form.withCta ? form.ctaLabel : null,
      ctaUrl: form.withCta && form.ctaUrl.trim() ? form.ctaUrl.trim() : null,
      expiresAt,
    };
    if (announcement) update.mutate({ id: announcement.id, data });
    else create.mutate(data);
  };

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push(back)} disabled={saving}>
        Cancel
      </Button>
      <Button type="submit" disabled={saving || uploading}>
        {saving && <Loader2 className="animate-spin" />}
        {announcement ? "Save changes" : "Post announcement"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={announcement ? "Edit announcement" : "New announcement"}
      description="Shows up in the News feed on Wadzzo web and app right away."
      back={{ href: back, label: "Announcements" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <section className="overflow-hidden rounded-xl border bg-card">
          {form.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.images[0]} alt="" className="aspect-video w-full object-cover" />
          )}
          <div className="space-y-2 p-5">
            <p className="flex items-center gap-2 font-hud text-xs font-semibold uppercase tracking-wide text-primary">
              Preview {form.pinned && <Pin className="size-3" />}
            </p>
            <p className="font-hud text-lg font-semibold leading-snug">{form.title || "Untitled announcement"}</p>
            <p className="line-clamp-6 whitespace-pre-line text-sm text-muted-foreground">{form.body || "Your message shows here."}</p>
            {form.withCta && form.ctaUrl.trim() && (
              <Button type="button" size="sm" className="mt-2 w-full" tabIndex={-1}>
                {form.ctaLabel || "Learn more"}
              </Button>
            )}
            {form.expires && <p className="pt-1 text-xs text-faint">Hidden after {fromLocalInput(form.expiresAt)?.toLocaleString() ?? "—"}</p>}
          </div>
        </section>
      }
    >
      <AiFillCard
        form="announcement"
        context={aiContext}
        examples={["We're closed Monday for a private event", "New flavours drop this weekend — first 50 get a free topping", "Our app now has pins across the whole city"]}
        apply={(r) => {
          const before = form;
          setForm((f) => ({
            ...f,
            title: r.title,
            body: r.body,
            withCta: Boolean(r.ctaUrl),
            ctaLabel: r.ctaLabel ?? f.ctaLabel,
            ctaUrl: r.ctaUrl ?? f.ctaUrl,
          }));
          setImageBrief(r.imagePrompt);
          return () => setForm(before);
        }}
      />

      <FormSection title="Message" icon={Megaphone}>
        <Field
          label="Title"
          htmlFor="an-title"
          required
          action={<AiTextButton form="announcement" field="title" maxChars={120} value={form.title} context={aiContext} onChange={(t) => set("title", t)} />}
        >
          <Input id="an-title" value={form.title} maxLength={120} placeholder="New flavours this weekend" onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field
          label="Message"
          htmlFor="an-body"
          action={<AiTextButton form="announcement" field="message" maxChars={5000} value={form.body} context={aiContext} onChange={(t) => set("body", t)} />}
        >
          <Textarea id="an-body" rows={6} maxLength={5000} value={form.body} placeholder="Tell your fans what's new…" onChange={(e) => set("body", e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="Images" icon={ImageIcon} description={`Optional, up to ${MAX_IMAGES}. The first is the cover.`}>
        {form.images.length < MAX_IMAGES && (
          <div className="flex justify-end">
            <AiImageButton
              form="announcement"
              aspect="wide"
              label="Generate image with AI"
              suggestedPrompt={imagePrompt}
              onImage={(url) => setForm((f) => ({ ...f, images: [...f.images, url].slice(0, MAX_IMAGES) }))}
            />
          </div>
        )}
        {form.images.length < MAX_IMAGES && (
          <Dropzone
            key={uploadKey}
            endpoint="imageUploader"
            shape="wide"
            label={form.images.length ? "Add another image" : "Drop an image here"}
            onUploadingChange={setUploading}
            onChange={(url) => {
              if (!url) return;
              setForm((f) => ({ ...f, images: [...f.images, url].slice(0, MAX_IMAGES) }));
              setUploadKey((n) => n + 1);
            }}
          />
        )}
        {form.images.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {form.images.map((src, i) => (
              <li key={src} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-square w-full rounded-lg border object-cover" />
                {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Cover</span>}
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => set("images", form.images.filter((x) => x !== src))}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title="Options" icon={Settings}>
        <div className="divide-y rounded-lg border">
          <Toggle icon={Pin} title="Pin to top" hint="Stays first on your brand page." checked={form.pinned} onChange={(v) => set("pinned", v)} />
          <div>
            <Toggle icon={Link2} title="Button" hint="A call-to-action that opens a link." checked={form.withCta} onChange={(v) => set("withCta", v)} />
            {form.withCta && (
              <div className="grid gap-3 px-4 pb-4 sm:grid-cols-[180px_1fr]">
                <Input aria-label="Button text" placeholder="Shop now" maxLength={40} value={form.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} />
                <Input aria-label="Button link" type="url" placeholder="https://" value={form.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <Toggle icon={CalendarClock} title="Expires" hint="Hidden from fans automatically after this." checked={form.expires} onChange={(v) => set("expires", v)} />
            {form.expires && (
              <div className="px-4 pb-4">
                <Input
                  aria-label="Expires at"
                  type="datetime-local"
                  value={form.expiresAt}
                  min={toLocalInput(new Date())}
                  onChange={(e) => set("expiresAt", e.target.value)}
                  className="max-w-[240px]"
                />
              </div>
            )}
          </div>
        </div>
      </FormSection>

      {error && <p className="text-sm text-destructive">{firstError(error)}</p>}
    </FormPage>
  );
}

function Toggle({ icon: Icon, title, hint, checked, onChange }: { icon: typeof Pin; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 p-4">
      <Icon className="size-4 text-primary" />
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
