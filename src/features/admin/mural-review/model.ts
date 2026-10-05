import type { MuralStatus } from "@prisma/client";

import type { RouterOutputs } from "~/utils/api";

export type MuralRow = RouterOutputs["admin"]["murals"]["list"]["murals"][number];
export type MuralDetail = RouterOutputs["admin"]["murals"]["byId"];

/** Tabs on Admin › Mural review. `settings` isn't a status. */
export type View = "pending" | "gathering" | "approved" | "rejected" | "insights" | "settings";

export const VIEW_STATUS: Record<Exclude<View, "settings" | "insights">, MuralStatus> = {
  pending: "PENDING",
  gathering: "DISCOVERED",
  approved: "APPROVED",
  rejected: "REJECTED",
};

export const REJECT_LABEL = {
  NOT_A_MURAL: "Not a mural",
  FRAUD: "Fraud / spam",
} as const;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
