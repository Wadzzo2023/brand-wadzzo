/**
 * Seeds Events & Announcements for local testing.
 *
 *   npx tsx prisma/seed-events.ts          # replace previous seed rows, then seed
 *   npx tsx prisma/seed-events.ts --clean  # only remove previous seed rows
 *
 * Uses DATABASE_URL (brand-wadzzo's .env → the dev Neon DB). Every row it
 * writes has an id starting with "seed-", so reruns and --clean touch nothing
 * a real brand made. Venues sit ~100–400 m from one of the brand's own pins;
 * linked pins/bounties are the brand's own. RSVPs and comments come from
 * existing users so counts and threads have something in them.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Deterministic so reruns produce the same data.
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const sample = <T,>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);
const img = (seed: string, w = 1200, h = 600) => `https://picsum.photos/seed/wadzzo-${seed}/${w}/${h}`;

/** Start of today + `days` days, at `hour` local. */
function at(days: number, hour: number, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return new Date(d.getTime() + days * DAY);
}

type EventSeed = {
  title: string;
  description: string;
  start: Date;
  hours: number;
  venue?: string;
  online?: { link: string; label: string };
  ticket?: { link: string; label: string };
  capacity?: number;
  /** Fraction of capacity to fill with RSVPs (1 = full). */
  fill?: number;
  linkPins?: number;
  linkBounties?: number;
};

const EVENTS: EventSeed[] = [
  // Live now
  { title: "Friday Night Market", description: "Food trucks, local makers and live music under the lights.\n\nCollect the limited Night Market badge at the main stage — it's only droppable while the market is open.", start: at(0, new Date().getHours() - 1), hours: 5, venue: "Riverside Plaza", capacity: 300, fill: 0.4, linkPins: 2 },
  { title: "Live Studio Session: Open Mic", description: "Bring a song, a poem or just yourself. Sign-ups at the door.", start: at(0, new Date().getHours() - 2), hours: 4, venue: "The Attic — Studio B", online: { link: "https://www.youtube.com/live", label: "Watch the stream" } },
  // Upcoming — this week
  { title: "Sunrise Community Run (5K)", description: "An easy-paced 5K along the river trail. All paces welcome, coffee after.\n\nEvery finisher gets a collectible runner's badge.", start: at(1, 7), hours: 2, venue: "Trailhead Pavilion", capacity: 60, fill: 0.9, linkPins: 1 },
  { title: "Makers & Merch Pop-Up", description: "Twenty local makers, one afternoon. Prints, ceramics, candles and more.", start: at(2, 12), hours: 6, venue: "Old Mill Courtyard", ticket: { link: "https://example.com/popup", label: "Get free tickets" } },
  { title: "Brand Launch Party", description: "We're unveiling our new collection — first 50 through the door get an exclusive drop.", start: at(3, 19), hours: 3, venue: "Warehouse 9", capacity: 50, fill: 1, linkPins: 1 },
  { title: "Photo Walk: Murals of Downtown", description: "A guided two-hour walk past the city's best murals. Bring a camera or just your phone.", start: at(3, 10), hours: 2, venue: "Main St & 3rd", capacity: 25, fill: 0.5, linkPins: 3 },
  { title: "Online Q&A with the Founders", description: "Ask us anything about what's coming next. Questions in the chat.", start: at(4, 18), hours: 1, online: { link: "https://zoom.us/j/0000000000", label: "Join on Zoom" } },
  { title: "Coffee Cupping Workshop", description: "Taste six single-origin coffees side by side and learn what to listen for. Small group, hands-on.", start: at(5, 9, 30), hours: 2, venue: "Tasting Room", capacity: 12, fill: 0.75, ticket: { link: "https://example.com/cupping", label: "Book a seat" } },
  // Upcoming — later
  { title: "Kids' Scavenger Hunt", description: "Follow the clues, find the drops, win a prize. Ages 6–12 with an adult.", start: at(7, 10), hours: 3, venue: "City Park — North Lawn", linkPins: 3, linkBounties: 1 },
  { title: "Vinyl Swap Meet", description: "Crate-dig, trade and sell. Tables free for sellers, first come first served.", start: at(9, 11), hours: 5, venue: "Record Hall" },
  { title: "Women in Business Breakfast", description: "Networking breakfast with a short panel on growing a local brand.", start: at(10, 8), hours: 2, venue: "Grand Hotel Ballroom", capacity: 120, fill: 0.3, ticket: { link: "https://example.com/breakfast", label: "Register" } },
  { title: "Outdoor Movie Night", description: "Bring a blanket — we've got the popcorn. Film starts at dusk.", start: at(12, 20), hours: 3, venue: "Amphitheater Lawn", linkPins: 1 },
  { title: "Bounty Hackathon Weekend", description: "Two days to take on our open bounties with other creators. Prizes for the best entries.", start: at(14, 10), hours: 32, venue: "Innovation Hub", online: { link: "https://discord.com", label: "Join the Discord" }, linkBounties: 3 },
  { title: "Harvest Festival", description: "Hayrides, cider, pumpkin carving and a festival-only collectible.", start: at(21, 11), hours: 7, venue: "Heritage Farm", capacity: 800, fill: 0.15, linkPins: 2 },
  { title: "Holiday Lights Walk", description: "A mile of lights through the old town. Hot chocolate at the halfway point.", start: at(45, 18), hours: 3, venue: "Old Town Square" },
  // Past
  { title: "Spring Art Crawl", description: "Twelve galleries, one ticket. Thanks to everyone who came!", start: at(-3, 17), hours: 4, venue: "Arts District", linkPins: 2 },
  { title: "Charity Fun Run", description: "We raised over $4,000 for the food bank. See you next year.", start: at(-8, 8), hours: 3, venue: "Lakeside Loop", capacity: 200, fill: 0.95 },
  { title: "Livestream: Behind the Scenes", description: "A tour of the workshop and how our collectibles are made.", start: at(-12, 19), hours: 1, online: { link: "https://www.youtube.com", label: "Watch the replay" } },
  { title: "Grand Opening Weekend", description: "Our doors opened — thank you for the incredible turnout.", start: at(-30, 10), hours: 30, venue: "Flagship Store" },
  { title: "Winter Pop-Up Market", description: "Last season's pop-up. Photos in the announcements tab.", start: at(-60, 12), hours: 6, venue: "Depot Hall" },
];

type PostSeed = {
  title: string;
  body: string;
  images?: number;
  pinned?: boolean;
  cta?: { label: string; url: string };
  /** Days from now; negative = already expired (hidden from fans). */
  expiresIn?: number;
  ageHours: number;
};

const POSTS: PostSeed[] = [
  { title: "Welcome to our Wadzzo page!", body: "This is where we'll post drops, events and news. Follow us so our posts show up in your Following feed.", pinned: true, ageHours: 24 * 20 },
  { title: "New collection drops Friday", body: "Six new collectibles hidden across the city. Hints go up here Thursday night.", images: 3, ageHours: 5 },
  { title: "Weekend sale — 20% off", body: "Show your collected badge at the counter for 20% off everything this weekend.", cta: { label: "Shop now", url: "https://example.com/shop" }, expiresIn: 3, ageHours: 12 },
  { title: "Thank you for 1,000 collectors", body: "You've collected our drops over a thousand times. A special thank-you drop is on the map now.", images: 1, ageHours: 30 },
  { title: "Holiday hours", body: "We're closed on the 25th and 1st. Pins stay collectible the whole time.", expiresIn: 60, ageHours: 48 },
  { title: "Behind the scenes", body: "A peek at how we design each collectible — sketches, colours and the final 3D model.", images: 4, ageHours: 72 },
  { title: "Volunteer with us", body: "We need 10 volunteers for the Harvest Festival. Free shirt and lunch.", cta: { label: "Sign up", url: "https://example.com/volunteer" }, ageHours: 96 },
  { title: "Bounty results are in", body: "Congratulations to this month's winners! Rewards have been sent to their wallets.", pinned: true, ageHours: 120 },
  { title: "App update", body: "Events now live in the Wadzzo app — tap the calendar icon on the map.", ageHours: 3 },
  { title: "Flash drop: next 2 hours", body: "A rare drop just appeared downtown. Gone in two hours!", expiresIn: 0.08, ageHours: 0.5 },
  { title: "Last month's pop-up recap", body: "Photos from the pop-up market. Thanks to every maker who joined us.", images: 5, ageHours: 24 * 25 },
  { title: "Summer sale (ended)", body: "This one has expired — it should not appear for fans.", expiresIn: -2, ageHours: 24 * 15 },
];

const COMMENTS = [
  "Can't wait for this!", "See you there 🙌", "Is parking available nearby?", "Bringing the whole family.",
  "Love this idea", "What time does it end?", "Will there be a drop at the entrance?", "Great event last year!",
  "Is it wheelchair accessible?", "Just RSVP'd!", "Amazing, thank you!", "Any vegetarian food options?",
];

async function clean() {
  const where = { id: { startsWith: "seed-" } };
  const [c1, c2, r, e, a] = await db.$transaction([
    db.eventComment.deleteMany({ where }),
    db.announcementComment.deleteMany({ where }),
    db.eventRsvp.deleteMany({ where }),
    db.creatorEvent.deleteMany({ where }),
    db.creatorAnnouncement.deleteMany({ where }),
  ]);
  console.log(`Removed previous seed: ${e.count} events, ${a.count} announcements, ${r.count} RSVPs, ${c1.count + c2.count} comments`);
}

async function main() {
  const tables = await db.$queryRaw<{ n: bigint }[]>`
    select count(*) as n from information_schema.tables
    where table_schema = 'public' and table_name in ('CreatorEvent', 'CreatorAnnouncement')`;
  if (Number(tables[0]?.n ?? 0) < 2) {
    throw new Error("Event tables are missing in this database — run `npx prisma db push` first.");
  }

  await clean();
  if (process.argv.includes("--clean")) return;

  // Approved brands, busiest first; each needs at least one pin for a venue.
  const creators = await db.creator.findMany({
    where: { approved: true },
    select: {
      id: true,
      name: true,
      LocationGroup: { select: { id: true, latitude: true, longitude: true }, orderBy: { createdAt: "desc" }, take: 50 },
      Bounty: { select: { id: true }, take: 20 },
    },
  });
  const brands = creators.filter((c) => c.LocationGroup.length > 0);
  if (!brands.length) throw new Error("No approved brand with pins to attach events to.");
  const users = (await db.user.findMany({ select: { id: true }, take: 400 })).map((u) => u.id);
  console.log(`Brands: ${brands.map((b) => b.name).join(", ")} · ${users.length} users available for RSVPs/comments`);

  // Brands with bounties get the bounty-linked events.
  const withBounties = brands.filter((b) => b.Bounty.length > 0);

  for (const [i, ev] of EVENTS.entries()) {
    const brand = ev.linkBounties && withBounties.length ? pick(withBounties) : brands[i % brands.length]!;
    const anchor = pick(brand.LocationGroup);
    // ~100–400 m in a random direction from one of the brand's pins.
    const dist = 0.001 + rand() * 0.003;
    const ang = rand() * Math.PI * 2;
    const hasVenue = Boolean(ev.venue);
    const link = ev.online ?? ev.ticket;
    const id = `seed-ev-${String(i + 1).padStart(2, "0")}`;

    // Few users in a dev DB: shrink the cap so the intended fill (full, 90%…)
    // still shows, instead of "17 of 800".
    const wanted = ev.capacity ? Math.round(ev.capacity * (ev.fill ?? 0)) : Math.floor(rand() * 25);
    const going = Math.min(wanted, users.length);
    const capacity = ev.capacity
      ? wanted > users.length
        ? Math.max(going, Math.round(going / (ev.fill || 1)))
        : ev.capacity
      : null;

    await db.creatorEvent.create({
      data: {
        id,
        creatorId: brand.id,
        title: ev.title,
        description: ev.description,
        coverImage: i % 5 === 4 ? null : img(`ev${i}`),
        startDate: ev.start,
        endDate: new Date(ev.start.getTime() + ev.hours * HOUR),
        venueName: ev.venue ?? null,
        address: hasVenue ? `${100 + Math.floor(rand() * 900)} ${pick(["Main St", "River Rd", "Market Ave", "2nd St", "Park Blvd"])}` : null,
        latitude: hasVenue ? anchor.latitude + Math.sin(ang) * dist : null,
        longitude: hasVenue ? anchor.longitude + Math.cos(ang) * dist : null,
        link: link?.link ?? null,
        linkLabel: link?.label ?? null,
        capacity,
        pins: { connect: sample(brand.LocationGroup, ev.linkPins ?? 0).map((p) => ({ id: p.id })) },
        bounties: { connect: sample(brand.Bounty, ev.linkBounties ?? 0).map((b) => ({ id: b.id })) },
      },
    });

    const attendees = sample(users, going);
    if (attendees.length) {
      await db.eventRsvp.createMany({
        data: attendees.map((userId, k) => ({ id: `${id}-r${k}`, eventId: id, userId })),
      });
    }
    const commenters = sample(users, Math.floor(rand() * 6));
    if (commenters.length) {
      await db.eventComment.createMany({
        data: commenters.map((userId, k) => ({
          id: `${id}-c${k}`,
          eventId: id,
          userId,
          content: pick(COMMENTS),
          createdAt: new Date(Date.now() - rand() * 5 * DAY),
        })),
      });
    }
  }

  for (const [i, p] of POSTS.entries()) {
    const brand = brands[(i + 2) % brands.length]!;
    const id = `seed-an-${String(i + 1).padStart(2, "0")}`;
    const createdAt = new Date(Date.now() - p.ageHours * HOUR);
    await db.creatorAnnouncement.create({
      data: {
        id,
        creatorId: brand.id,
        title: p.title,
        body: p.body,
        images: Array.from({ length: p.images ?? 0 }, (_, k) => img(`an${i}-${k}`, 1000, 750)),
        pinned: p.pinned ?? false,
        ctaLabel: p.cta?.label ?? null,
        ctaUrl: p.cta?.url ?? null,
        expiresAt: p.expiresIn != null ? new Date(Date.now() + p.expiresIn * DAY) : null,
        createdAt,
      },
    });
    const commenters = sample(users, Math.floor(rand() * 5));
    if (commenters.length) {
      await db.announcementComment.createMany({
        data: commenters.map((userId, k) => ({
          id: `${id}-c${k}`,
          announcementId: id,
          userId,
          content: pick(COMMENTS),
          createdAt: new Date(createdAt.getTime() + rand() * (Date.now() - createdAt.getTime())),
        })),
      });
    }
  }

  const [e, a, r, c1, c2] = await Promise.all([
    db.creatorEvent.count({ where: { id: { startsWith: "seed-" } } }),
    db.creatorAnnouncement.count({ where: { id: { startsWith: "seed-" } } }),
    db.eventRsvp.count({ where: { id: { startsWith: "seed-" } } }),
    db.eventComment.count({ where: { id: { startsWith: "seed-" } } }),
    db.announcementComment.count({ where: { id: { startsWith: "seed-" } } }),
  ]);
  console.log(`Seeded ${e} events, ${a} announcements, ${r} RSVPs, ${c1 + c2} comments.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
