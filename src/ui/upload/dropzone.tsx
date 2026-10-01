"use client";

import { AlertCircle, File as FileIcon, ImagePlus, Loader2, Music, RefreshCw, Trash2, UploadCloud, Video, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import type { EndPointType } from "~/server/s3";
import { cn } from "~/lib/utils";

import { ENDPOINT_ACCEPT, fileMatchesAccept } from "./accept";
import { useS3Upload } from "./use-s3-upload";

export type DropzoneShape = "square" | "wide" | "circle" | "compact" | "button";

export type DropzoneProps = {
  endpoint: EndPointType;
  /** Current file URL (controlled). */
  value?: string | null;
  /** Optional preview URL / data URL override (e.g. for IPFS CIDs or fast local preview). */
  previewUrl?: string | null;
  /** Called with the uploaded file's public URL, or undefined when removed. */
  onChange?: (url: string | undefined, file?: { name: string; size: number; type: string }) => void;
  /** Transform or veto a file before upload (e.g. resize). Return undefined to cancel. */
  onBeforeUpload?: (file: File) => Promise<File | undefined> | File | undefined;
  onUploadingChange?: (uploading: boolean) => void;
  /** Upload somewhere other than S3 (e.g. IPFS). Resolves with the public URL. */
  uploader?: (file: File) => Promise<string>;
  shape?: DropzoneShape;
  label?: string;
  description?: string;
  icon?: ReactNode;
  accept?: string;
  /** Show a remove action when filled (default: true when onChange is given). */
  removable?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
};

type Kind = "image" | "video" | "audio" | "file";
const kindOf = (typeOrUrl: string, endpoint?: EndPointType, accept?: string): Kind => {
  const s = typeOrUrl.toLowerCase();
  if (s.startsWith("image/") || s.startsWith("data:image/") || /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|tiff?)(\?|$)/i.test(s)) {
    return "image";
  }
  if (s.startsWith("video/") || s.startsWith("data:video/") || /\.(mp4|webm|mov|m4v|ogv|avi)(\?|$)/i.test(s)) {
    return "video";
  }
  if (s.startsWith("audio/") || s.startsWith("data:audio/") || /\.(mp3|wav|ogg|aac|flac|m4a|wma|aiff)(\?|$)/i.test(s)) {
    return "audio";
  }

  // Fallback using endpoint if URL doesn't have an extension (standard with S3 hex keys)
  if (endpoint) {
    if (endpoint === "imageUploader" || endpoint === "profileUploader" || endpoint === "coverUploader" || endpoint === "svgUploader") {
      return "image";
    }
    if (endpoint === "videoUploader") return "video";
    if (endpoint === "musicUploader") return "audio";
  }

  // Fallback using accept parameter
  if (accept) {
    if (accept.includes("image/")) return "image";
    if (accept.includes("video/")) return "video";
    if (accept.includes("audio/")) return "audio";
  }

  return "file";
};

/**
 * Drag-and-drop uploader for one file, in the shape the context needs:
 * `square` (media tile), `wide` (cover/banner), `circle` (avatar),
 * `compact` (a row inside dense forms) or `button` (a plain upload button).
 * Click, keyboard, drag-and-drop and paste all work; it previews what's
 * uploaded and offers replace / remove.
 */
export function Dropzone({
  endpoint,
  value,
  previewUrl,
  onChange,
  onBeforeUpload,
  onUploadingChange,
  uploader,
  shape = "square",
  label,
  description,
  icon,
  accept,
  removable,
  disabled,
  className,
  id,
}: DropzoneProps) {
  const autoId = useId();
  const inputId = id ?? `dropzone-${autoId}`;
  const input = useRef<HTMLInputElement>(null);
  const { upload, status, progress, error, reset } = useS3Upload(endpoint);
  const [dragging, setDragging] = useState(false);
  const [localPreview, setLocalPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const acceptStr = accept ?? ENDPOINT_ACCEPT[endpoint].accept;
  const hint = description ?? ENDPOINT_ACCEPT[endpoint].hint;
  const [customBusy, setCustomBusy] = useState(false);
  const busy = status === "uploading" || customBusy;
  // Custom uploaders don't report progress.
  const pct = customBusy ? "" : `${progress}%`;
  const canRemove = removable ?? Boolean(onChange);

  useEffect(() => onUploadingChange?.(busy), [busy, onUploadingChange]);
  useEffect(() => () => void (localPreview && URL.revokeObjectURL(localPreview.url)), [localPreview]);

  const start = useCallback(
    async (raw: File | undefined) => {
      if (!raw || disabled || busy) return;
      if (!fileMatchesAccept(raw, acceptStr)) {
        toast.error(`That file type isn't supported here (${hint}).`);
        return;
      }
      const file = onBeforeUpload ? await onBeforeUpload(raw) : raw;
      if (!file) return;
      setLocalPreview({ url: URL.createObjectURL(file), type: file.type, name: file.name });
      try {
        if (uploader) {
          setCustomBusy(true);
          const url = await uploader(file);
          onChange?.(url, { name: file.name, size: file.size, type: file.type });
        } else {
          const done = await upload(file);
          onChange?.(done.url, { name: done.name, size: done.size, type: done.type });
        }
      } catch (e) {
        setLocalPreview(null);
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setCustomBusy(false);
      }
    },
    [acceptStr, busy, disabled, hint, onBeforeUpload, onChange, upload, uploader],
  );

  const preview = previewUrl ?? localPreview?.url;
  const shown = preview
    ? { url: preview, type: (localPreview?.type ?? "image") as Kind, name: localPreview?.name ?? value?.split("/").pop() ?? "image" }
    : value
      ? { url: value, type: kindOf(value, endpoint, acceptStr), name: value.split("/").pop() ?? "file" }
      : null;
  const kind = shown ? kindOf(shown.type || shown.url, endpoint, acceptStr) : null;
  const open = () => !disabled && !busy && input.current?.click();

  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void start(e.dataTransfer.files[0]);
    },
    onPaste: (e: React.ClipboardEvent) => {
      const f = e.clipboardData.files[0];
      if (f) void start(f);
    },
  };

  const hiddenInput = (
    <input
      ref={input}
      id={inputId}
      type="file"
      accept={acceptStr || undefined}
      className="sr-only"
      tabIndex={-1}
      disabled={Boolean(disabled) || busy}
      onChange={(e) => {
        void start(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  const remove = () => {
    reset();
    setLocalPreview(null);
    onChange?.(undefined);
  };

  /* ── button ─────────────────────────────────────────────────────────── */
  if (shape === "button") {
    return (
      <div className={cn("inline-flex", className)} {...dropHandlers}>
        <button
          type="button"
          onClick={open}
          disabled={Boolean(disabled) || busy}
          className={cn(
            "relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-lg border bg-card px-4 font-hud text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60",
            dragging && "border-primary bg-primary/5",
            status === "error" && "border-destructive/50 text-destructive",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : status === "error" ? <AlertCircle className="size-4" /> : (icon ?? <UploadCloud className="size-4" />)}
          {busy ? `Uploading ${pct}` : status === "error" ? "Retry upload" : (label ?? (value ? "Replace file" : "Upload file"))}
          {busy && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width]" style={{ width: `${progress}%` }} />}
        </button>
        {hiddenInput}
      </div>
    );
  }

  /* ── compact row ────────────────────────────────────────────────────── */
  if (shape === "compact") {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={open}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
        aria-label={label ?? "Upload a file"}
        className={cn(
          "group relative flex items-center gap-3 overflow-hidden rounded-lg border border-dashed bg-card p-2.5 text-left transition-colors",
          !disabled && "cursor-pointer hover:border-line-bright hover:bg-surface-2",
          dragging && "border-primary bg-primary/5",
          disabled && "opacity-60",
          className,
        )}
        {...dropHandlers}
      >
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
          {shown && kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown.url} alt="" className="size-full object-cover" />
          ) : (
            <KindIcon kind={kind} fallback={icon} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {busy ? `Uploading… ${pct}` : shown ? shown.name : (label ?? "Drop a file or click to browse")}
          </span>
          <span className={cn("block truncate text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {status === "error" ? (error ?? "Upload failed — click to retry") : shown ? "Click or drop to replace" : hint}
          </span>
        </span>
        {shown && canRemove && !busy && (
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), remove())}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove file"
          >
            <X className="size-4" />
          </button>
        )}
        {busy && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width]" style={{ width: `${progress}%` }} />}
        {hiddenInput}
      </div>
    );
  }

  /* ── square / wide / circle ─────────────────────────────────────────── */
  const circle = shape === "circle";
  return (
    <div className={cn(circle ? "w-fit" : "w-full", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={open}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
        aria-label={label ?? "Upload a file"}
        className={cn(
          "group relative flex items-center justify-center overflow-hidden border-2 border-dashed bg-surface-2 text-center transition-colors",
          circle ? "size-28 rounded-full" : "w-full rounded-xl",
          shape === "square" && "aspect-square max-h-72",
          shape === "wide" && "aspect-[3/1] min-h-32",
          !disabled && "cursor-pointer hover:border-line-bright",
          dragging && "border-primary bg-primary/5",
          shown && "border-solid",
          status === "error" && "border-destructive/50",
          disabled && "opacity-60",
        )}
        {...dropHandlers}
      >
        {shown ? (
          <Preview key={shown.url} kind={kind!} url={shown.url} name={shown.name} />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 py-6">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon ?? (endpoint === "videoUploader" ? <Video className="size-5" /> : endpoint === "musicUploader" ? <Music className="size-5" /> : <ImagePlus className="size-5" />)}
            </span>
            {!circle && (
              <>
                <span className="font-hud text-sm font-semibold">{label ?? "Drop a file here"}</span>
                <span className="text-xs text-muted-foreground">
                  or <span className="font-medium text-primary">browse</span> · {hint}
                </span>
              </>
            )}
          </span>
        )}

        {/* Hover: replace hint */}
        {shown && !busy && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-md bg-card/95 px-2.5 py-1 font-hud text-xs font-semibold">
              <RefreshCw className="size-3.5" /> Replace
            </span>
          </span>
        )}

        {/* Uploading */}
        {busy && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/80 backdrop-blur-[2px]">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="font-hud text-xs font-semibold tabular-nums">{pct}</span>
            {!circle && (
              <span className="h-1 w-2/3 max-w-48 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </span>
            )}
          </span>
        )}
        {hiddenInput}
      </div>

      {/* Under the tile: error or remove */}
      {(status === "error" || (shown && canRemove && !busy)) && (
        <div className={cn("mt-2 flex items-center gap-2 text-xs", circle && "justify-center")}>
          {status === "error" ? (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3.5" /> {error ?? "Upload failed"} — try again
            </span>
          ) : (
            <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="size-3.5" /> Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Preview({ kind, url, name }: { kind: Kind; url: string; name: string }) {
  const [loadError, setLoadError] = useState(false);

  if (kind === "image" && !loadError)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="absolute inset-0 size-full object-cover" onError={() => setLoadError(true)} />;
  if (kind === "video") return <video src={url} className="absolute inset-0 size-full object-cover" muted playsInline />;
  return (
    <span className="flex flex-col items-center gap-2 px-4">
      <KindIcon kind={kind} />
      <span className="max-w-full truncate text-xs font-medium">{name}</span>
      {kind === "audio" && <audio src={url} controls className="h-8 max-w-full" onClick={(e) => e.stopPropagation()} />}
    </span>
  );
}

function KindIcon({ kind, fallback }: { kind: Kind | null; fallback?: ReactNode }) {
  if (!kind) return <>{fallback ?? <UploadCloud className="size-5 text-muted-foreground" />}</>;
  const I = kind === "video" ? Video : kind === "audio" ? Music : kind === "image" ? ImagePlus : FileIcon;
  return <I className="size-5 text-muted-foreground" />;
}
