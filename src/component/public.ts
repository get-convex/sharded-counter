import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const DEFAULT_SHARD_COUNT = 16;

export const add = mutation({
  args: {
    name: v.string(),
    count: v.number(),
    shard: v.optional(v.number()),
    shards: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const shard =
      args.shard ??
      Math.floor(Math.random() * (args.shards ?? DEFAULT_SHARD_COUNT));
    const counter = await ctx.db
      .query("counters")
      .withIndex("name", (q) => q.eq("name", args.name).eq("shard", shard))
      .unique();
    if (counter) {
      await ctx.db.patch(counter._id, {
        value: counter.value + args.count,
      });
    } else {
      await ctx.db.insert("counters", {
        name: args.name,
        value: args.count,
        shard,
      });
    }
    return shard;
  },
});

export const count = query({
  args: { name: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const counters = await ctx.db
      .query("counters")
      .withIndex("name", (q) => q.eq("name", args.name))
      .collect();
    return counters.reduce((sum, counter) => sum + counter.value, 0);
  },
});

export const rebalance = mutation({
  args: { name: v.string(), shards: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const counters = await ctx.db
      .query("counters")
      .withIndex("name", (q) => q.eq("name", args.name))
      .collect();
    const count = counters.reduce((sum, counter) => sum + counter.value, 0);
    const shardCount = args.shards ?? DEFAULT_SHARD_COUNT;
    const value = count / shardCount;
    for (let i = 0; i < shardCount; i++) {
      const shard = counters.find((c) => c.shard === i);
      if (shard) {
        await ctx.db.patch(shard._id, { value });
      } else {
        await ctx.db.insert("counters", {
          name: args.name,
          value,
          shard: i,
        });
      }
    }
    const toDelete = counters.filter((c) => c.shard >= shardCount);
    for (const counter of toDelete) {
      await ctx.db.delete(counter._id);
    }
  },
});

export const reset = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db
      .query("counters")
      .withIndex("name", (q) => q.eq("name", args.name))
      .collect()
      .then((counters) =>
        Promise.all(counters.map((c) => ctx.db.delete(c._id))),
      );
  },
});

export const estimateCount = query({
  args: {
    name: v.string(),
    readFromShards: v.optional(v.number()),
    shards: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const shardCount = args.shards ?? DEFAULT_SHARD_COUNT;
    const readFromShards = Math.min(
      Math.max(1, args.readFromShards ?? 1),
      shardCount,
    );
    const shards = shuffle(
      Array.from({ length: shardCount }, (_, i) => i),
    ).slice(0, readFromShards);
    let readCount = 0;
    for (const shard of shards) {
      const counter = await ctx.db
        .query("counters")
        .withIndex("name", (q) => q.eq("name", args.name).eq("shard", shard))
        .unique();
      if (counter) {
        readCount += counter.value;
      }
    }
    return (readCount * shardCount) / readFromShards;
  },
});

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
