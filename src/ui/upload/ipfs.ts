import { ipfsHashToPinataGatewayUrl } from "~/utils/ipfs";

/** Pin a file to IPFS (token images live there); resolves to its hash. */
export async function uploadToIpfs(file: File) {
  const body = new FormData();
  body.append("file", file, file.name);
  const res = await fetch("/api/file", { method: "POST", body });
  if (!res.ok) throw new Error("Couldn't upload the image");
  return res.text();
}

/** Pin to IPFS and return the gateway URL (for Dropzone's `uploader`). */
export async function uploadToIpfsUrl(file: File) {
  return ipfsHashToPinataGatewayUrl(await uploadToIpfs(file));
}
