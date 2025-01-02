import {
  internalMutation,
  query,
  mutation,
  internalAction,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { v } from "convex/values";
import { Migrations } from "@convex-dev/migrations";
import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";

/// Example of ShardedCounter initialization.

const counter = new ShardedCounter(components.shardedCounter, {
  shards: { beans: 10, users: 3 },
});
const numUsers = counter.for("users");

/// Other libraries the example will be using to tie `counter` to tables.

// See https://www.npmjs.com/package/@convex-dev/migrations for more on this
// component.
const migrations = new Migrations(components.migrations);

// See https://stack.convex.dev/triggers for more on this library.
const triggers = new Triggers<DataModel>();
triggers.register("users", counter.trigger("users"));
export const mutationWithTriggers = customMutation(
  mutation,
  customCtx(triggers.wrapDB),
);

/// Example functions using ShardedCounter.

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

export const rebalanceUsers = mutation({
  args: {},
  handler: async (ctx, _args) => {
    await numUsers.rebalance(ctx);
  },
});

export const resetUsers = mutation({
  args: {},
  handler: async (ctx, _args) => {
    await numUsers.reset(ctx);
  },
});

export const estimateUserCount = query({
  args: {},
  handler: async (ctx, _args) => {
    return await numUsers.estimateCount(ctx);
  },
});

export const usingClient = internalMutation({
  args: {},
  handler: async (ctx, _args) => {
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
    await ctx.runMutation(components.shardedCounter.public.add, {
      name: "pennies",
      count: 250,
    });
    await ctx.runMutation(components.shardedCounter.public.add, {
      name: "beans",
      count: 3,
      shards: 100,
    });
    const count = await ctx.runQuery(components.shardedCounter.public.count, {
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

export const insertUserAfterBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.insert("users", { name: "Alice" });
    await counter.add(ctx, "users");
  },
});

export const backfillOldUsersBatch = migrations.define({
  table: "users",
  // Filter to before the timestamp when counts started getting updated
  // in the live path.
  customRange: (query) =>
    query.withIndex("by_creation_time", (q) =>
      q.lt("_creationTime", Number(new Date("2024-10-01T16:20:00.000Z"))),
    ),
  async migrateOne(ctx, _doc) {
    await counter.add(ctx, "users");
  },
});
export const backfillOldUsers = migrations.runner();

export const insertUserDuringBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Alice" });

    const userDoc = (await ctx.db.get(id))!;
    const backfillCursor = await ctx.db.query("backfillCursor").unique();
    if (
      !backfillCursor ||
      backfillCursor.isDone ||
      userDoc._creationTime < backfillCursor.creationTime ||
      (userDoc._creationTime === backfillCursor.creationTime &&
        userDoc._id <= backfillCursor.id)
    ) {
      await counter.add(ctx, "users");
    }
  },
});

export const backfillUsersBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const backfillCursor = await ctx.db.query("backfillCursor").unique();
    if (!backfillCursor || backfillCursor.isDone) {
      return { isDone: true };
    }

    const { page, isDone, continueCursor } = await ctx.db
      .query("users")
      .paginate({
        cursor: args.cursor,
        numItems: 3,
      });
    for (const user of page) {
      await counter.add(ctx, "users");
      await ctx.db.patch(backfillCursor._id, {
        isDone,
        creationTime: user._creationTime,
        id: user._id,
      });
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
        internal.example.backfillUsersBatch,
        { cursor },
      );
      if (isDone) {
        break;
      }
      const newCursor: string = continueCursor!;
      cursor = newCursor;
    }
  },
});

export const insertUserWithTrigger = mutationWithTriggers({
  args: {},
  handler: async (ctx, _args) => {
    await ctx.db.insert("users", { name: "Alice" });
  },
});
