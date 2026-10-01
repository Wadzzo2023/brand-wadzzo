"use client";

import { Camera, Loader2, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { plainText } from "~/components/common/enhance-button";
import { AiTextButton } from "~/ui/ai/ai-text";
import { Editor } from "~/components/common/quill-editor";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { EmptyState } from "~/ui/empty-state";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { FormSkeleton } from "~/ui/skeleton";
import { Dropzone } from "~/ui/upload/dropzone";
import { api, type RouterOutputs } from "~/utils/api";

const MAX_IMAGES = 4;
const code = PLATFORM_ASSET.code.toUpperCase();
type Bounty = NonNullable<RouterOutputs["bounty"]["Bounty"]["getBountyByID"]>;

/** Bounties › Edit: title, description, entry requirement and images. The prize is fixed once funded. */
export default function EditBountyPage({ id }: { id: number }) {
  const bounty = api.bounty.Bounty.getBountyByID.useQuery({ BountyId: id }, { enabled: Number.isFinite(id) });
  if (bounty.isLoading) {
    return (
      <FormSkeleton />
    );
  }
  if (!bounty.data)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={Trophy}
          title="Bounty not found"
          action={
            <Button asChild>
              <Link href="/bounties">Back to bounties</Link>
            </Button>
          }
        />
      </div>
    );
  return <EditForm bounty={bounty.data} />;
}

function EditForm({ bounty }: { bounty: Bounty }) {
  const router = useRouter();
  const back = `/bounties/${bounty.id}`;
  const [title, setTitle] = useState(bounty.title);
  const [content, setContent] = useState(bounty.description);
  const [requiredBalance, setRequiredBalance] = useState(String(bounty.requiredBalance ?? 0));
  const [images, setImages] = useState<string[]>(bounty.imageUrls ?? []);
  const [uploadKey, setUploadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"title" | "content" | "requiredBalance", string>>>({});

  const utils = api.useUtils();
  const update = api.bounty.Bounty.updateBounty.useMutation({
    onSuccess: () => {
      void utils.bounty.Bounty.getBountyByID.invalidate({ BountyId: bounty.id });
      toast.success("Bounty updated");
      router.push(back);
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const req = Number(requiredBalance);
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Title can't be empty";
    if (plainText(content).length < 2) next.content = "Describe the task";
    if (!Number.isFinite(req) || req < 0) next.requiredBalance = "Can't be less than 0";
    setErrors(next);
    if (Object.keys(next).length) return;
    update.mutate({ BountyId: bounty.id, title, content, requiredBalance: req, medias: images.map((url) => ({ url })) });
  };

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push(back)} disabled={update.isPending}>
        Cancel
      </Button>
      <Button type="submit" disabled={update.isPending || uploading}>
        {update.isPending && <Loader2 className="animate-spin" />}
        Save changes
      </Button>
    </>
  );

  return (
    <FormPage
      title="Edit bounty"
      description="Update the details fans see. The prize and number of winners are fixed once the bounty is funded."
      back={{ href: back, label: bounty.title }}
      onSubmit={submit}
      actions={actions}
      aside={
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 font-hud text-base font-semibold">Reward</h2>
          <div className="divide-y text-sm">
            {(
              [
                ["Prize", `$${bounty.priceInUSD} · ${bounty.priceInBand.toFixed(2)} ${code}`],
                ["Winners", bounty.totalWinner],
                ["Status", bounty.status.toLowerCase()],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-right font-medium capitalize">{v}</span>
              </div>
            ))}
          </div>
        </section>
      }
    >
      <FormSection title="The task" icon={Trophy}>
        <Field
          label="Title"
          htmlFor="title"
          required
          error={errors.title}
          action={<AiTextButton form="bounty" field="title" maxChars={65} value={title} context={{ description: plainText(content) }} onChange={(t) => setTitle(t.slice(0, 65))} />}
        >
          <Input id="title" maxLength={65} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="Description"
          required
          error={errors.content}
          action={<AiTextButton form="bounty" field="task description" format="html" value={content} context={{ title }} onChange={setContent} />}
        >
          <Editor value={content} onChange={setContent} />
        </Field>
        <Field label={`Fans must hold (${code})`} htmlFor="requiredBalance" error={errors.requiredBalance} hint="0 lets anyone join.">
          <Input id="requiredBalance" type="number" min={0} step="any" className="max-w-[200px]" value={requiredBalance} onChange={(e) => setRequiredBalance(e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="Images" icon={Camera} description={`Up to ${MAX_IMAGES}. The first is the cover.`}>
        {images.length < MAX_IMAGES && (
          <Dropzone
            key={uploadKey}
            endpoint="imageUploader"
            shape="wide"
            label="Drop an image here"
            onUploadingChange={setUploading}
            onChange={(url) => {
              if (!url) return;
              setImages((all) => [...all, url]);
              setUploadKey((n) => n + 1);
            }}
          />
        )}
        {images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((url, i) => (
              <li key={url} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="aspect-square w-full rounded-lg border object-cover" />
                {i === 0 && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Cover</span>}
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImages((all) => all.filter((_, j) => j !== i))}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      {update.isError && <p className="text-sm text-destructive">{update.error.message}</p>}
    </FormPage>
  );
}
