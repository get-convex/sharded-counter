/// Example of a hierarchical counter.
/// This is the same as a regular sharded counter (see example.ts), but the keys
/// are tuples instead of strings.
/// You cannot accumulate across a prefix of the tuple; if you want to do that,
/// use an additional counter for each prefix, or use the Aggregate component:
/// https://www.npmjs.com/package/@convex-dev/aggregate

import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const nestedCounter = new ShardedCounter<[Id<"users">, "follows" | "followers"]>(
  components.nestedCounter,
  { defaultShards: 3 },
);

export const addFollower = mutation({
  args: { follower: v.id("users"), followee: v.id("users") },
  handler: async (ctx, { follower, followee }) => {
    await nestedCounter.inc(ctx, [followee, "followers"]);
    await nestedCounter.inc(ctx, [follower, "follows"]);
  },
});

export const countFollows = query({
  args: { user: v.id("users") },
  handler: async (ctx, { user }) => {
    return await nestedCounter.count(ctx, [user, "follows"]);
  },
});

export const countFollowers = query({
  args: { user: v.id("users") },
  handler: async (ctx, { user }) => {
    return await nestedCounter.count(ctx, [user, "followers"]);
  },
});
