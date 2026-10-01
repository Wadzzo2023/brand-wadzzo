import type { EndPointType } from "~/server/s3";

/** What each S3 endpoint accepts: the `accept` string and a human hint. */
export const ENDPOINT_ACCEPT: Record<EndPointType, { accept: string; hint: string }> = {
  imageUploader: { accept: "image/jpeg,image/png,image/webp,image/gif", hint: "PNG, JPG, WEBP or GIF" },
  profileUploader: { accept: "image/jpeg,image/png,image/webp,image/gif", hint: "PNG, JPG, WEBP or GIF" },
  coverUploader: { accept: "image/jpeg,image/png,image/webp,image/gif", hint: "PNG, JPG, WEBP or GIF · wide images work best" },
  videoUploader: { accept: "video/mp4,video/webm", hint: "MP4 or WEBM" },
  musicUploader: {
    accept: "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/flac,audio/alac,audio/aiff,audio/wma,audio/m4a",
    hint: "MP3, WAV, OGG, AAC, FLAC or M4A",
  },
  modelUploader: { accept: ".obj,.glb", hint: "3D model: GLB or OBJ" },
  svgUploader: { accept: "image/svg+xml", hint: "SVG" },
  blobUploader: { accept: "", hint: "Any file" },
  multiBlobUploader: {
    accept: [
      "image/jpeg,image/png,image/webp,image/gif",
      "video/mp4,video/webm",
      "application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet",
      "text/plain,text/csv,text/tab-separated-values,application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
      "application/vnd.oasis.opendocument.spreadsheet",
    ].join(","),
    hint: "Images, videos, PDFs, documents and spreadsheets",
  },
};

/** The S3 content type for a file (3D models have no browser MIME type). */
export function uploadFileType(file: File) {
  if (file.name.toLowerCase().endsWith(".obj")) return ".obj";
  if (file.name.toLowerCase().endsWith(".glb")) return ".glb";
  return file.type;
}

/** Does `file` match an `accept` string (".ext", "type/*", "type/sub")? */
export function fileMatchesAccept(file: File, accept: string) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => (a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
