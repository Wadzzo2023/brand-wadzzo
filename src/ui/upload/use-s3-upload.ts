"use client";

import axios from "axios";
import { useCallback, useRef, useState } from "react";

import type { EndPointType } from "~/server/s3";
import { api } from "~/utils/api";

import { uploadFileType } from "./accept";

export type UploadStatus = "idle" | "uploading" | "success" | "error";
export type UploadedFile = { url: string; name: string; size: number; type: string };

async function sha256(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The one S3 upload flow: ask the server for a signed URL, PUT the file to it
 * with progress, report the public URL. Every upload UI (dropzones, the
 * compat buttons) is built on this.
 */
export function useS3Upload(endpoint: EndPointType) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const signOne = api.s3.getSignedURL.useMutation();
  const signMany = api.s3.getSignedMultiURLs.useMutation();
  const abort = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abort.current?.abort();
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, []);

  const put = async (uploadUrl: string, file: File, onProgress: (loaded: number) => void) => {
    const res = await axios.put(uploadUrl, file, {
      headers: { "Content-Type": file.type },
      signal: abort.current?.signal,
      onUploadProgress: (e) => onProgress(e.loaded),
    });
    if (res.status !== 200) throw new Error(`Upload failed (${res.status})`);
  };

  /** Upload one file; resolves to its public URL. */
  const upload = useCallback(
    async (file: File): Promise<UploadedFile> => {
      abort.current = new AbortController();
      setStatus("uploading");
      setProgress(0);
      setError(null);
      try {
        const signed = await signOne.mutateAsync({
          fileSize: file.size,
          fileType: uploadFileType(file),
          checksum: await sha256(file),
          endPoint: endpoint,
          fileName: file.name,
        });
        await put(signed.uploadUrl, file, (loaded) => setProgress(Math.round((loaded * 100) / file.size)));
        setProgress(100);
        setStatus("success");
        return { url: signed.fileUrl, name: file.name, size: file.size, type: file.type };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed";
        setError(message);
        setStatus("error");
        throw e instanceof Error ? e : new Error(message);
      }
    },
    [endpoint, signOne],
  );

  /** Upload several files (one signing call); progress is over all bytes. */
  const uploadMany = useCallback(
    async (files: File[], onFileDone?: (f: UploadedFile) => void): Promise<UploadedFile[]> => {
      abort.current = new AbortController();
      setStatus("uploading");
      setProgress(0);
      setError(null);
      const total = files.reduce((n, f) => n + f.size, 0) || 1;
      let done = 0;
      try {
        const signed = await signMany.mutateAsync({
          files: await Promise.all(
            files.map(async (f) => ({
              fileSize: f.size,
              fileType: uploadFileType(f),
              checksum: await sha256(f),
              fileName: f.name,
              endPoint: endpoint,
            })),
          ),
          endPoint: endpoint,
        });
        const out: UploadedFile[] = [];
        for (const f of files) {
          const s = signed.find((x) => x.fileName === f.name);
          if (!s) continue;
          await put(s.uploadUrl, f, (loaded) => setProgress(Math.round(((done + loaded) * 100) / total)));
          done += f.size;
          const u = { url: s.fileUrl, name: f.name, size: f.size, type: f.type };
          out.push(u);
          onFileDone?.(u);
        }
        setProgress(100);
        setStatus("success");
        return out;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed";
        setError(message);
        setStatus("error");
        throw e instanceof Error ? e : new Error(message);
      }
    },
    [endpoint, signMany],
  );

  return { upload, uploadMany, status, progress, error, reset, busy: status === "uploading" };
}
