import {
  Award,
  Banknote,
  Gift,
  Heart,
  MapPin,
  MessageCircle,
  PackageCheck,
  ShoppingBag,
  Target,
  UserPlus,
  Wallet2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { InboxItem } from "~/server/notification-inbox";

type Meta = { item?: string; assetId?: number; qty?: number; amount?: number; currency?: string; tier?: string; pin?: string };

export type Described = { icon: LucideIcon; tone: "green" | "blue" | "gold" | "rose" | "slate"; text: ReactNode; href?: string };

const money = (m: Meta) => (m.amount != null ? `${m.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${m.currency ?? ""}`.trim() : null);
const b = (s: ReactNode) => <span className="font-semibold text-foreground">{s}</span>;

/** "Ana", "Ana and 1 other", "Ana and 4 others" (count is how many events were folded into the line). */
export function whoText(i: InboxItem) {
  const first = i.actors[0]?.name ?? "Someone";
  if (i.count <= 1) return first;
  const rest = i.count - 1;
  return `${first} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/** What a brand-inbox notification says, its icon, and where it leads in the brand portal. */
export function describeBrand(i: InboxItem): Described {
  const m = (i.meta ?? {}) as Meta;
  const who = b(whoText(i));
  const title = i.title ? <> “{i.title}”</> : null;
  switch (i.type) {
    case "ITEM_SOLD": {
      const qty = m.qty && m.qty > 1 && i.count === 1 ? `${m.qty}× ` : "";
      return { icon: ShoppingBag, tone: "green", text: <>{who} bought {qty}{b(m.item ?? "an item")}{money(m) && i.count === 1 ? ` for ${money(m)}` : ""}</>, href: m.assetId ? `/stores/${m.assetId}` : "/stores" };
    }
    case "ROYALTY_EARNED":
      return { icon: Banknote, tone: "gold", text: <>You earned {b(money(m) ?? "a royalty")} from {i.count > 1 ? `${i.count} resales` : "a resale"} of {b(m.item ?? "your item")}</>, href: m.assetId ? `/stores/${m.assetId}` : "/stores" };
    case "ITEM_SOLD_OUT":
      return { icon: PackageCheck, tone: "gold", text: <>{b(m.item ?? "An item")} is sold out</>, href: m.assetId ? `/stores/${m.assetId}` : "/stores" };
    case "FOLLOW":
      return { icon: UserPlus, tone: "blue", text: <>{who} followed your brand</>, href: undefined };
    case "SUBSCRIPTION":
      return { icon: Wallet2, tone: "blue", text: <>{who} joined {b(m.tier ?? "a membership tier")}</>, href: "/membership" };
    case "LIKE":
      return { icon: Heart, tone: "rose", text: <>{who} liked your post{title}</>, href: `/posts/${i.entityId}` };
    case "COMMENT":
      return { icon: MessageCircle, tone: "slate", text: <>{who} commented on{title ?? " your post"}</>, href: `/posts/${i.entityId}` };
    case "REPLY":
      return { icon: MessageCircle, tone: "slate", text: <>{who} replied to a comment on{title ?? " your post"}</>, href: `/posts/${i.entityId}` };
    case "BOUNTY_PARTICIPANT":
      return { icon: Target, tone: "green", text: <>{who} joined your bounty{title}</>, href: `/bounties/${i.entityId}` };
    case "BOUNTY_SUBMISSION":
      return { icon: Target, tone: "green", text: <>{who} submitted an entry to{title ?? " your bounty"}</>, href: `/bounties/${i.entityId}` };
    case "BOUNTY_COMMENT":
    case "BOUNTY_REPLY":
      return { icon: MessageCircle, tone: "slate", text: <>{who} {i.type === "BOUNTY_REPLY" ? "replied" : "commented"} on{title ?? " your bounty"}</>, href: `/bounties/${i.entityId}` };
    case "BOUNTY_DOUBT":
    case "BOUNTY_DOUBT_CREATE":
    case "BOUNTY_DOUBT_REPLY":
      return { icon: MessageCircle, tone: "gold", text: <>{who} asked a question on{title ?? " your bounty"}</>, href: `/bounties/${i.entityId}` };
    case "BOUNTY_WINNER":
      return { icon: Award, tone: "gold", text: <>Winner chosen{title ? <> for{title}</> : null}</>, href: `/bounties/${i.entityId}` };
    case "PIN_COLLECTED":
      return { icon: MapPin, tone: "green", text: <>{who} collected {b(m.pin ?? "one of your pins")}</>, href: "/pins/manage" };
    case "GIFT_CLAIMED":
      return { icon: Gift, tone: "green", text: <>{who} claimed your gift{money(m) ? ` of ${money(m)}` : ""}</>, href: "/gifts" };
    default:
      return { icon: Target, tone: "slate", text: <>New activity</> };
  }
}

export const TONE: Record<Described["tone"], string> = {
  green: "bg-primary/12 text-primary",
  blue: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  gold: "bg-amber-500/14 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  slate: "bg-foreground/8 text-muted-foreground",
};
