"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Landmark,
  Loader2,
  MapPin,
  PartyPopper,
  RotateCcw,
  Search,
  ShieldCheck,
  Ticket,
  Users,
  XCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { LocationAddressDisplay } from "~/components/map/address-display";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs";
import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Skeleton } from "~/ui/skeleton";
import { Spinner } from "~/ui/spinner";
import { api, type RouterOutputs } from "~/utils/api";

type PinType = "LANDMARK" | "EVENT";
type Lookup = RouterOutputs["maps"]["pin"]["lookupRedeemCode"];
type Group = RouterOutputs["maps"]["pin"]["getLocationGroupsWithConsumers"]["items"][number];
type Redeemed = RouterOutputs["maps"]["pin"]["getRedeemedByCreator"]["items"][number];
type Tab = "rewards" | "history";

const CODE_LEN = 6;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Redeem: a fan shows the 6-character code they got when collecting a
 * landmark or event pin; the brand checks it and hands over the reward.
 * Below, each reward's progress and the redemption history.
 */
export default function RedeemView() {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname() ?? "";
  const tab: Tab = search?.get("tab") === "history" ? "history" : "rewards";
  const setTab = (t: string) =>
    router.replace(t === "rewards" ? pathname : `${pathname}?tab=${t}`, {
      scroll: false,
    });
  const summary = api.maps.pin.getRedeemSummary.useQuery();

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card border-foreground/10 rounded-[1.4rem] border-2 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Ticket className="text-primary size-5" />
            </div>
            <div>
              <p className="font-hud text-2xl font-bold tracking-tight">
                {summary.data ? (
                  summary.data.rewards.toLocaleString()
                ) : (
                  <span className="skeleton inline-block h-7 w-10 rounded-md align-middle" />
                )}
              </p>
              <p className="text-muted-foreground text-xs font-medium">Total rewards</p>
            </div>
          </div>
        </div>
        <div className="bg-card border-foreground/10 rounded-[1.4rem] border-2 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="bg-warning/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Users className="text-warning size-5" />
            </div>
            <div>
              <p className="font-hud text-warning text-2xl font-bold tracking-tight">
                {summary.data ? (
                  summary.data.waiting.toLocaleString()
                ) : (
                  <span className="skeleton inline-block h-7 w-10 rounded-md align-middle" />
                )}
              </p>
              <p className="text-muted-foreground text-xs font-medium">Waiting to redeem</p>
            </div>
          </div>
        </div>
        <div className="bg-card border-foreground/10 rounded-[1.4rem] border-2 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
              <CheckCircle2 className="text-primary size-5" />
            </div>
            <div>
              <p className="font-hud text-2xl font-bold tracking-tight">
                {summary.data ? (
                  summary.data.redeemed.toLocaleString()
                ) : (
                  <span className="skeleton inline-block h-7 w-10 rounded-md align-middle" />
                )}
              </p>
              <p className="text-muted-foreground text-xs font-medium">Total redeemed</p>
            </div>
          </div>
        </div>
      </div>
      <CodeChecker />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          {(
            [
              { id: "rewards", label: "Rewards", icon: Ticket },
              { id: "history", label: "History", icon: Clock },
            ] as const
          ).map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="rewards" className="mt-5">
          <RewardsTab />
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Check & redeem a code ────────────────────────────────────────────────

function CodeChecker() {
  const utils = api.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Lookup | null>(null);
  const [redeemedNow, setRedeemedNow] = useState<string | null>(null);

  const lookup = api.maps.pin.lookupRedeemCode.useMutation({
    onSuccess: setResult,
    onError: (e) => toast.error(e.message),
  });
  const redeem = api.maps.pin.redeemByCode.useMutation({
    onSuccess: (r) => {
      if (r.status === "success") {
        setRedeemedNow(r.redeemedAt);
        toast.success("Redeemed");
        void utils.maps.pin.getLocationGroupsWithConsumers.invalidate();
        void utils.maps.pin.getRedeemedByCreator.invalidate();
      } else if (r.status === "already_redeemed") {
        setResult({ ...r, status: "already_redeemed", claimedAt: null });
      } else {
        setResult({ status: "not_found" });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = () => {
    setCode("");
    setResult(null);
    setRedeemedNow(null);
    lookup.reset();
    redeem.reset();
    setTimeout(() => input.current?.focus(), 0);
  };
  const check = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.length !== CODE_LEN || lookup.isPending) return;
    setResult(null);
    setRedeemedNow(null);
    lookup.mutate({ code });
  };

  const found =
    result && (result.status === "pending" || result.status === "already_redeemed") ? result : null;

  return (
    <section className="bg-card border-foreground/10 grid gap-4 rounded-[1.4rem] border-2 p-4 sm:p-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      <form onSubmit={check} className="flex flex-col">
        <h2 className="font-hud flex items-center gap-2 text-lg font-semibold">
          <Ticket className="text-primary size-5" /> Redeem a code
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Ask the fan for the 6-character code from their collected pin.
        </p>
        <label htmlFor="redeem-code" className="sr-only">
          Redeem code
        </label>
        <Input
          ref={input}
          id="redeem-code"
          value={code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={CODE_LEN}
          placeholder="ABC123"
          onChange={(e) => {
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, CODE_LEN),
            );
            if (result) setResult(null);
          }}
          className="placeholder:text-faint mt-4 h-14 text-center font-mono text-2xl font-semibold tracking-[0.35em] placeholder:tracking-[0.35em]"
        />
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: CODE_LEN }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-5 rounded-full transition-colors",
                i < code.length ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
        <Button
          type="submit"
          className="mt-4"
          disabled={code.length !== CODE_LEN || lookup.isPending}
        >
          {lookup.isPending ? <Loader2 className="animate-spin" /> : <Search />} Check code
        </Button>
      </form>

      <div className="bg-muted/30 min-h-44 rounded-lg border border-dashed p-4" aria-live="polite">
        {redeemedNow && found ? (
          <ResultShell
            tone="success"
            icon={CheckCircle2}
            title="Redeemed — hand over the reward"
            onReset={reset}
            resetLabel="Redeem another"
          >
            <FanAndReward data={found} />
            <p className="text-muted-foreground mt-3 text-xs">
              Redeemed {format(new Date(redeemedNow), "PPp")}
            </p>
          </ResultShell>
        ) : result?.status === "not_found" ? (
          <ResultShell
            tone="error"
            icon={XCircle}
            title="Code not found"
            onReset={reset}
            resetLabel="Try again"
          >
            <p className="text-muted-foreground text-sm">
              Check the code with the fan — it&apos;s 6 letters and numbers, shown after they
              collect the pin.
            </p>
          </ResultShell>
        ) : result?.status === "wrong_location" ? (
          <ResultShell
            tone="warning"
            icon={AlertCircle}
            title="Code is for another pin"
            onReset={reset}
            resetLabel="Try again"
          >
            <p className="text-muted-foreground text-sm">
              This code belongs to {result.actualLocation.groupTitle ?? "another pin"}.
            </p>
          </ResultShell>
        ) : found?.status === "already_redeemed" ? (
          <ResultShell
            tone="warning"
            icon={AlertCircle}
            title="Already redeemed"
            onReset={reset}
            resetLabel="Check another"
          >
            <FanAndReward data={found} />
            {found.redeemedAt && (
              <p className="text-muted-foreground mt-3 text-xs">
                Redeemed {format(new Date(found.redeemedAt), "PPp")}
              </p>
            )}
          </ResultShell>
        ) : found ? (
          <div>
            <p className="text-primary flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5" /> Valid code — ready to redeem
            </p>
            <div className="mt-3">
              <FanAndReward data={found} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={redeem.isPending} onClick={() => redeem.mutate({ code })}>
                {redeem.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Redeem
              </Button>
              <Button variant="ghost" onClick={reset} disabled={redeem.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <Ticket className="text-faint size-7" />
            The fan and their reward show here, so you can check before redeeming.
          </div>
        )}
      </div>
    </section>
  );
}

function ResultShell({
  tone,
  icon: Icon,
  title,
  children,
  onReset,
  resetLabel,
}: {
  tone: "success" | "warning" | "error";
  icon: typeof CheckCircle2;
  title: string;
  children: React.ReactNode;
  onReset: () => void;
  resetLabel: string;
}) {
  const color =
    tone === "success" ? "text-primary" : tone === "warning" ? "text-warning" : "text-destructive";
  return (
    <div>
      <p className={cn("flex items-center gap-2 font-semibold", color)}>
        <Icon className="size-5" /> {title}
      </p>
      <div className="mt-3">{children}</div>
      <Button variant="outline" size="sm" className="mt-4" onClick={onReset}>
        <RotateCcw /> {resetLabel}
      </Button>
    </div>
  );
}

function FanAndReward({
  data,
}: {
  data: Extract<Lookup, { status: "pending" | "already_redeemed" }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Person
        user={data.user}
        sub={
          data.claimedAt
            ? `Collected ${formatDistanceToNow(new Date(data.claimedAt), { addSuffix: true })}`
            : undefined
        }
      />
      <div className="bg-card flex items-start gap-3 rounded-lg border p-3">
        {data.location?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.location.image}
            alt=""
            className="size-10 shrink-0 rounded-md object-cover"
          />
        ) : (
          <TypeIcon type={data.location?.type} />
        )}
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{data.location?.title ?? "Pin"}</p>
          <div className="text-muted-foreground text-xs">
            <LocationAddressDisplay
              latitude={data.locationData.latitude}
              longitude={data.locationData.longitude}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Person({
  user,
  sub,
}: {
  user: { name: string | null; image: string | null; email: string | null };
  sub?: string;
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="size-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full font-semibold">
          {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">{user.name ?? "Fan"}</p>
        {user.email && <p className="text-muted-foreground truncate text-xs">{user.email}</p>}
        {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
      </div>
    </div>
  );
}

function TypeIcon({ type, className }: { type?: string | null; className?: string }) {
  const Icon = type === "EVENT" ? PartyPopper : Landmark;
  return (
    <span
      className={cn(
        "bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-md",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────

function Filters({
  search,
  onSearch,
  type,
  onType,
  placeholder,
  total,
}: {
  search: string;
  onSearch: (v: string) => void;
  type: PinType | undefined;
  onType: (t: PinType | undefined) => void;
  placeholder: string;
  total?: number;
}) {
  const chip = (value: PinType | undefined, label: string, Icon?: typeof Landmark) => (
    <button
      type="button"
      role="radio"
      aria-checked={type === value}
      onClick={() => onType(value)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        type === value
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-3.5" />} {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          aria-label="Search"
        />
      </div>
      <div role="radiogroup" aria-label="Pin type" className="flex items-center gap-1.5">
        {chip(undefined, "All")}
        {chip("LANDMARK", "Landmarks", Landmark)}
        {chip("EVENT", "Events", PartyPopper)}
        {total !== undefined && (
          <span className="text-muted-foreground ml-2 text-xs whitespace-nowrap">
            {plural(total, "result")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Rewards: each landmark/event group and who collected it ──────────────

function RewardsTab() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<PinType | undefined>();
  const debounced = useDebounce(search.trim(), 300);
  const list = api.maps.pin.getLocationGroupsWithConsumers.useInfiniteQuery(
    { search: debounced || undefined, type, limit: 10 },
    {
      getNextPageParam: (l) => l.nextCursor,
      placeholderData: keepPreviousData,
    },
  );
  const groups = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <Filters
        search={search}
        onSearch={setSearch}
        type={type}
        onType={setType}
        placeholder="Search rewards by title"
        total={list.data?.pages[0]?.total}
      />
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : !groups.length ? (
        <EmptyState
          icon={Ticket}
          title={debounced ? "No matches" : "No rewards yet"}
          description={
            debounced
              ? `Nothing called “${debounced}”.`
              : "Landmark and event pins give fans a code to redeem with you. Drop one to get started."
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {groups.map((g) => (
              <RewardRow key={g.id} group={g} />
            ))}
          </ul>
          <LoadMore query={list} />
        </>
      )}
    </div>
  );
}

function RewardRow({ group: g }: { group: Group }) {
  const [open, setOpen] = useState(false);
  const fans = g.locations
    .flatMap((l) => l.consumers)
    .sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));
  const waiting = g.totalConsumers - g.totalRedeemed;
  const pct = g.totalConsumers ? Math.round((g.totalRedeemed / g.totalConsumers) * 100) : 0;

  return (
    <li className="bg-card border-foreground/10 overflow-hidden rounded-[1.4rem] border-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left sm:p-4"
      >
        {g.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.image} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <TypeIcon type={g.type} className="size-12 rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-medium">{g.title}</span>
            <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {g.type === "EVENT" ? "Event" : "Landmark"}
            </span>
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            <div
              className="bg-muted h-1.5 max-w-48 flex-1 overflow-hidden rounded-full"
              aria-hidden
            >
              <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {g.totalRedeemed}/{g.totalConsumers} redeemed
            </span>
          </div>
        </div>
        <div className="hidden shrink-0 gap-4 text-right sm:flex">
          <Stat label="Collected" value={g.totalConsumers} />
          <Stat label="Waiting" value={waiting} highlight={waiting > 0} />
          <Stat label="Limit" value={g.limit} />
        </div>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="bg-muted/30 border-t p-3 sm:p-4">
          <p className="text-muted-foreground mb-2 text-xs">
            {fmtRange(g.startDate, g.endDate)} · {plural(g.locations.length, "pin")} ·{" "}
            {plural(fans.length, "fan")} collected
          </p>
          {fans.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nobody has collected this yet.
            </p>
          ) : (
            <ul className="bg-card divide-y rounded-lg border">
              {fans.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {c.user.name ?? c.user.email ?? "Fan"}
                    </span>
                    {c.claimedAt && (
                      <span className="text-muted-foreground text-xs">
                        Collected{" "}
                        {formatDistanceToNow(new Date(c.claimedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </span>
                  {c.isRedeemed ? (
                    <span className="bg-primary/10 text-primary flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      <CheckCircle2 className="size-3" /> Redeemed
                    </span>
                  ) : (
                    <span className="bg-warning/10 text-warning shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      Waiting
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className={cn("font-hud text-lg font-semibold tabular-nums", highlight && "text-warning")}>
        {value.toLocaleString()}
      </p>
      <p className="text-muted-foreground text-[11px]">{label}</p>
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<PinType | undefined>();
  const debounced = useDebounce(search.trim(), 300);
  const list = api.maps.pin.getRedeemedByCreator.useInfiniteQuery(
    { search: debounced || undefined, type, limit: 20 },
    {
      getNextPageParam: (l) => l.nextCursor,
      placeholderData: keepPreviousData,
    },
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <Filters
        search={search}
        onSearch={setSearch}
        type={type}
        onType={setType}
        placeholder="Search by fan, email, code or reward"
        total={list.data?.pages[0]?.total}
      />
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : !items.length ? (
        <EmptyState
          icon={Users}
          title={debounced ? "No matches" : "No redemptions yet"}
          description={debounced ? "Try another search." : "Codes you redeem show up here."}
        />
      ) : (
        <>
          <ul className="bg-card border-foreground/10 divide-y overflow-hidden rounded-[1.4rem] border-2">
            {items.map((i) => (
              <HistoryRow key={i.id} item={i} />
            ))}
          </ul>
          <LoadMore query={list} />
        </>
      )}
    </div>
  );
}

function HistoryRow({ item: i }: { item: Redeemed }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2.5 text-left sm:px-4"
      >
        {i.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.user.image} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {(i.user.name ?? i.user.email ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {i.user.name ?? i.user.email ?? "Fan"}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {i.location?.title ?? "Pin"}
          </span>
        </span>
        <span className="text-muted-foreground hidden font-mono text-xs tracking-widest sm:block">
          {i.redeemCode}
        </span>
        <span className="text-muted-foreground shrink-0 text-right text-xs">
          {i.redeemedAt ? format(new Date(i.redeemedAt), "MMM d, HH:mm") : "—"}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <dl className="bg-muted/30 grid gap-3 border-t px-4 py-3 text-sm sm:grid-cols-4">
          <Info label="Code">
            <span className="font-mono tracking-widest">{i.redeemCode}</span>
          </Info>
          <Info label="Email">{i.user.email ?? "—"}</Info>
          <Info label="Collected">{i.claimedAt ? format(new Date(i.claimedAt), "PPp") : "—"}</Info>
          <Info label="Redeemed">{i.redeemedAt ? format(new Date(i.redeemedAt), "PPp") : "—"}</Info>
          <div className="sm:col-span-4">
            <dt className="text-muted-foreground text-xs">Pin</dt>
            <dd className="flex items-center gap-1.5">
              <MapPin className="text-muted-foreground size-3.5 shrink-0" />
              <LocationAddressDisplay
                latitude={i.locationData.latitude}
                longitude={i.locationData.longitude}
              />
            </dd>
          </div>
        </dl>
      )}
    </li>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function fmtRange(start: Date | string, end: Date | string) {
  return `${format(new Date(start), "MMM d")} – ${format(new Date(end), "MMM d, yyyy")}`;
}

function LoadMore({
  query,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
}) {
  if (!query.hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <Button
        variant="outline"
        onClick={() => void query.fetchNextPage()}
        disabled={query.isFetchingNextPage}
      >
        {query.isFetchingNextPage && <Spinner className="size-4" />}
        {query.isFetchingNextPage ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[76px] rounded-xl" />
      ))}
    </div>
  );
}

function useDebounce<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
