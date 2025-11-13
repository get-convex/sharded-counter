/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import { api } from "./_generated/api.js";

const modules = import.meta.glob("./**/*.*s");

describe("counter", () => {
  test("add and subtract", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.public.add, { name: "beans", count: 10 });
    await t.mutation(api.public.add, { name: "beans", count: 5 });
    expect(await t.query(api.public.count, { name: "beans" })).toEqual(15);
    await t.mutation(api.public.add, { name: "beans", count: -5 });
    expect(await t.query(api.public.count, { name: "friends" })).toEqual(0);
    await t.mutation(api.public.add, { name: "friends", count: 6, shards: 1 });
    await t.mutation(api.public.add, { name: "friends", count: 2, shards: 1 });
    await t.mutation(api.public.add, { name: "friends", count: 3, shards: 3 });
    expect(await t.query(api.public.count, { name: "beans" })).toEqual(10);
    expect(await t.query(api.public.count, { name: "friends" })).toEqual(11);
  });
  test("respects shard argument", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.public.add, { name: "beans", count: 10, shard: 1 });
    await t.mutation(api.public.add, { name: "beans", count: 5, shard: 2 });
    const values = await t.run(async (ctx) => {
      const shard1 = await ctx.db
        .query("counters")
        .withIndex("name", (q) => q.eq("name", "beans").eq("shard", 1))
        .unique();
      const shard2 = await ctx.db
        .query("counters")
        .withIndex("name", (q) => q.eq("name", "beans").eq("shard", 2))
        .unique();
      return [shard1?.value, shard2?.value];
    });
    expect(values).toEqual([10, 5]);
  });
  test("reset", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.public.add, { name: "beans", count: 10 });
    await t.mutation(api.public.reset, { name: "beans" });
    expect(await t.query(api.public.count, { name: "beans" })).toEqual(0);
  });
});

fcTest.prop(
  {
    updates: fc.array(
      fc.record({
        v: fc.integer({ min: -10000, max: 10000 }).map((i) => i / 100),
        key: fc.string(),
        shards: fc.option(fc.integer({ min: 1, max: 100 })),
      }),
    ),
  },
  { numRuns: 10 },
)(
  "updates to counter should match in-memory counter which ignores sharding",
  async ({ updates }) => {
    const t = convexTest(schema, modules);
    const counter = new Map<string, number>();
    for (const { v, key, shards } of updates) {
      counter.set(key, (counter.get(key) ?? 0) + v);
      await t.mutation(api.public.add, {
        name: key,
        count: v,
        shards: shards ?? undefined,
      });
      const count = await t.query(api.public.count, { name: key });
      expect(count).toBeCloseTo(counter.get(key)!);
    }
    for (const [key, value] of counter.entries()) {
      // Rebalancing keeps count the same and makes estimateCount accurate.
      await t.mutation(api.public.rebalance, { name: key });
      const count = await t.query(api.public.count, { name: key });
      expect(count).toBeCloseTo(value);
      for (let i = 1; i <= 16; i++) {
        const estimate = await t.query(api.public.estimateCount, {
          name: key,
          readFromShards: i,
        });
        expect(estimate).toBeCloseTo(value);
      }
    }
  },
);
