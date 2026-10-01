"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MediaType } from "@prisma/client";
import { Eye, FileAudio, ImageIcon, Loader2, Lock, Music, Paperclip, Sparkles, Users2, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import type { z } from "zod";

import { plainText } from "~/components/common/enhance-button";
import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiImageButton } from "~/ui/ai/ai-image";
import { AiTextButton } from "~/ui/ai/ai-text";
import { htmlToText } from "~/ui/ai/shared";
import CustomAvatar from "~/components/common/custom-avatar";
import { Editor } from "~/components/common/quill-editor";
import { PostSchema } from "~/types/post";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { cn } from "~/lib/utils";
import type { EndPointType } from "~/server/s3";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { Dropzone } from "~/ui/upload/dropzone";
import { api } from "~/utils/api";

type PostForm = z.infer<typeof PostSchema>;
type Media = { url: string; type: MediaType };

const MEDIA_KINDS: { type: MediaType; label: string; icon: typeof ImageIcon; endpoint: EndPointType }[] = [
  { type: MediaType.IMAGE, label: "Image", icon: ImageIcon, endpoint: "imageUploader" },
  { type: MediaType.VIDEO, label: "Video", icon: Video, endpoint: "videoUploader" },
  { type: MediaType.MUSIC, label: "Music", icon: Music, endpoint: "musicUploader" },
];


/**
 * Posts › New post. One page: title, body, media and who can see it, with a
 * live preview of the post beside the form on desktop.
 */
export default function NewPostPage() {
  const router = useRouter();
  const creator = api.fan.creator.meCreator.useQuery();
  const tiers = api.fan.member.getAllMembership.useQuery({});

  const { register, handleSubmit, setValue, watch, control, formState } = useForm<PostForm>({
    resolver: zodResolver(PostSchema),
    defaultValues: { heading: "", content: "", subscription: "public" },
  });
  const { errors } = formState;
  const [media, setMedia] = useState<Media[]>([]);
  const [kind, setKind] = useState<MediaType>(MediaType.IMAGE);
  const [uploadKey, setUploadKey] = useState(0);
  const [uploading, setUploading] = useState(false);

  const create = api.fan.post.create.useMutation({
    onSuccess: (post) => {
      toast.success("Post published");
      router.push(`/posts/${post.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = handleSubmit((data) => create.mutate({ ...data, medias: media }));

  const values = watch();
  const tierLabel = (id?: string) => {
    if (!id || id === "public") return "Everyone";
    const t = tiers.data?.find((m) => m.id.toString() === id);
    if (!t) return "Members";
    const code = t.creator.pageAsset?.code ?? t.creator.customPageAssetCodeIssuer?.split("-")[0];
    return `${t.name} · ${t.price} ${code ?? ""}`.trim();
  };
  const activeKind = MEDIA_KINDS.find((k) => k.type === kind)!;
  const [imageBrief, setImageBrief] = useState("");
  const aiContext = { title: values.heading ?? "", content: htmlToText(values.content ?? "") };
  const imagePrompt = imageBrief || [values.heading, htmlToText(values.content ?? "").slice(0, 400)].filter(Boolean).join(". ");

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/posts")}>
        Cancel
      </Button>
      <Button type="submit" disabled={create.isPending || uploading}>
        {create.isPending && <Loader2 className="animate-spin" />}
        {create.isPending ? "Publishing…" : "Publish post"}
      </Button>
    </>
  );

  return (
    <FormPage
      title="New post"
      description="Share news, media and perks with your followers — publicly or only for a membership tier."
      back={{ href: "/posts", label: "Posts" }}
      onSubmit={(e) => void onSubmit(e)}
      actions={actions}
      aside={
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-hud text-base font-semibold">
            <Eye className="size-4 text-primary" /> Preview
          </h2>
          <div className="flex items-center gap-3">
            <CustomAvatar className="size-10" url={creator.data?.profileUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{creator.data?.name ?? "You"}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {values.subscription && values.subscription !== "public" ? <Lock className="size-3" /> : <Users2 className="size-3" />}
                {tierLabel(values.subscription)}
              </p>
            </div>
          </div>
          <p className="mt-4 font-hud text-lg font-semibold leading-snug">{values.heading || <span className="text-faint">Your title</span>}</p>
          {values.content && plainText(values.content) ? (
            <div className="prose prose-sm mt-2 line-clamp-6 max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: values.content }} />
          ) : (
            <p className="mt-2 text-sm text-faint">What you write shows up here.</p>
          )}
          {media.length > 0 && (
            <div className={cn("mt-4 grid gap-2", media.length > 1 && "grid-cols-2")}>
              {media.slice(0, 4).map((m, i) => (
                <MediaThumb key={i} media={m} />
              ))}
            </div>
          )}
        </section>
      }
    >
      <AiFillCard
        form="post"
        context={aiContext}
        examples={["Announce our summer merch drop this Friday", "Thank fans for 10k followers with a members-only perk", "Behind the scenes of our new mural"]}
        apply={(r) => {
          const before = { heading: values.heading, content: values.content };
          setValue("heading", r.heading, { shouldValidate: true });
          setValue("content", r.contentHtml, { shouldValidate: true });
          setImageBrief(r.imagePrompt);
          return () => {
            setValue("heading", before.heading);
            setValue("content", before.content);
          };
        }}
      />

      <FormSection title="Post" icon={Sparkles}>
        <Field
          label="Title"
          htmlFor="heading"
          required
          error={errors.heading?.message}
          action={<AiTextButton form="post" field="title" value={values.heading ?? ""} maxChars={80} context={aiContext} onChange={(t) => setValue("heading", t, { shouldValidate: true })} />}
        >
          <Input id="heading" placeholder="Add a compelling title" {...register("heading")} />
        </Field>
        <Field
          label="Content"
          required
          error={errors.content?.message}
          action={<AiTextButton form="post" field="post body" format="html" value={values.content ?? ""} context={aiContext} onChange={(t) => setValue("content", t, { shouldValidate: true })} />}
        >
          <div className="relative">
            <Controller
              name="content"
              control={control}
              render={({ field }) => <Editor value={field.value} onChange={field.onChange} placeholder="Write something for your fans…" />}
            />
          </div>
        </Field>
      </FormSection>

      <FormSection title="Media" icon={Paperclip} description="Optional. Add images, videos or music — one file at a time.">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Media type">
          {MEDIA_KINDS.map((k) => (
            <button
              key={k.type}
              type="button"
              role="radio"
              aria-checked={kind === k.type}
              onClick={() => (setKind(k.type), setUploadKey((n) => n + 1))}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                kind === k.type ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <k.icon className="size-4" /> {k.label}
            </button>
          ))}
        </div>
        {kind === MediaType.IMAGE && (
          <div className="flex justify-end">
            <AiImageButton
              form="post"
              aspect="wide"
              suggestedPrompt={imagePrompt}
              label="Generate image with AI"
              onImage={(url) => setMedia((m) => [...m, { url, type: MediaType.IMAGE }])}
            />
          </div>
        )}
        <Dropzone
          key={`${kind}-${uploadKey}`}
          endpoint={activeKind.endpoint}
          shape="wide"
          label={`Drop ${activeKind.label.toLowerCase()} here`}
          onUploadingChange={setUploading}
          onChange={(url) => {
            if (!url) return;
            setMedia((m) => [...m, { url, type: kind }]);
            setUploadKey((n) => n + 1);
          }}
        />
        {media.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {media.map((m, i) => (
              <li key={`${m.url}-${i}`} className="group relative">
                <MediaThumb media={m} />
                <button
                  type="button"
                  aria-label="Remove media"
                  onClick={() => setMedia((all) => all.filter((_, j) => j !== i))}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title="Who can see it" icon={Users2} description="Public posts reach every follower; tier posts are locked for everyone else.">
        <Field label="Visibility">
          {tiers.isLoading ? (
            <div className="skeleton h-9 w-full rounded-lg" />
          ) : (
            <Controller
              name="subscription"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose who can see it" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — everyone</SelectItem>
                    {tiers.data?.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {tierLabel(t.id.toString())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </Field>
      </FormSection>

      {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
    </FormPage>
  );
}

function MediaThumb({ media }: { media: Media }) {
  if (media.type === MediaType.IMAGE)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={media.url} alt="" className="aspect-square w-full rounded-lg border object-cover" />;
  if (media.type === MediaType.VIDEO) return <video src={media.url} className="aspect-square w-full rounded-lg border bg-black object-cover" muted playsInline />;
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border bg-surface-2 p-2">
      <FileAudio className="size-8 text-muted-foreground" />
      <audio src={media.url} controls className="w-full" />
    </div>
  );
}
