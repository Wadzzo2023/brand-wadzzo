import PinataClient from "@pinata/sdk";
import formidable from "formidable";
import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";

import { env } from "~/env";

const pinata = new PinataClient({ pinataJWTKey: env.PINATA_JWT });

export const config = {
  api: {
    bodyParser: false,
  },
};

export interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

async function saveFile(file: formidable.File): Promise<PinataResponse> {
  const stream = fs.createReadStream(file.filepath);
  const response = await pinata.pinFileToIPFS(stream, { pinataMetadata: { name: file.originalFilename ?? "upload" } });
  fs.unlinkSync(file.filepath);
  return response;
}

function parse(req: NextApiRequest) {
  return new Promise<formidable.Files>((resolve, reject) => {
    new formidable.IncomingForm().parse(req, (err, _fields, files) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve(files)));
  });
}

/** POST: upload one file to IPFS (Pinata) and return its hash. GET: the latest pin. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const files = await parse(req);
      const file = files.file as unknown as formidable.File;
      const { IpfsHash } = await saveFile(file);
      return res.send(IpfsHash);
    } catch (e) {
      console.error("[api/file] upload failed", e);
      return res.status(500).send("Upload Error");
    }
  }
  if (req.method === "GET") {
    try {
      const response = await pinata.pinList({ pageLimit: 1 });
      return res.json(response.rows[0]);
    } catch (e) {
      console.error("[api/file] list failed", e);
      return res.status(500).send("Server Error");
    }
  }
  return res.status(405).end();
}
