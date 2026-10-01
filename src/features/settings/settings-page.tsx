"use client";

import { format, formatDistanceToNow } from "date-fns";
import { Camera, Coins, Crown, Copy, ExternalLink, FileText, Link2, Loader2, MapPin, Package, Pencil, Target, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { Badge } from "~/components/shadcn/ui/badge";
import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";
import { Input } from "~/components/shadcn/ui/input";
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { usePortalAccess } from "~/components/shell/use-portal-access";
import { htmlToText } from "~/ui/ai/shared";
import { AiTextButton } from "~/ui/ai/ai-text";
import { BountyCard } from "~/features/bounties/bounties-page";
import { MembershipTiers } from "~/features/membership/membership-page";
import { AssetCard } from "~/features/stores/stores-page";
import { WADZZO_AR_URL } from "~/lib/embed";
import { sortOptionEnum } from "~/types/bounty/bounty-type";
import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Field } from "~/ui/form-page";
import { PageBody } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { ENDPOINT_ACCEPT } from "~/ui/upload/accept";
import { useS3Upload } from "~/ui/upload/use-s3-upload";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

import { PageAssetTab } from "./page-asset-tab";
import { VANITY_HOST, VanityUrlTab } from "./vanity-url-tab";

type Overview = NonNullable<RouterOutputs["fan"]["creator"]["profileOverview"]>;
type Tab = "pins" | "posts" | "bounties" | "store" | "page-asset" | "membership" | "vanity";
const BIO_MAX = 100;

/**
 * Settings, as the brand's own profile: cover and picture on top, name, bio,
 * stats and page asset, then tabs with a preview of what the brand has made
 * and its vanity URL.
 */
export default function SettingsPage() {
  const overview = api.fan.creator.profileOverview.useQuery();

  if (overview.isPending) return <ProfileSkeleton />;
  if (overview.isError)
    return (
      <PageBody className="max-w-none">
        <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />
      </PageBody>
    );
  if (!overview.data)
    return (
      <PageBody className="max-w-none">
        <EmptyState
          icon={UserRound}
          title="No brand yet"
          description="Set up your brand to get a profile, drop pins and sell to fans."
          action={
            <Button asChild>
              <Link href="/onboarding">Set up your brand</Link>
            </Button>
          }
        />
      </PageBody>
    );
  return <Profile data={overview.data} />;
}

function Profile({ data }: { data: Overview }) {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname() ?? "";
  const { navPermission } = usePortalAccess();

  const tabs: { id: Tab; label: string; icon: typeof MapPin; count?: number; gated?: boolean }[] = [
    { id: "pins", label: "Pins", icon: MapPin, count: data.counts.pins },
    { id: "posts", label: "Posts", icon: FileText, count: data.counts.posts, gated: true },
    { id: "bounties", label: "Bounties", icon: Target, count: data.counts.bounties, gated: true },
    { id: "store", label: "Store items", icon: Package, count: data.counts.storeItems, gated: true },
    { id: "page-asset", label: "Page asset", icon: Coins },
    { id: "membership", label: "Membership", icon: Crown, gated: true },
    { id: "vanity", label: "Vanity URL", icon: Link2 },
  ];
  const visible = tabs.filter((t) => !t.gated || navPermission);
  const param = search?.get("tab") as Tab | null;
  const tab: Tab = param && visible.some((t) => t.id === param) ? param : "pins";
  const setTab = (t: string) => router.replace(t === "pins" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const fanPage = `${WADZZO_AR_URL}/brands/${data.id}`;
  const copy = (text: string) =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy the link"),
    );
  const [editing, setEditing] = useState(false);
  const vanityActive = Boolean(data.vanityURL && data.vanitySubscription && new Date(data.vanitySubscription.endDate) >= new Date());

  return (
    <PageBody className="max-w-none">
      <ProfileHeader data={data} />

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 sm:mt-4 sm:pl-44">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-hud text-2xl font-semibold sm:text-3xl">{data.name}</h1>
            <StatusBadge approved={data.approved} />
          </div>
          {data.bio ? (
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{data.bio}</p>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="mt-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
              Add a bio
            </button>
          )}
          <p className="mt-1 text-xs text-faint">Joined {format(new Date(data.joinedAt), "MMMM yyyy")}</p>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit profile
        </Button>
      </div>

      {/* Stats */}
      <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
        <Stat label="Followers" value={data.counts.followers} icon={Users} />
        <Stat label="Pins" value={data.counts.pins} icon={MapPin} onClick={() => setTab("pins")} />
        <Stat label="Hotspots" value={data.counts.hotspots} icon={MapPin} href="/pins/manage" />
        {navPermission && <Stat label="Posts" value={data.counts.posts} icon={FileText} onClick={() => setTab("posts")} />}
        {navPermission && <Stat label="Bounties" value={data.counts.bounties} icon={Target} onClick={() => setTab("bounties")} />}
        {navPermission && <Stat label="Store items" value={data.counts.storeItems} icon={Package} onClick={() => setTab("store")} />}
      </dl>

      {/* Page asset + links */}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          {data.pageAsset?.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.pageAsset.thumbnail} alt="" className="size-10 rounded-lg object-cover" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coins className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-hud text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Page asset</p>
            {data.pageAsset?.pending ? (
              <p className="truncate text-sm">
                <b className="font-mono">{data.pageAsset.code}</b> <span className="text-xs text-warning">waiting to be issued</span>
              </p>
            ) : data.pageAsset ? (
              <p className="truncate text-sm">
                <b className="font-mono">{data.pageAsset.code}</b>{" "}
                <span className="font-mono text-xs text-muted-foreground" title={data.pageAsset.issuer}>
                  {addrShort(data.pageAsset.issuer, 5)}
                </span>
                {data.pageAsset.custom && <span className="ml-1 text-xs text-muted-foreground">(custom)</span>}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not set up</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setTab(data.pageAsset ? (navPermission ? "membership" : "page-asset") : "page-asset")}>
            {data.pageAsset ? (navPermission ? "Membership" : "Manage") : "Set up"}
          </Button>
        </div>

        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Link2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-hud text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your page</p>
            <p className="truncate text-sm">{vanityActive ? `${VANITY_HOST}/${data.vanityURL}` : fanPage.replace(/^https?:\/\//, "")}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Copy link" onClick={() => copy(vanityActive ? `https://${VANITY_HOST}/${data.vanityURL}` : fanPage)}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={fanPage} target="_blank" rel="noreferrer" aria-label="Open your page">
              <ExternalLink />
            </a>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList variant="line">
          {visible.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              <t.icon /> {t.label}
              {t.count !== undefined && <TabCount n={t.count} />}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="pins" className="mt-5">
          <PinsTab pins={data.recentPins} total={data.counts.pins} />
        </TabsContent>
        {navPermission && (
          <>
            <TabsContent value="posts" className="mt-5">
              <PostsTab creatorId={data.id} total={data.counts.posts} />
            </TabsContent>
            <TabsContent value="bounties" className="mt-5">
              <BountiesTab total={data.counts.bounties} />
            </TabsContent>
            <TabsContent value="store" className="mt-5">
              <StoreTab total={data.counts.storeItems} />
            </TabsContent>
          </>
        )}
        <TabsContent value="page-asset" className="mt-5">
          <PageAssetTab pageAsset={data.pageAsset} onMembership={navPermission ? () => setTab("membership") : undefined} />
        </TabsContent>
        {navPermission && (
          <TabsContent value="membership" className="mt-5">
            <MembershipTiers onSetUpPageAsset={() => setTab("page-asset")} />
          </TabsContent>
        )}
        <TabsContent value="vanity" className="mt-5">
          <VanityUrlTab key={data.vanityURL ?? ""} vanityURL={data.vanityURL} subscription={data.vanitySubscription} />
        </TabsContent>
      </Tabs>

      {editing && <EditProfileDialog data={data} onClose={() => setEditing(false)} />}
    </PageBody>
  );
}

// ── Header: cover + picture, each with its own "change" button ─────────────

function ProfileHeader({ data }: { data: Overview }) {
  const utils = api.useUtils();
  const refresh = () => {
    void utils.fan.creator.profileOverview.invalidate();
    void utils.fan.creator.meCreator.invalidate();
  };
  const setCover = api.fan.creator.changeCreatorCoverPicture.useMutation({
    onSuccess: () => (toast.success("Cover updated"), refresh()),
    onError: (e) => toast.error(e.message),
  });
  const setAvatar = api.fan.creator.changeCreatorProfilePicture.useMutation({
    onSuccess: () => (toast.success("Profile picture updated"), refresh()),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="relative">
      <div className="relative aspect-[851/315] max-h-72 w-full overflow-hidden rounded-xl border bg-gradient-to-br from-primary/25 via-surface-2 to-primary/5">
        {data.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.coverUrl} alt="" className="size-full object-cover" />
        )}
        <ImagePicker
          endpoint="coverUploader"
          saving={setCover.isPending}
          onUploaded={(url) => setCover.mutate(url)}
          className="absolute bottom-3 right-3"
          label={data.coverUrl ? "Change cover" : "Add cover"}
        />
      </div>
      <div className="absolute -bottom-10 left-4 sm:-bottom-14 sm:left-6">
        <div className="relative">
          {data.profileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.profileUrl} alt="" className="size-24 rounded-full border-4 border-background bg-card object-cover sm:size-32" />
          ) : (
            <span className="flex size-24 items-center justify-center rounded-full border-4 border-background bg-primary/15 font-hud text-4xl font-semibold text-primary sm:size-32">
              {data.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <ImagePicker
            endpoint="profileUploader"
            saving={setAvatar.isPending}
            onUploaded={(url) => setAvatar.mutate(url)}
            className="absolute bottom-1 right-1"
            label="Change profile picture"
            iconOnly
          />
        </div>
      </div>
      <div className="h-10 sm:hidden" />
    </div>
  );
}

function ImagePicker({
  endpoint,
  saving,
  onUploaded,
  label,
  iconOnly,
  className,
}: {
  endpoint: "coverUploader" | "profileUploader";
  saving: boolean;
  onUploaded: (url: string) => void;
  label: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const s3 = useS3Upload(endpoint);
  const busy = s3.busy || saving;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image");
    try {
      const { url } = await s3.upload(file);
      onUploaded(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input ref={input} type="file" accept={ENDPOINT_ACCEPT[endpoint].accept} className="sr-only" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} />
      <Button
        type="button"
        size={iconOnly ? "icon-sm" : "sm"}
        variant="secondary"
        disabled={busy}
        onClick={() => input.current?.click()}
        aria-label={label}
        className={cn("shadow-md", iconOnly && "rounded-full", className)}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        {!iconOnly && (s3.busy ? `Uploading ${s3.progress}%` : saving ? "Saving…" : label)}
      </Button>
    </>
  );
}

function EditProfileDialog({ data, onClose }: { data: Overview; onClose: () => void }) {
  const utils = api.useUtils();
  const [name, setName] = useState(data.name);
  const [bio, setBio] = useState(data.bio ?? "");
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({});
  const save = api.fan.creator.updateCreatorProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile saved");
      void utils.fan.creator.profileOverview.invalidate();
      void utils.fan.creator.meCreator.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const next: typeof errors = {};
    if (n.length < 3 || n.length > 98) next.name = "3–98 characters";
    if (bio.length > BIO_MAX) next.bio = `Up to ${BIO_MAX} characters`;
    setErrors(next);
    if (!Object.keys(next).length) save.mutate({ name: n, description: bio.trim() || null });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle className="font-hud">Edit profile</DialogTitle>
            <DialogDescription>Fans see this on your page and on your pins.</DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-4">
            <Field label="Brand name" htmlFor="brand-name" required error={errors.name}>
              <Input id="brand-name" value={name} maxLength={98} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
            </Field>
            <Field
              label="Bio"
              htmlFor="brand-bio"
              error={errors.bio}
              hint={<span className={cn("tabular-nums", bio.length > BIO_MAX && "text-destructive")}>{bio.length}/{BIO_MAX}</span>}
              action={<AiTextButton form="post" field="brand bio" value={bio} onChange={setBio} maxChars={BIO_MAX} context={{ brand: name }} />}
            >
              <Textarea id="brand-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="One line about your brand" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Tabs: a preview of each section, managed on its own page ───────────────

function TabFooter({ shown, total, href, label }: { shown: number; total: number; href: string; label: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        {total > shown ? `Showing ${shown} of ${total}` : `${total} in total`}
      </span>
      <Button variant="outline" size="sm" asChild>
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}

function PinsTab({ pins, total }: { pins: Overview["recentPins"]; total: number }) {
  const [now] = useState(() => Date.now());
  if (!pins.length)
    return (
      <EmptyState
        icon={MapPin}
        title="No pins yet"
        description="Drop your first pin on the map for fans to collect."
        action={
          <Button asChild>
            <Link href="/pins/new">New pin</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {pins.map((p) => {
          const ended = new Date(p.endDate).getTime() < now;
          const status = p.approved === false ? "Rejected" : p.approved == null ? "In review" : ended ? "Ended" : "Live";
          const href = p.locations[0] ? `/pins/${p.locations[0].id}/edit` : "/pins/manage";
          return (
            <li key={p.id}>
              <Link href={href} className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary">
                <div className="relative aspect-[4/3] bg-surface-2">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-faint">
                      <MapPin className="size-7" />
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      status === "Live" ? "bg-primary text-primary-foreground" : status === "Rejected" ? "bg-destructive text-white" : "bg-card/90 text-muted-foreground",
                    )}
                  >
                    {status}
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate font-hud text-sm font-semibold">{p.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p._count.locations} {p._count.locations === 1 ? "pin" : "pins"} · {ended ? "ended" : "ends"} {formatDistanceToNow(new Date(p.endDate), { addSuffix: true })}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <TabFooter shown={pins.length} total={total} href="/pins/manage" label="Manage pins" />
    </>
  );
}

function PostsTab({ creatorId, total }: { creatorId: string; total: number }) {
  const posts = api.fan.post.getPosts.useInfiniteQuery({ pubkey: creatorId, limit: 6 }, { getNextPageParam: (l) => l.nextCursor });
  const items = posts.data?.pages[0]?.posts ?? [];
  if (posts.isPending) return <GridSkeleton />;
  if (posts.isError) return <ErrorState message={posts.error.message} onRetry={() => void posts.refetch()} />;
  if (!items.length)
    return (
      <EmptyState
        icon={FileText}
        title="No posts yet"
        description="Share news, media and perks with your followers."
        action={
          <Button asChild>
            <Link href="/posts/new">New post</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((p) => {
          const img = p.medias.find((m) => m.type === "IMAGE")?.url;
          return (
            <li key={p.id}>
              <Link href={`/posts/${p.id}`} className="flex gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary">
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="size-20 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{p.heading}</p>
                    {p.subscription && <Badge variant="secondary">Members</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{htmlToText(p.content)}</p>
                  <p className="mt-1 text-xs text-faint">
                    {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })} · {p._count.likes} likes · {p._count.comments} comments
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <TabFooter shown={items.length} total={total} href="/posts" label="All posts" />
    </>
  );
}

function BountiesTab({ total }: { total: number }) {
  const bounties = api.bounty.Bounty.getAllBountyByUserId.useInfiniteQuery(
    { limit: 6, sortBy: sortOptionEnum.DATE_DESC },
    { getNextPageParam: (l) => l.nextCursor },
  );
  const items = bounties.data?.pages[0]?.bounties ?? [];
  if (bounties.isPending) return <GridSkeleton />;
  if (bounties.isError) return <ErrorState message={bounties.error.message} onRetry={() => void bounties.refetch()} />;
  if (!items.length)
    return (
      <EmptyState
        icon={Target}
        title="No bounties yet"
        description="Set fans a task with a reward."
        action={
          <Button asChild>
            <Link href="/bounties/new">New bounty</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((b) => (
          <li key={b.id}>
            <BountyCard bounty={b} />
          </li>
        ))}
      </ul>
      <TabFooter shown={items.length} total={total} href="/bounties" label="All bounties" />
    </>
  );
}

function StoreTab({ total }: { total: number }) {
  const nfts = api.marketplace.market.getACreatorNfts.useInfiniteQuery({ limit: 8 }, { getNextPageParam: (l) => l.nextCursor });
  const items = nfts.data?.pages[0]?.nfts ?? [];
  if (nfts.isPending) return <GridSkeleton />;
  if (nfts.isError) return <ErrorState message={nfts.error.message} onRetry={() => void nfts.refetch()} />;
  if (!items.length)
    return (
      <EmptyState
        icon={Package}
        title="Nothing in your store yet"
        description="Create a collectible fans can buy."
        action={
          <Button asChild>
            <Link href="/stores/new">New asset</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <AssetCard item={item} />
          </li>
        ))}
      </ul>
      <TabFooter shown={items.length} total={total} href="/stores" label="Open store" />
    </>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

function Stat({ label, value, icon: Icon, onClick, href }: { label: string; value: number; icon: typeof Users; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" /> {label}
      </dt>
      <dd className="font-hud text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </>
  );
  const cls = "block rounded-xl border bg-card px-3 py-2 text-left";
  const interactive = "transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary";
  if (href)
    return (
      <Link href={href} className={cn(cls, interactive)}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, interactive)}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

function StatusBadge({ approved }: { approved: boolean | null }) {
  if (approved === true) return <Badge>Verified</Badge>;
  if (approved === false) return <Badge variant="destructive">Suspended</Badge>;
  return <Badge variant="secondary">Pending approval</Badge>;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <PageBody className="max-w-none">
      <Skeleton className="aspect-[851/315] max-h-72 w-full rounded-xl" />
      <div className="mt-4 space-y-2 sm:pl-44">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </PageBody>
  );
}
