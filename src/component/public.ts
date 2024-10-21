import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const DEFAULT_SHARD_COUNT = 16;

export const add = mutation({
  args: {
    name: v.string(),
    count: v.number(),
    shards: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const shard = Math.floor(Math.random() * (args.shards ?? DEFAULT_SHARD_COUNT));
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
    const baseCount = Math.floor(count / shardCount);
    let remainder = count - (baseCount * shardCount);
    const extraCounts = [];
    while (Math.abs(remainder) > 0) {
      const nextExtra = Math.abs(remainder) >= 1 ? Math.sign(remainder) : remainder;
      extraCounts.push(nextExtra);
      remainder -= nextExtra;
    }
    for (let i = 0; i < shardCount; i++) {
      const value = baseCount + (i < extraCounts.length ? extraCounts[i] : 0);
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

export const estimateCount = query({
  args: {
    name: v.string(),
    readFromShards: v.optional(v.number()),
    shards: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const shardCount = args.shards ?? DEFAULT_SHARD_COUNT;
    const readFromShards = Math.min(Math.max(1, args.readFromShards ?? 1), shardCount);
    const shards = shuffle(Array.from({ length: shardCount }, (_, i) => i)).slice(0, readFromShards);
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
