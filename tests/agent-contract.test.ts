import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// The brand app and the task server (a separate repo) share the map agent's
// contract by copying one file; this keeps the copies identical.
describe("map agent contract", () => {
  it("is the same in the brand app and the task server", () => {
    const app = readFileSync(resolve(__dirname, "../src/lib/agent/contract.ts"), "utf8");
    const worker = readFileSync(resolve(__dirname, "../package/express-wadzzo/src/agent/contract.ts"), "utf8");
    expect(worker).toBe(app);
  });
});
