import type { NextApiRequest, NextApiResponse } from "next";

/**
 * CORS for the Pages-API routes the mobile/game clients call (replaces
 * `nextjs-cors`, which doesn't support Next 15+). Same behaviour: sets the
 * headers, and answers a preflight (OPTIONS) with 200 itself.
 *
 * Returns `true` when it has answered the request (preflight) — the caller
 * must then stop: `if (await applyCors(req, res)) return;`
 */
export async function applyCors(
  req: NextApiRequest,
  res: NextApiResponse,
  { origin, methods = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"] }: { origin: string; methods?: string[] },
): Promise<boolean> {
  res.setHeader("Access-Control-Allow-Origin", origin);
  if (origin !== "*") res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", methods.join(","));
    const requested = req.headers["access-control-request-headers"];
    if (requested) res.setHeader("Access-Control-Allow-Headers", requested);
    res.status(200).end();
    return true;
  }
  return false;
}

/** The game API's CORS policy (the Amplify-hosted game client). */
export function EnableCors(req: NextApiRequest, res: NextApiResponse) {
  return applyCors(req, res, { origin: "https://main.d3rraj3hpq09um.amplifyapp.com" });
}
