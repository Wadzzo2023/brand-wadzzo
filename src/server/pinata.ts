import type { Readable } from "stream";

export interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface PinataClient {
  pinFileToIPFS(
    stream: Readable,
    options: { pinataMetadata: { name: string } },
  ): Promise<PinataResponse>;
  pinList(filters: { pageLimit: number }): Promise<{ rows: unknown[] }>;
}

/**
 * The Pinata (IPFS) client, loaded only when a file is actually uploaded.
 *
 * @pinata/sdk bundles an old core-js that adds `toJSON` to Map and Set for the whole server.
 * Next sends its router data with Maps, so React then serialised them wrongly ("Only plain
 * objects can be passed to Client Components… Map objects are not supported") and page
 * navigation in the brand portal stopped working. Loading it lazily keeps it out of every
 * page render, and the patch is removed right after loading.
 */
export async function pinataClient(jwt: string): Promise<PinataClient> {
  const { default: Pinata } = await import("@pinata/sdk");
  for (const proto of [Map.prototype, Set.prototype]) {
    delete (proto as { toJSON?: unknown }).toJSON;
  }
  return new Pinata({ pinataJWTKey: jwt });
}
