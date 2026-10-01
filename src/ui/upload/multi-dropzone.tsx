"use client";

import { File as FileIcon, ImageIcon, Loader2, Music, Paperclip, UploadCloud, Video, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import toast from "react-hot-toast";

import type { EndPointType } from "~/server/s3";
import { cn } from "~/lib/utils";

import { ENDPOINT_ACCEPT, fileMatchesAccept, formatBytes } from "./accept";
import { useS3Upload, type UploadedFile } from "./use-s3-upload";

const iconFor = (type: string) =>
  type.startsWith("image/") ? ImageIcon : type.startsWith("video/") ? Video : type.startsWith("audio/") ? Music : FileIcon;

/**
 * Drag-and-drop for several files at once. `panel` is a drop area with the
 * uploaded list under it; `icon` is a paperclip button (chat composers).
 */
export function MultiDropzone({
  endpoint = "multiBlobUploader",
  onUploaded,
  onBeforeUpload,
  maxFiles = 10,
  variant = "panel",
  label,
  showList = true,
  disabled,
  className,
}: {
  endpoint?: EndPointType;
  onUploaded?: (files: UploadedFile[]) => void;
  onBeforeUpload?: (files: File[]) => Promise<File[]> | File[];
  maxFiles?: number;
  variant?: "panel" | "icon";
  label?: string;
  showList?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const { uploadMany, busy, progress } = useS3Upload(endpoint);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<UploadedFile[]>([]);
  const { accept, hint } = ENDPOINT_ACCEPT[endpoint];

  const start = async (list: FileList | File[] | null | undefined) => {
    if (!list || disabled || busy) return;
    let files = Array.from(list).filter((f) => {
      const ok = fileMatchesAccept(f, accept);
      if (!ok) toast.error(`${f.name}: that file type isn't supported (${hint}).`);
      return ok;
    });
    if (files.length > maxFiles) {
      toast.error(`You can upload up to ${maxFiles} files at a time.`);
      files = files.slice(0, maxFiles);
    }
    if (onBeforeUpload) files = await onBeforeUpload(files);
    if (!files.length) return;
    try {
      const uploaded = await uploadMany(files);
      setDone((d) => [...d, ...uploaded]);
      onUploaded?.(uploaded);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const hidden = (
    <input
      ref={input}
      id={inputId}
      type="file"
      multiple
      accept={accept || undefined}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        void start(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={Boolean(disabled) || busy}
          className={cn("relative flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60", className)}
          aria-label={label ?? "Attach files"}
          title={busy ? `Uploading ${progress}%` : (label ?? "Attach files")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
        </button>
        {hidden}
      </>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragEnter={(e) => (e.preventDefault(), setDragging(true))}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void start(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-xl border-2 border-dashed bg-surface-2 px-4 py-6 text-center transition-colors hover:border-line-bright",
          dragging && "border-primary bg-primary/5",
          (Boolean(disabled) || busy) && "cursor-default opacity-70",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
        </span>
        <span className="font-hud text-sm font-semibold">{busy ? `Uploading… ${progress}%` : (label ?? "Drop files here")}</span>
        <span className="text-xs text-muted-foreground">
          or <span className="font-medium text-primary">browse</span> · up to {maxFiles} · {hint}
        </span>
        {busy && <span className="absolute inset-x-0 bottom-0 h-1 bg-primary transition-[width]" style={{ width: `${progress}%` }} />}
        {hidden}
      </div>

      {showList && done.length > 0 && (
        <ul className="space-y-1.5">
          {done.map((f, i) => {
            const I = iconFor(f.type);
            return (
              <li key={`${f.url}-${i}`} className="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-sm">
                <I className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setDone((d) => d.filter((_, j) => j !== i))}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${f.name} from the list`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
