import { internalMutation, query, mutation, internalAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { Counter } from "@convex-dev/counter";
import { v } from "convex/values";

const counter = new Counter(components.counter, {
  shards: { beans: 10, users: 100 },
});
const numUsers = counter.for("users");

export const addOne = mutation({
  args: {},
  handler: async (ctx, _args) => {
    await numUsers.inc(ctx);
  },
});

export const getCount = query({
  args: {},
  handler: async (ctx, _args) => {
    return await numUsers.count(ctx);
  },
});

export const usingClient = internalMutation({
  args: {},
  handler: async (ctx, _args) => {
    await counter.add(ctx, "accomplishments");
    await counter.add(ctx, "beans", 2);
    const count = await counter.count(ctx, "beans");
    return count;
  },
});

export const usingFunctions = internalMutation({
  args: {},
  handler: async (ctx, _args) => {
    await numUsers.inc(ctx);
    await numUsers.inc(ctx);
    await numUsers.dec(ctx);
    return numUsers.count(ctx);
  },
});

export const directCall = internalMutation({
  args: {},
  handler: async (ctx, _args) => {
    await ctx.runMutation(components.counter.public.add, {
      name: "pennies",
      count: 250,
    });
    await ctx.runMutation(components.counter.public.add, {
      name: "beans",
      count: 3,
      shards: 100,
    });
    const count = await ctx.runQuery(components.counter.public.count, {
      name: "beans",
    });
    return count;
  },
});

export const insertUserBeforeBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.insert("users", { name: "Alice" });
  },
});

export const insertUserDuringBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Alice" });

    const userDoc = (await ctx.db.get(id))!;
    const backfillCursor = await ctx.db.query("backfillCursor").unique();
    if (!backfillCursor || backfillCursor.isDone
        || userDoc._creationTime < backfillCursor.creationTime
        || (userDoc._creationTime === backfillCursor.creationTime && userDoc._id <= backfillCursor.id)) {
      await counter.add(ctx, "users");
    }
  },
});

export const backfillUsersBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null())},
  handler: async (ctx, args) => {
    const backfillCursor = await ctx.db.query("backfillCursor").unique();
    if (!backfillCursor || backfillCursor.isDone) {
      return { isDone: true };
    }

    const { page, isDone, continueCursor } = await ctx.db.query("users")
      .paginate({
        cursor: args.cursor,
        numItems: 3,
      });
    for (const user of page) {
      await counter.add(ctx, "users");
      await ctx.db.patch(backfillCursor._id, { isDone, creationTime: user._creationTime, id: user._id });
    }
    return { isDone, continueCursor };
  },
});

export const backfillUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    let cursor: string | null = null;
    while (true) {
      const { isDone, continueCursor } = await ctx.runMutation(
        internal.example.backfillUsersBatch, { cursor },
      );
      if (isDone) {
        break;
      }
      const newCursor: string = continueCursor!;
      cursor = newCursor;
    }
  },
});

export const insertUserAfterBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.insert("users", { name: "Alice" });
    await counter.add(ctx, "users");
  },
});