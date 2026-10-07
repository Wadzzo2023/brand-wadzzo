import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Rows of these models carry the platform they were created on. The column
 * defaults to "wadzzo", so a create that forgets it silently files a partner
 * platform's row under Wadzzo. Every create call must set it explicitly.
 */
const STAMPED = [
  "creator",
  "locationGroup",
  "locationConsumer",
  "hotspot",
  "bounty",
  "bountyParticipant",
  "creatorEvent",
  "creatorAnnouncement",
  "mural",
  "coinLedger",
  "asset",
  "marketAsset",
  "post",
  "subscription",
  "mapEmbed",
  "qRItem",
  "redeem",
  "admin",
];

/** Copies an existing row (which already carries its platformId). */
const INHERITS = /\.\.\.rest\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** The argument text of the call whose "(" is at `open`, by bracket matching. */
function callArgs(src: string, open: number) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

describe("platform stamping", () => {
  const root = path.resolve(__dirname, "../src");
  const pattern = new RegExp(`\\.(${STAMPED.join("|")})\\.(create|createMany|upsert)\\(`, "g");

  it("every create of a platform-scoped model sets its platform", () => {
    const missing: string[] = [];
    let scanned = 0;
    for (const file of sources(root)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(pattern)) {
        scanned++;
        const args = callArgs(src, m.index + m[0].length - 1);
        if (!/platformId|platform:\s*\{\s*connect/.test(args) && !INHERITS.test(args)) {
          const line = src.slice(0, m.index).split("\n").length;
          missing.push(`${path.relative(root, file)}:${line} ${m[1]}.${m[2]}`);
        }
      }
    }
    // the scan itself still finds the creates (a broken pattern would pass vacuously)
    expect(scanned).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});
