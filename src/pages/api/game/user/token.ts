import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { EnableCors } from "~/server/api-cors";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (await EnableCors(req, res)) return;
  try {
    const decodedData = await getToken({ req });
    if (decodedData?.sub) {
      const user = {
        ...decodedData,
        id: decodedData.sub,
        image: decodedData?.picture,
      };
      return res.status(200).json(user);
    } else {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ error: "An error occurred while processing your request" });
  }
}
