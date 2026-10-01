"use client";

import { CalendarDays, CalendarX, Clock, Globe, Link2, Loader2, MapPin, Search, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { firstError, fromLocalInput, toLocalInput } from "~/components/events/form-utils";
import { VenuePicker, type Venue } from "~/components/events/venue-picker";
import { Badge } from "~/components/shadcn/ui/badge";
import { Button } from "~/components/shadcn/ui/button";
import { Checkbox } from "~/components/shadcn/ui/checkbox";
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

type EditableEvent = RouterOutputs["events"]["myEvent"];

interface FormState {
  title: string;
  description: string;
  coverImage: string | null;
  start: string;
  end: string;
  inPerson: boolean;
  venue: Venue;
  link: string;
  linkLabel: string;
  limitSpots: boolean;
  capacity: string;
  pinIds: string[];
  bountyIds: number[];
}

function initialState(event: EditableEvent | null): FormState {
  if (event)
    return {
      title: event.title,
      description: event.description,
      coverImage: event.coverImage,
      start: toLocalInput(event.startDate),
      end: toLocalInput(event.endDate),
      inPerson: event.latitude != null || !!event.venueName || !!event.address,
      venue: { venueName: event.venueName ?? "", address: event.address ?? "", latitude: event.latitude, longitude: event.longitude },
      link: event.link ?? "",
      linkLabel: event.linkLabel ?? "",
      limitSpots: event.capacity != null,
      capacity: event.capacity?.toString() ?? "",
      pinIds: event.pins.map((p) => p.id),
      bountyIds: event.bounties.map((b) => b.id),
    };
  // Default: tomorrow 6–9 PM local, which is what most events look like.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(21);
  return {
    title: "",
    description: "",
    coverImage: null,
    start: toLocalInput(start),
    end: toLocalInput(end),
    inPerson: true,
    venue: { venueName: "", address: "", latitude: null, longitude: null },
    link: "",
    linkLabel: "",
    limitSpots: false,
    capacity: "",
    pinIds: [],
    bountyIds: [],
  };
}

/** Events › New event. */
export function NewEventPage() {
  return <EventForm event={null} />;
}

/** Events › Edit event: loads the brand's own event, then the same form. */
export function EditEventPage({ id }: { id: string }) {
  const event = api.events.myEvent.useQuery({ id }, { retry: false });
  if (event.isLoading) {
    return (
      <FormSkeleton />
    );
  }
  if (!event.data)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={CalendarX}
          title="Event not found"
          description="It may have been deleted, or it belongs to another brand."
          action={
            <Button asChild>
              <Link href="/events">Back to events</Link>
            </Button>
          }
        />
      </div>
    );
  return <EventForm event={event.data} />;
}

function EventForm({ event }: { event: EditableEvent | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(event));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const [uploading, setUploading] = useState(false);

  const utils = api.useUtils();
  const done = (msg: string) => {
    toast.success(msg);
    void utils.events.myEvents.invalidate();
    router.push("/events");
  };
  const create = api.events.createEvent.useMutation({ onSuccess: () => done("Event published") });
  const update = api.events.updateEvent.useMutation({ onSuccess: () => done("Event updated") });
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return void toast.error("Give the event a title");
    const startDate = fromLocalInput(form.start);
    const endDate = fromLocalInput(form.end);
    if (!startDate || !endDate) return void toast.error("Set when the event starts and ends");
    if (!form.inPerson && !form.link.trim()) return void toast.error("An online event needs a link — or switch on In person");
    const data = {
      title: form.title,
      description: form.description,
      coverImage: form.coverImage,
      startDate,
      endDate,
      venueName: form.inPerson ? form.venue.venueName : null,
      address: form.inPerson ? form.venue.address : null,
      latitude: form.inPerson ? form.venue.latitude : null,
      longitude: form.inPerson ? form.venue.longitude : null,
      link: form.link.trim() || null,
      linkLabel: form.linkLabel,
      capacity: form.limitSpots && form.capacity ? Number(form.capacity) : null,
      pinIds: form.pinIds,
      bountyIds: form.bountyIds,
    };
    if (event) update.mutate({ id: event.id, data });
    else create.mutate(data);
  };

  const start = fromLocalInput(form.start);
  const end = fromLocalInput(form.end);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [imageBrief, setImageBrief] = useState("");
  const aiContext = {
    title: form.title,
    description: form.description,
    when: form.start ? `${form.start} to ${form.end}` : "",
    where: form.inPerson ? [form.venue.venueName, form.venue.address].filter(Boolean).join(", ") : "online",
  };
  const imagePrompt = imageBrief || [form.title, form.description.slice(0, 400)].filter(Boolean).join(". ");

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/events")} disabled={saving}>
        Cancel
      </Button>
      <Button type="submit" disabled={saving || uploading}>
        {saving && <Loader2 className="animate-spin" />}
        {event ? "Save changes" : "Publish event"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={event ? "Edit event" : "New event"}
      description="Published straight away to everyone on Wadzzo — web and app."
      back={{ href: "/events", label: "Events" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <section className="overflow-hidden rounded-xl border bg-card">
          {form.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.coverImage} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-surface-2 text-faint">
              <CalendarDays className="size-10" />
            </div>
          )}
          <div className="space-y-2 p-5">
            <p className="font-hud text-xs font-semibold uppercase tracking-wide text-primary">Preview</p>
            <p className="font-hud text-lg font-semibold leading-snug">{form.title || "Untitled event"}</p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Clock className="mt-0.5 size-4 shrink-0" />
              {start ? start.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
              {end && ` – ${end.toLocaleTimeString(undefined, { timeStyle: "short" })}`}
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              {form.inPerson ? <MapPin className="mt-0.5 size-4 shrink-0" /> : <Globe className="mt-0.5 size-4 shrink-0" />}
              {form.inPerson ? form.venue.venueName || form.venue.address || "Venue not set" : "Online"}
            </p>
            {form.limitSpots && form.capacity && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="size-4" /> {form.capacity} spots
              </p>
            )}
            {form.link.trim() && (
              <Button type="button" size="sm" className="mt-2 w-full" tabIndex={-1}>
                {form.linkLabel || "Get tickets"}
              </Button>
            )}
          </div>
        </section>
      }
    >
      <AiFillCard
        form="event"
        context={aiContext}
        examples={["Rooftop listening party next Saturday 8–11pm, 80 spots", "Free online Q&A with the band on Thursday at 7", "Pop-up market at our store all day Sunday"]}
        apply={(r) => {
          const before = form;
          setForm((f) => ({
            ...f,
            title: r.title,
            description: r.description,
            start: r.start ?? f.start,
            end: r.end ?? f.end,
            inPerson: r.inPerson,
            venue: r.inPerson
              ? { ...f.venue, venueName: r.venueName ?? f.venue.venueName, address: r.address ?? f.venue.address }
              : f.venue,
            link: r.link ?? f.link,
            linkLabel: r.linkLabel ?? f.linkLabel,
            limitSpots: r.capacity != null,
            capacity: r.capacity != null ? String(r.capacity) : f.capacity,
          }));
          setImageBrief(r.imagePrompt);
          return () => setForm(before);
        }}
      />

      <FormSection title="Details" icon={Sparkles}>
        <Field
          label="Cover image"
          hint="Wide images work best."
          action={<AiImageButton form="event" aspect="wide" className="h-7 px-2.5 text-xs" label="Generate" suggestedPrompt={imagePrompt} onImage={(url) => set("coverImage", url)} />}
        >
          <Dropzone endpoint="coverUploader" shape="wide" value={form.coverImage} onUploadingChange={setUploading} onChange={(url) => set("coverImage", url ?? null)} />
        </Field>
        <Field
          label="Title"
          htmlFor="ev-title"
          required
          action={<AiTextButton form="event" field="title" maxChars={120} value={form.title} context={aiContext} onChange={(t) => set("title", t)} />}
        >
          <Input id="ev-title" value={form.title} maxLength={120} placeholder="Summer Night Market" onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field
          label="Description"
          htmlFor="ev-desc"
          action={<AiTextButton form="event" field="description" maxChars={5000} value={form.description} context={aiContext} onChange={(t) => set("description", t)} />}
        >
          <Textarea
            id="ev-desc"
            rows={5}
            maxLength={5000}
            value={form.description}
            placeholder="What's happening, who it's for, what to bring…"
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="When" icon={Clock} description={`Times are in your timezone (${tz}); fans see them in theirs.`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="ev-start" required>
            <Input
              id="ev-start"
              type="datetime-local"
              value={form.start}
              onChange={(e) => {
                const next = e.target.value;
                // Keep the same length when the start moves past the end.
                const s = fromLocalInput(next);
                const oldS = fromLocalInput(form.start);
                const oldE = fromLocalInput(form.end);
                if (s && oldS && oldE && s >= oldE) set("end", toLocalInput(new Date(s.getTime() + (oldE.getTime() - oldS.getTime()))));
                set("start", next);
              }}
            />
          </Field>
          <Field label="Ends" htmlFor="ev-end" required>
            <Input id="ev-end" type="datetime-local" value={form.end} min={form.start} onChange={(e) => set("end", e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Where" icon={MapPin}>
        <ToggleRow title="In person" hint="Add a venue — fans get a map and directions." checked={form.inPerson} onChange={(v) => set("inPerson", v)} />
        {form.inPerson && <VenuePicker value={form.venue} onChange={(v) => set("venue", v)} />}
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-[1fr_200px]">
          <Field label="Tickets / online link" htmlFor="ev-link" required={!form.inPerson} hint={form.inPerson ? "Optional — registration, tickets or a livestream." : "Required for online events."}>
            <Input id="ev-link" type="url" placeholder="https://" value={form.link} onChange={(e) => set("link", e.target.value)} />
          </Field>
          <Field label="Button text" htmlFor="ev-link-label">
            <Input id="ev-link-label" placeholder="Get tickets" maxLength={40} value={form.linkLabel} disabled={!form.link.trim()} onChange={(e) => set("linkLabel", e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="RSVPs" icon={Users}>
        <ToggleRow title="Limit RSVPs" hint="RSVPs close once this many people are going." checked={form.limitSpots} onChange={(v) => set("limitSpots", v)} />
        {form.limitSpots && (
          <Field label="Spots" htmlFor="ev-capacity">
            <Input
              id="ev-capacity"
              type="number"
              min={1}
              placeholder="100"
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value.replace(/\D/g, ""))}
              className="max-w-[200px]"
            />
          </Field>
        )}
      </FormSection>

      <LinkPicker pinIds={form.pinIds} bountyIds={form.bountyIds} onPins={(v) => set("pinIds", v)} onBounties={(v) => set("bountyIds", v)} />

      {error && <p className="text-sm text-destructive">{firstError(error)}</p>}
    </FormPage>
  );
}

function ToggleRow({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function LinkPicker({
  pinIds,
  bountyIds,
  onPins,
  onBounties,
}: {
  pinIds: string[];
  bountyIds: number[];
  onPins: (v: string[]) => void;
  onBounties: (v: number[]) => void;
}) {
  const [q, setQ] = useState("");
  const options = api.events.linkOptions.useQuery();
  const needle = q.trim().toLowerCase();
  const pins = useMemo(() => (options.data?.pins ?? []).filter((p) => p.title.toLowerCase().includes(needle)), [options.data, needle]);
  const bounties = useMemo(() => (options.data?.bounties ?? []).filter((b) => b.title.toLowerCase().includes(needle)), [options.data, needle]);
  const count = pinIds.length + bountyIds.length;

  return (
    <FormSection
      title="Linked pins & bounties"
      icon={Link2}
      description={
        <>
          Show fans what they can collect or take on at this event. {count > 0 && <Badge variant="secondary">{count} linked</Badge>}
        </>
      }
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pins and bounties" className="pl-9" />
      </div>
      {options.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-8 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid max-h-72 gap-4 overflow-y-auto sm:grid-cols-2">
          <OptionList
            title="Pins"
            empty="No active pins"
            items={pins.map((p) => ({ id: p.id, label: p.title, note: p.approved === true ? null : p.approved === false ? "Rejected" : "Pending review" }))}
            selected={pinIds}
            onChange={onPins}
          />
          <OptionList
            title="Bounties"
            empty="No bounties"
            items={bounties.map((b) => ({ id: b.id, label: b.title, note: b.status === "APPROVED" ? null : b.status.toLowerCase() }))}
            selected={bountyIds}
            onChange={onBounties}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Pins pending review and unapproved bounties stay hidden from fans until they&apos;re approved.</p>
    </FormSection>
  );
}

function OptionList<T extends string | number>({
  title,
  empty,
  items,
  selected,
  onChange,
}: {
  title: string;
  empty: string;
  items: { id: T; label: string; note: string | null }[];
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 font-hud text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                <Checkbox checked={selected.includes(it.id)} onCheckedChange={(c) => onChange(c ? [...selected, it.id] : selected.filter((x) => x !== it.id))} />
                <span className="min-w-0 flex-1 truncate text-sm">{it.label}</span>
                {it.note && <span className="shrink-0 text-[10px] text-muted-foreground">{it.note}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
