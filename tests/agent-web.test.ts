import { describe, expect, it, vi } from "vitest";

// Web list lookups (package/express-wadzzo/src/agent/web.ts) with the model and Google stubbed.
vi.mock("../package/express-wadzzo/src/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const findPlace = vi.fn(async (name: string) => ({ id: `g_${name}`, title: name, lat: 1, lng: 2 }));
vi.mock("../package/express-wadzzo/src/agent/google", () => ({ findPlace, geocode: vi.fn(async () => null) }));
const prompts: string[] = [];
vi.mock("../package/express-wadzzo/node_modules/@langchain/openai", () => ({
  ChatOpenAI: class {
    bindTools() {
      return this;
    }
    async invoke(messages: { content: string }[]) {
      const prompt = messages[0]!.content;
      prompts.push(prompt);
      // Every region returns its own troll plus one that's listed everywhere.
      const region = /in (.+?)\.\n/.exec(prompt)?.[1] ?? "?";
      return { content: JSON.stringify([{ name: `Troll in ${region}`, city: region }, { name: "Famous troll", city: "Copenhagen" }]) };
    }
  },
}));

const { searchWebList } = await import("../package/express-wadzzo/src/agent/web");

describe("web lists", () => {
  it("look a worldwide list up region by region, then merge duplicates", async () => {
    const found = await searchWebList("Thomas Dambo trolls", "", 200);
    expect(prompts.length).toBe(6);
    expect(prompts.some((p) => p.includes("in Europe."))).toBe(true);
    expect(found.filter((f) => f.title === "Famous troll")).toHaveLength(1);
    expect(found).toHaveLength(7);
  });
});
