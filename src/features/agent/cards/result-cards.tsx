"use client";

import { CalendarDays, Download, Hexagon, Megaphone, MapPinned, Pin as PinIcon, Users } from "lucide-react";
import Link from "next/link";

import type { AgentBlock, PinStatus } from "~/lib/agent/contract";
import { StatusPill, type Tone } from "~/ui/status-pill";

import { Card, MapRow, ShortList, day, dayTime, n, range } from "./card-kit";

type Of<K extends AgentBlock["kind"]> = Extract<AgentBlock, { kind: K }>;

export function PlacesCard({ block }: { block: Of<"places"> }) {
  const pinned = block.items.filter((i) => i.alreadyPinned).length;
  return (
    <Card icon={MapPinned} title={block.title} count={block.items.length}>
      {pinned > 0 && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">{pinned} already have one of your pins nearby.</p>}
      <ShortList
        items={block.items}
        empty="Nothing found here. Try other words or a wider area."
        render={(p) => (
          <MapRow key={p.key} id={p.key} lat={p.lat} lng={p.lng} aside={p.alreadyPinned ? <StatusPill tone="neutral">Pinned</StatusPill> : undefined}>
            <p className="truncate text-sm font-medium">{p.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {p.kind === "event" && p.startDate ? `${range(p.startDate, p.endDate ?? p.startDate)} · ` : ""}
              {p.address}
            </p>
          </MapRow>
        )}
      />
    </Card>
  );
}

const PIN_STATUS: Record<PinStatus, { tone: Tone; label: string }> = {
  active: { tone: "success", label: "Active" },
  upcoming: { tone: "info", label: "Upcoming" },
  expired: { tone: "neutral", label: "Expired" },
  in_review: { tone: "warning", label: "In review" },
  rejected: { tone: "danger", label: "Rejected" },
};

export function PinsCard({ block, linkable }: { block: Of<"pins">; linkable: boolean }) {
  return (
    <Card icon={PinIcon} title={block.title} count={block.items.length}>
      <ShortList
        items={block.items}
        empty="No pins match."
        render={(p) => (
          <MapRow key={p.id} id={p.id} lat={p.lat} lng={p.lng} aside={<StatusPill tone={PIN_STATUS[p.status].tone}>{PIN_STATUS[p.status].label}</StatusPill>}>
            {linkable ? (
              <Link href={`/pins/${p.id}/edit`} className="block truncate text-sm font-medium hover:underline">
                {p.title}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium">{p.title}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {p.type.toLowerCase()} · {n(p.collected)} collected · {range(p.startDate, p.endDate)}
            </p>
          </MapRow>
        )}
      />
    </Card>
  );
}

export function HotspotsCard({ block, linkable }: { block: Of<"hotspots">; linkable: boolean }) {
  return (
    <Card icon={Hexagon} title={block.title} count={block.items.length}>
      <ShortList
        items={block.items}
        empty="No hotspots match."
        render={(h) => (
          <MapRow key={h.id} id={h.id} aside={<StatusPill tone={h.isActive ? "success" : "neutral"}>{h.isActive ? "Active" : "Paused"}</StatusPill>}>
            {linkable ? (
              <Link href={`/pins?hotspot=${h.id}`} className="block truncate text-sm font-medium hover:underline">
                {h.title}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium">{h.title}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              Every {h.dropEveryDays}d · pins last {h.pinDurationDays}d · {h.drops} drops · {range(h.startDate, h.endDate)}
            </p>
          </MapRow>
        )}
      />
    </Card>
  );
}

export function EventsCard({ block, linkable }: { block: Of<"events">; linkable: boolean }) {
  return (
    <Card icon={CalendarDays} title={block.title} count={block.items.length}>
      <ShortList
        items={block.items}
        empty="No events."
        render={(e) => (
          <MapRow key={e.id} id={e.id} lat={e.lat} lng={e.lng} aside={<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{n(e.rsvps)} RSVPs</span>}>
            {linkable ? (
              <Link href={`/events/${e.id}/edit`} className="block truncate text-sm font-medium hover:underline">
                {e.title}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium">{e.title}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {dayTime(e.startDate)} · {e.venueName ?? e.address ?? "Online"}
            </p>
          </MapRow>
        )}
      />
    </Card>
  );
}

export function AnnouncementsCard({ block }: { block: Of<"announcements"> }) {
  return (
    <Card icon={Megaphone} title={block.title} count={block.items.length}>
      <ShortList
        items={block.items}
        empty="No announcements."
        render={(a) => (
          <li key={a.id} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</p>
              {a.pinned && <StatusPill tone="primary">Pinned</StatusPill>}
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
            <p className="mt-0.5 text-[11px] text-faint">
              {day(a.createdAt)} · {n(a.comments)} comments
            </p>
          </li>
        )}
      />
    </Card>
  );
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function CollectorsCard({ block }: { block: Of<"collectors"> }) {
  return (
    <Card
      icon={Users}
      title={block.title}
      count={block.total}
      actions={
        block.items.length > 0 && (
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Download as CSV"
            title="Download as CSV"
            onClick={() =>
              downloadCsv("collectors.csv", [
                ["Name", "Email", "Collections", "Redeemed", "Last collected"],
                ...block.items.map((c) => [c.name ?? "", c.email ?? "", c.collected, c.redeemed, c.lastAt]),
              ])
            }
          >
            <Download className="size-3.5" />
          </button>
        )
      }
    >
      <ShortList
        items={block.items}
        empty="Nobody has collected these pins yet."
        render={(c, i) => (
          <li key={`${c.email ?? c.name ?? ""}-${i}`} className="flex items-center gap-2 px-3 py-2">
            <span className="w-5 shrink-0 text-right font-hud text-xs text-faint tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name ?? "Unnamed fan"}</p>
              <p className="truncate text-xs text-muted-foreground">{c.email ?? "No email"}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums">{n(c.collected)}</p>
              <p className="text-[11px] text-faint tabular-nums">{c.redeemed} redeemed</p>
            </div>
          </li>
        )}
      />
    </Card>
  );
}

