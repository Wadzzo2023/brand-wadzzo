/**
 * Demo drops around Clinton County, Iowa — for the website-embed mockup.
 *
 *   npx tsx --env-file=.env.development prisma/seed-clinton-demo.ts          # (re)seed
 *   npx tsx --env-file=.env.development prisma/seed-clinton-demo.ts --clean  # remove
 *
 * Creates one approved "[Demo]" brand and ~16 approved, public drops at public
 * places in the county. Every row id starts with "seed-cc", so --clean (and
 * reruns) touch nothing else. Coordinates are approximate.
 */
import { ItemPrivacy, PinType, PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BRAND_ID = "seed-cc-brand";
const DAY = 86_400_000;
const img = (seed: string, w = 800, h = 800) => `https://picsum.photos/seed/wadzzo-cc-${seed}/${w}/${h}`;

type Drop = {
  title: string;
  description: string;
  lat: number;
  lng: number;
  type: PinType;
  privacy?: ItemPrivacy;
  /** null = uncapped (the platform's 999999 sentinel). */
  limit?: number;
  claimed?: number;
  link?: string;
};

const DROPS: Drop[] = [
  { title: "Eagle Point Park Overlook", description: "Take in the Mississippi from the stone castle overlook and collect the Eagle Point badge.", lat: 41.8716, lng: -90.1778, type: PinType.LANDMARK },
  { title: "Historic Courthouse (1897)", description: "The county's working courthouse, completed in 1897. Find the drop on the front steps.", lat: 41.8474, lng: -90.1896, type: PinType.LANDMARK },
  { title: "Riverview Park Riverwalk", description: "Stroll the riverfront trail and pick up a riverwalk collectible along the way.", lat: 41.8409, lng: -90.1862, type: PinType.EXPERIENCE },
  { title: "Showboat Theatre Night", description: "Catch a summer show aboard the Showboat — this drop is live on performance weekends.", lat: 41.8431, lng: -90.1853, type: PinType.EVENT, limit: 150, claimed: 62 },
  { title: "Sawmill Museum Visit", description: "Explore the county's lumber-era history. Collect the Sawmill token inside the museum.", lat: 41.8468, lng: -90.1849, type: PinType.EXPERIENCE },
  { title: "LumberKings Game Day", description: "Cheer on the home team at the ballpark and grab the game-day card.", lat: 41.8352, lng: -90.1889, type: PinType.EVENT, limit: 300, claimed: 214 },
  { title: "Lyons Four Square Park", description: "The heart of the historic Lyons district — shops, cafés and a hidden drop.", lat: 41.8747, lng: -90.1937, type: PinType.LANDMARK },
  { title: "Bickelhaupt Arboretum", description: "Fourteen acres of trees, conifers and gardens. Free and open every day.", lat: 41.8657, lng: -90.2266, type: PinType.EXPERIENCE },
  { title: "Rock Creek Marina Sunset", description: "Paddle, fish or camp at Rock Creek — the sunset drop appears near the boat launch.", lat: 41.7585, lng: -90.2752, type: PinType.EXPERIENCE, privacy: ItemPrivacy.PRIVATE },
  { title: "Camanche Riverfront Fest", description: "Food, music and fireworks on the Camanche riverfront. Festival-only collectible.", lat: 41.7881, lng: -90.2558, type: PinType.EVENT, limit: 500, claimed: 131 },
  { title: "DeWitt Central Park", description: "Downtown DeWitt's gathering place — farmers market on Saturdays.", lat: 41.8233, lng: -90.5379, type: PinType.LANDMARK },
  { title: "DeWitt Fall Harvest Market", description: "Local growers, bakers and makers every Saturday morning this fall.", lat: 41.8241, lng: -90.5392, type: PinType.EVENT },
  { title: "Grand Mound Main Street", description: "A small-town stop on the Lincoln Highway with a collectible for road-trippers.", lat: 41.8228, lng: -90.6482, type: PinType.OTHER },
  { title: "Wheatland Heritage Trail", description: "Walk the trail and learn the story of the county's western prairie towns.", lat: 41.8317, lng: -90.8376, type: PinType.EXPERIENCE },
  { title: "Goose Lake Launch", description: "New season, new drop: the Goose Lake collectible launches this month.", lat: 41.9681, lng: -90.3818, type: PinType.LAUNCH, limit: 200, claimed: 18 },
  { title: "Eden Valley Refuge", description: "Trails, a nature center and a swinging bridge in Clinton County's backcountry.", lat: 41.989, lng: -90.464, type: PinType.EXPERIENCE, privacy: ItemPrivacy.PRIVATE },
];

async function clean() {
  const groups = await db.locationGroup.deleteMany({ where: { id: { startsWith: "seed-cc" } } });
  const creator = await db.creator.deleteMany({ where: { id: BRAND_ID } });
  await db.user.deleteMany({ where: { id: BRAND_ID } });
  console.log(`Removed ${groups.count} demo drops${creator.count ? " and the demo brand" : ""}.`);
}

async function main() {
  await clean();
  if (process.argv.includes("--clean")) return;

  await db.user.create({ data: { id: BRAND_ID, name: "Clinton County Tourism [Demo]", image: img("brand", 200, 200) } });
  await db.creator.create({
    data: {
      id: BRAND_ID,
      name: "Clinton County Tourism [Demo]",
      bio: "Demo brand for the website map mockup.",
      profileUrl: img("brand", 200, 200),
      coverUrl: img("cover", 1600, 600),
      storagePub: "DEMO",
      storageSecret: "DEMO",
      aprovalSend: true,
      approved: true,
    },
  });

  const now = Date.now();
  for (const [i, d] of DROPS.entries()) {
    const id = `seed-cc-${String(i + 1).padStart(2, "0")}`;
    const limit = d.limit ?? 999_999;
    await db.locationGroup.create({
      data: {
        id,
        creatorId: BRAND_ID,
        title: d.title,
        description: d.description,
        type: d.type,
        privacy: d.privacy ?? ItemPrivacy.PUBLIC,
        approved: true,
        hidden: false,
        limit,
        remaining: limit - (d.claimed ?? 0),
        startDate: new Date(now - DAY),
        endDate: new Date(now + 120 * DAY),
        latitude: d.lat,
        longitude: d.lng,
        radius: 60,
        image: img(`d${i}`),
        link: d.link ?? null,
        locations: { create: { id: `${id}-l`, latitude: d.lat, longitude: d.lng, autoCollect: false } },
      },
    });
  }
  console.log(`Seeded the demo brand and ${DROPS.length} drops around Clinton County.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
