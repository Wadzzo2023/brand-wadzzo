"use client";

/**
 * Compatibility layer: the portal's original `UploadS3Button` /
 * `MultiUploadS3Button` API, now drawn by the shared drag-and-drop uploader
 * (`~/ui/upload`). New code should use `Dropzone` / `MultiDropzone` directly
 * and pick a `shape`.
 */
import { AlertCircle, Camera, Check, Loader2 } from "lucide-react";
import { useRef, type Ref } from "react";
import toast from "react-hot-toast";

import type { EndPointType } from "~/server/s3";
import { cn } from "~/lib/utils";
import { ENDPOINT_ACCEPT } from "~/ui/upload/accept";
import { Dropzone, type DropzoneShape } from "~/ui/upload/dropzone";
import { MultiDropzone } from "~/ui/upload/multi-dropzone";
import { useS3Upload } from "~/ui/upload/use-s3-upload";

type UploadProps = {
  id?: string;
  endpoint: EndPointType;
  onUploadProgress?: (p: number) => void;
  onClientUploadComplete?: (file: { url: string }) => void;
  onBeforeUploadBegin?: (file: File) => Promise<File> | File | undefined;
  onUploadError?: (error: Error) => void;
  disabled?: boolean;
  type?: "profile" | "cover";
  /** "button" (default) is now a drag-and-drop row; "input" a small icon button; "hidden" only the file input. */
  variant?: "button" | "input" | "hidden";
  /** Override the drop area's shape (default: a compact row). */
  shape?: DropzoneShape;
  className?: string;
  label?: string;
  showPreview?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function UploadS3Button(props: UploadProps) {
  const { variant = "button", endpoint, label, className, disabled, onBeforeUploadBegin, onClientUploadComplete, shape, type } = props;
  if (variant === "input" || variant === "hidden") return <IconUpload {...props} />;
  return (
    <Dropzone
      id={props.id}
      endpoint={endpoint}
      shape={shape ?? (type === "profile" ? "circle" : type === "cover" ? "wide" : "compact")}
      label={label}
      disabled={disabled}
      removable={false}
      className={className}
      onBeforeUpload={onBeforeUploadBegin}
      onChange={(url) => url && onClientUploadComplete?.({ url })}
    />
  );
}

/** Small icon button (tight toolbars) or an invisible input driven by a <label htmlFor>. */
function IconUpload({ id, endpoint, variant, className, disabled, onBeforeUploadBegin, onClientUploadComplete, onUploadError, onUploadProgress, label }: UploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, status, busy, progress } = useS3Upload(endpoint);
  if (onUploadProgress && busy) onUploadProgress(progress);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const file = onBeforeUploadBegin ? await onBeforeUploadBegin(f) : f;
    if (!file) return;
    try {
      const done = await upload(file);
      onClientUploadComplete?.({ url: done.url });
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Upload failed");
      onUploadError?.(err);
      toast.error(err.message);
    }
  };

  return (
    <>
      {variant === "input" && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={Boolean(disabled) || busy}
          aria-label={label ?? "Upload"}
          title={busy ? `Uploading ${progress}%` : (label ?? "Upload")}
          className={cn(
            "relative flex size-10 items-center justify-center overflow-hidden rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60",
            status === "error" && "border-destructive/50 text-destructive",
            className,
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : status === "success" ? <Check className="size-4 text-primary" /> : status === "error" ? <AlertCircle className="size-4" /> : <Camera className="size-4" />}
          {busy && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" style={{ width: `${progress}%` }} />}
        </button>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        accept={ENDPOINT_ACCEPT[endpoint].accept || undefined}
        className="sr-only"
        tabIndex={-1}
        disabled={Boolean(disabled) || busy}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function MultiUploadS3Button({
  endpoint = "multiBlobUploader",
  onBeforeUploadBegin,
  onClientUploadComplete,
  variant = "button",
  className,
  label,
  showFileList = true,
  maxFiles = 10,
}: {
  endpoint?: EndPointType;
  onUploadProgress?: (p: number) => void;
  onClientUploadComplete?: (files: { url: string; name: string; size: number; type: string }[]) => void;
  onBeforeUploadBegin?: (files: File[]) => Promise<File[]> | File[];
  onUploadError?: (error: Error) => void;
  variant?: "button" | "input";
  className?: string;
  label?: string;
  showFileList?: boolean;
  maxFiles?: number;
}) {
  return (
    <MultiDropzone
      endpoint={endpoint}
      variant={variant === "input" ? "icon" : "panel"}
      label={label}
      maxFiles={maxFiles}
      showList={showFileList}
      className={className}
      onBeforeUpload={onBeforeUploadBegin}
      onUploaded={onClientUploadComplete}
    />
  );
}
