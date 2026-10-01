# brand-wadzzo — UI/UX upgrade & framework migration plan

Status: **plan, not started** · Decided with the user on 2026-09-30 · Delivery: one branch.

brand-wadzzo is the **brand portal**: brands/artists manage their pins, hotspots,
stores, posts, bounties, events, gifts and memberships; admins manage users,
creators, pins, maps and reports. This plan makes it consistent with the Wadzzo
fan apps (wadzzoAR web + mobile), mobile-responsive, and brings it up to date.

---

## 1. Decisions

| Area | Decision |
|---|---|
| Router | **Pages Router → App Router** |
| Versions | Latest stable: Next 16, React 19, tRPC 11, TanStack Query 5, Tailwind 4, Zod 4, Prisma **7.10** (not the 8 RC), **next-auth 4.24.15** (stable; not the Auth.js v5 beta) |
| Look | **wadzzoAR arcade tokens, calmer UI**: same colours, fonts (Chakra Petch + Sora), rarity colours; flatter, denser components suited to a work tool |
| Theme | Light + dark, follows the system, with a toggle |
| Layout | One shell. Desktop: collapsible left sidebar. Phone: bottom tab bar **Map · Stores · [+ Create] · Bounties · More** |
| Admin | Same shell; admins see an **Admin** group in the nav |
| Sections | **No page merges** (user, 2026-09-30): Map, Pin management, Reports and Redeem stay separate pages. Drop dead code — **each item listed for approval before deleting** |
| Modals → pages | Pin create/edit, hotspot create/edit, bounty create/edit, post create, asset/NFT create become full pages. Small confirmations/details stay dialogs |
| Branches | brand-wadzzo `ui-upgrade` · connect_wallet `wadzzo-appRouter` (from its `wadzzo` branch) · express-wadzzo `upgrade` |
| express-wadzzo | Update packages + clean up; **HTTP API stays compatible** |
| Map | **Mapbox** (replaces Google Maps; same provider and pin look as the fan apps) |
| Verification | Local dev DB on localhost:3001, click through every page as brand and admin at desktop and phone widths, plus typecheck / lint / build |

---

## 2. Where it stands today (survey, 2026-09-30)

- Next 14.2 **Pages Router**, React 18, tRPC 10, TanStack Query 4, next-auth 4, Prisma 5, Tailwind 3. **145 dependencies + 25 dev**.
- **Four UI kits at once:** shadcn/Radix, daisyUI, Headless UI, Heroicons (+ lucide). Consolidate to shadcn/Radix + lucide.
- **26 pages**, several huge: `create` 2,283 lines, `admin/collection-report` 1,675, `report` 1,637, `pin-manage` 1,120, `redeem` 1,047.
- **19 modals, ~11,600 lines**; the six biggest (1,000–1,300 lines each) are the create-pin, admin-pin, pin-detail, bounty, NFT and hotspot modals.
- Three separate layouts (root / creator / admin), nav defined in `components/common/navlinks.tsx`.
- Submodules: `package/connect_wallet` (used in 27 files, uses `next/router` in its connect dialog) and `package/express-wadzzo` (Express task server called over HTTP via `TASK_SERVER_URL` for hotspots and jobs).
- 23 routes under `pages/api/game` (used by clients outside this app — kept, moved to route handlers).

---

## 3. Information architecture

### Brand portal
| Section | Route | Contains |
|---|---|---|
| **Pins** | `/pins` | tabs **Map** · **List** (was /map + /pin-manage) |
| | `/pins/new`, `/pins/[id]/edit` | pin create/edit page (was create-pin + pin-info-update modals) |
| | `/pins/hotspots/new`, `/pins/hotspots/[id]/edit` | hotspot create/edit page |
| **Stores** | `/stores` | assets for sale |
| | `/stores/new` | asset/NFT create page (was nft-create modal + /create) |
| **Posts** | `/posts`, `/posts/new`, `/posts/[id]` | |
| **Bounties** | `/bounties`, `/bounties/new`, `/bounties/[id]`, `/bounties/[id]/edit` | |
| **Events** | `/events` (+ new/edit pages if the form is large; decided when I get there — I'll ask) | |
| **Website Map** | `/embeds`, `/embeds/[id]` | |
| **Gifts**, **Membership** | `/gifts`, `/membership` | |
| **Reports** | `/reports` (was /report), `/reports/[id]` · **Redeem** stays its own page at `/redeem` |
| **Settings** | `/settings` | profile, theme toggle, account |

### Admin (same shell, "Admin" nav group, admins only)
`/admin/users`, `/admin/creators`, `/admin/admins`, `/admin/pins` (incl. admin pin create page), `/admin/maps`, `/admin/reports` (was collection-report).

**Old URLs redirect** to the new ones (`/map`, `/pin-manage` → `/pins/manage`, `/report`, `/create`, `/admin/collection-report`) via `next.config` redirects, so bookmarks keep working.

### Phone
Bottom bar: **Map · Stores · [+ Create] · Bounties · More**.
- **+ Create** opens a sheet: New pin · New hotspot · New bounty · New post · New asset · New event.
- **More** opens a sheet with every other section (Posts, Events, Website Map, Gifts, Membership, Reports, Settings, and Admin for admins).
- Map / pin / hotspot create pages go full-screen on phones (map on top, form in a draggable bottom panel).

---

## 4. Design system (`src/ui/`)

Built once, used everywhere — the main source of the "reusable code" and of the shrinking page sizes.

- **Tokens**: port wadzzoAR's `arcade.css` variables (surfaces, lines, text, green accent, rarity colours, radii) into Tailwind 4 `@theme`, with light and dark values. Fonts: Chakra Petch (headings/labels), Sora (body).
- **Primitives** (shadcn/Radix, restyled to the tokens): Button, IconButton, Input, Textarea, Select, Combobox, Checkbox, Switch, RadioGroup, DatePicker, Tabs, Badge/RarityBadge/StatusBadge, Card, Tooltip, DropdownMenu, Dialog, Sheet (bottom on phone / side on desktop), Toast, Skeleton, EmptyState, Pagination.
- **Patterns**:
  - `PageHeader` (title, description, actions, breadcrumbs), `PageSection`.
  - `DataTable` (sorting, search, filters, pagination, row actions; collapses to cards on phones) — replaces the hand-built tables in admin, reports, pins list.
  - `FormPage` (sticky header with Cancel/Save, sections, unsaved-changes guard, mobile sticky action bar) + form fields bound to react-hook-form + zod.
  - `MapPicker` (location picking, search, current location, radius) shared by pin, hotspot and admin-pin pages.
  - `MediaUpload` (image/video/3D upload with progress) shared by posts, assets, bounties, pins.
  - `ConfirmDialog`, `StatCard`, `FilterBar`.
- Same loading behaviour as the fan apps: shape-matched skeletons with one sweep, and the `Loader2` spinner.

---

## 5. The big forms, as pages

The six 1,000-line modals mostly repeat the same pieces (location, media, dates, supply, rarity/tier, collection limits). Each becomes a page built from `FormPage` + shared field groups:

| Page | Built from | Replaces |
|---|---|---|
| Pin create/edit | MapPicker · details · media · schedule · supply & limits · tier/visibility | create-pin-modal, pin-info-update-modal, copy-cut-pin-modal (as an action) |
| Admin pin create | same page with admin-only fields | create-admin-pin-modal |
| Hotspot create/edit | MapPicker (area) · drop schedule · pin template | create-hotspot-modal, hotspot-details (as a detail panel) |
| Bounty create/edit | details · rewards · media · deadline | create-bounty-modal, edit-bounty-modal |
| Post create | editor · media · tier | create-post-modal |
| Asset / NFT create | media · details · price · supply | nft-create-modal, /create page |

Kept as dialogs/sheets (small, in-context): pin detail (becomes a side panel on the map), QR code, share post, add/edit tier, view attachment, stored asset picker, confirmations.

---

## 6. Framework migration

1. **Next 16 + React 19**, App Router (`src/app`): route groups `(portal)` and `(portal)/admin`, one `layout.tsx` for the shell, `loading.tsx`/`error.tsx`/`not-found.tsx` per section.
2. **tRPC 11 + TanStack Query 5**: route handler at `app/api/trpc/[trpc]/route.ts`; client via the `@trpc/tanstack-react-query` integration; server-side prefetch where it helps first paint. Router code stays; call sites updated.
3. **next-auth 4.24.15** on App Router: route handler `app/api/auth/[...nextauth]/route.ts`, `getServerSession` in server components/layouts, middleware for protected routes and the admin group.
4. **Prisma 7.10**: `prisma.config.ts`, driver adapter, generated client. **No schema or DB changes** (schema is shared with wadz0 / wadzzoAR / express-wadzzo).
5. **Tailwind 4** (+ shadcn's Tailwind 4 setup), **Zod 4**, `motion` (renamed framer-motion), `react-map-gl` 8 / `mapbox-gl` latest, ESLint flat config.
6. **API routes** (`/api/game/*`, `xdr`, `toml`, `file`) → route handlers with the **same paths and responses** (other clients call them).
7. **connect_wallet** → branch `wadzzo-appRouter` from `wadzzo`: replace `next/router` with `next/navigation`, React 19 / Query 5 compatibility. brand-wadzzo's submodule pointer moves to that branch.
8. **express-wadzzo** → branch `upgrade`: bump dependencies, remove unused ones, tidy; routes, payloads and job formats unchanged.

---

## 7. Cleanup

- Remove daisyUI, Headless UI, Heroicons and any other kit once nothing imports them.
- Run a dependency audit (knip/depcheck) and remove unused packages from all three repos.
- Delete dead code — **I'll list every candidate (e.g. seasonal "christmas" bits, unused 3D / agent pieces, orphaned components) and wait for your OK before deleting.**
- One `lib/` layout: `lib/api` (tRPC client), `lib/map`, `lib/stellar`, `lib/format`, `lib/upload`; remove duplicated helpers.
- Remove `tsconfig.tsbuildinfo` and other build artefacts from the repo.

---

## 8. Order of work (one branch, `ui-upgrade`)

1. Branches in all three repos; baseline build + screenshots of every page (desktop + phone) for before/after comparison.
2. Framework migration on the current screens (App Router, versions, tRPC/Query/Auth/Prisma); everything still works as before.
3. Design system + tokens + light/dark + the shell (sidebar, phone tab bar, Create and More sheets, Admin group).
4. Pins: Map (`/pins`) and Pin management (`/pins/manage`) as separate pages, pin detail panel, pin & hotspot pages, `MapPicker`.
5. Stores (Assets + Page asset tabs; QR items removed) + asset page, Posts + post page, Bounties + bounty pages, Events, Website Map, Gifts, Membership.
6. Reports and Redeem (separate pages), Settings.
7. Admin section (DataTable everywhere, admin pin page).
8. connect_wallet `wadzzo-appRouter`, express-wadzzo `upgrade`.
9. Cleanup (dead code list → your approval → delete; unused packages).
10. Full click-through as brand and admin, desktop and phone, dark and light; typecheck, lint, production build.

---

## 9. Risks

- **Size**: this touches every page; one branch means one large review at the end. The before/after screenshots and a page-by-page checklist are there to make it reviewable.
- **Shared DB**: Prisma 7 changes only the client, not the schema. No `db push` from this branch.
- **External callers**: `/api/game/*` and the express task server keep their exact contracts.
- **connect_wallet is shared** with other apps; the new work lives only on `wadzzo-appRouter`, other branches untouched.

## 10. Still to ask during the work

- Which dead code to delete (list comes first).
- Whether Events gets its own create/edit pages.
- Any page where the new layout changes a workflow noticeably — I'll show it before building it through.

---

## Baseline (2026-09-30, before any change, branch `ui-upgrade` = main)

- `tsc --noEmit`: **107 errors** (≈half from express-wadzzo being inside brand-wadzzo's tsconfig). The build hides them: `ignoreBuildErrors` + `ignoreDuringBuilds` are on. Target: 0 errors, both flags off.
- `pnpm build`: passes, with a broken import warning (`SIMPLIFIED_FEE_IN_XLM` not exported from `~/lib/stellar/constant`).
- **First Load JS shared by all pages: 797 kB** (/map 871 kB, /create 757 kB, /admin/collection-report 795 kB). Target: well under half.

### What the current UI looks like (browser walk-through, 2026-09-30, desktop ~1024px)

Test account: Fyron (GAP4E5…EZH) on the **dev DB** (`ep-winter-art`), granted Admin + `navPermission` for testing (revert: delete the Admin row, set `Creator.extraFields` to null). The account has no pins/posts/bounties, so most brand pages show empty states.

- **Consistency**: every page has its own header style — left-aligned title (Posts, Events), centred banner with tinted background (Bounties), title + tabs (Pin management), bare title (Stores). Accent colours vary: green buttons almost everywhere, a **red** "Create Bounty", a **purple→blue gradient** "Create Your First Post".
- **Empty states**: from a designed card with icon, copy and CTA (Events, Stores) to a bare centred line (Bounties "No bounties found", Pin management "No general groups found").
- **Loading**: while a page loads, the sidebar collapses into a small floating card at the top-left with only 2–4 items, then jumps back to the full rail — a big layout shift on every navigation. Skeletons don't match the page that then appears (Bounties shows 4 stat cards + a panel, then renders a search bar + one line).
- **Navigation**: icon-only rail by default, labels only when expanded; the balance pill (22,157.00) sits at the top of the rail; "Switch to Admin" is a large green button in the rail.
- **Admin**: separate admin layout. It is shown to **non-admins** too, who then get "You are not authorized to view this page" — admin navigation must only render for admins. Creator management is a dense table with Approved/Nav Permission/Ban per row (the Nav Permission toggle is what unlocks Stores/Posts/Bounties/Gifts/Membership for a brand).
- **Map**: **Google Maps** (`@vis.gl/react-google-maps`), showing "For development purposes only" on localhost (key without billing or not allowed for localhost). The fan apps use Mapbox. → Decide map provider for the portal (question below).
- **Slow first loads** in dev (15–45 s per page compile) — the 797 kB shared bundle is part of it.
- Phone widths were not captured: the browser extension can't resize the window. To be checked with a narrow window / device mode during the work.

**Decided (2026-09-30): switch the portal map to Mapbox** — same provider and pin look as the fan apps; MapPicker and the area/drawing tools are rebuilt on Mapbox (mapbox-gl-draw), and `@vis.gl/react-google-maps` is removed.

## Task server (express-wadzzo) — findings from the hotspot check (2026-09-30)

- **Local dev:** the portal reads `EXPRESS_SERVER_URL` (server env). Production falls back to
  `https://portal.actn.xyz/wadzzo/api/`; anywhere else it must be set, so local testing never
  writes to production. Locally: `package/express-wadzzo` → `pnpm build && node dist/index.js`
  (port 4000, `.env` with the **dev** DATABASE_URL), and `EXPRESS_SERVER_URL=http://localhost:4000`
  in `.env.development`. `pnpm dev` (tsx watch) fails on Node 24 — fix in the `upgrade` branch.
- **No auth on `/hotspots`** (deferred by decision): anyone who can reach the server can create,
  pause or delete any brand's hotspots by passing a creatorId. Fix later with a shared-secret header.
- **First drop ignores the start date:** the first location group is created with
  `startDate: now` even when `hotspotStartDate` is in the future.
- **Hotspot drops skip review:** location groups are created `approved: true`, unlike normal pins.
- Fixed in the portal: empty link sent as `""` made every link-less hotspot fail (Express rejects it).

---

## Progress (2026-10-01)

- Commits on `ui-upgrade`: `5c6a2d3` (upgrade work so far), `3bc88da` (dead code: 136 unused files and 26 packages removed via knip; seeds, script.ts, public/widget-script.js and submodules kept).
- Shared UI kit in `src/ui/`: DataTable, StatusPill, Person/Avatar, Toolbar (SearchInput, FilterChips), StatCard, tone-* utilities in globals.css. New pages use these, not hard-coded colours.
- Admin done: Creators, Users, Admins, creator/user detail, Pin review (grouped by brand, filters for submitted/live dates, area, locations, type, brand; sort; bulk approve/reject/delete; preview drawer; keyboard; undo; per-location edit/delete).
- Reports done: one shared report for brands (/reports) and admins (/admin/reports, any brand or all), per-pin report at /reports/[id] and /admin/reports/[id]; counted in SQL (`maps.report.*`).
- Next: All maps, admin new pin/hotspot review, global token sweep, Reports analytics leftovers, onboarding, step 2 (41 TS errors, 118 lint errors, ignoreBuildErrors, zod 4), step 8, security items, click-through.
- Open question: `maps.pin.getPin` is public and returns collectors; unused in the portal now — restrict or remove (check other apps first).
