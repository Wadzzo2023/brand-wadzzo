import { applyCors } from "~/server/api-cors";
// nextjs 14 api routes

import { Asset } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { db } from "~/server/db";
import { getCurrentPlatform } from "~/server/platform";
import { ipfsHashToUrl } from "~/utils/ipfs";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (await applyCors(req, res, { origin: "*" })) return;

  let FullTomlContent = documentationToml();

  // Only this deployment's own assets: each platform's toml lives on its own home domain.
  const { id: platformId } = await getCurrentPlatform();
  const assets = await db.asset.findMany({
    where: { platformId },
    select: {
      issuer: true,
      code: true,
      name: true,
      description: true,
      thumbnail: true,
      limit: true,
    },
  });

  const PageAssets = await db.creatorPageAsset.findMany({
    where: { creator: { platformId } },
    select: {
      issuer: true,
      code: true,
      thumbnail: true,
      limit: true,
      creator: true,
    },
  });

  for (const asset of assets) {
    FullTomlContent += dictionaryToTomlString(asset);
  }

  for (const asset of PageAssets) {
    const ipfsHash = asset.thumbnail?.split("/").pop();
    FullTomlContent += dictionaryToTomlString({
      code: asset.code,
      issuer: asset.issuer,
      name: asset.creator?.name || PLATFORM_ASSET.code,
      description: `Page Asset of ${asset.creator?.name}`,
      thumbnail: asset.thumbnail ?? "",
    });
  }

  res.send(FullTomlContent);

  return;

  // res.status(200).json({ message: assets });
}

export function dictionaryToTomlString(dict: {
  thumbnail: string;
  code: string;
  issuer: string;
  name: string;
  description: string | null;
}) {
  const ipfsHash = dict.thumbnail.split("/").pop();
  let tomlString = "[[CURRENCIES]]\n";
  tomlString += `code="${dict.code}"\n`;
  tomlString += `issuer="${dict.issuer}"\n`;
  tomlString += `display_decimals=7\n`;
  tomlString += `name="${dict.name}"\n`;
  tomlString += `desc="${dict.description}"\n`;
  if (ipfsHash) tomlString += `image="${ipfsHashToUrl(ipfsHash)}"\n`;

  return tomlString + "\n";
}

/**
 * The organisation behind this deployment's assets. Partner platforms set the
 * TOML_ORG_* env vars (and optionally TOML_PRINCIPAL_*); unset, it's Wadzzo.
 */
function documentationToml() {
  const e = process.env;
  const partner = Boolean(e.TOML_ORG_NAME);
  // A partner's unset fields are left out rather than showing Wadzzo's.
  const field = (key: string, value: string | undefined, wadzzo: string) => {
    const v = value ?? (partner ? undefined : wadzzo);
    return v ? [`${key}="${v}"`] : [];
  };
  const lines = [
    "[DOCUMENTATION]",
    ...field("ORG_NAME", e.TOML_ORG_NAME, "Wadzzo"),
    ...field("ORG_URL", e.TOML_ORG_URL, "https://wadzzo.com/"),
    ...field("ORG_LOGO", e.TOML_ORG_LOGO, "https://raw.githubusercontent.com/Bandcoin2023/assets/refs/heads/main/public/wadzzo.webp"),
    ...field("ORG_DESCRIPTION", e.TOML_ORG_DESCRIPTION, "Wadzzo: Explore, Collect, Win"),
    ...field("ORG_TWITTER", e.TOML_ORG_TWITTER, "WadzzoApp"),
    ...field("ORG_OFFICIAL_EMAIL", e.TOML_ORG_OFFICIAL_EMAIL, "support@wadzzo.com"),
    "",
  ];
  // Wadzzo's principal only describes Wadzzo's own toml.
  if (e.TOML_PRINCIPAL_NAME) {
    lines.push("[[PRINCIPALS]]", `name="${e.TOML_PRINCIPAL_NAME}"`);
    if (e.TOML_PRINCIPAL_EMAIL) lines.push(`email="${e.TOML_PRINCIPAL_EMAIL}"`);
    lines.push("");
  } else if (!partner) {
    lines.push("[[PRINCIPALS]]", `name="Arnob Dey"`, `twitter="ArnobDey_Dev"`, `github="arnob016"`, "");
  }
  return lines.join("\n") + "\n";
}
