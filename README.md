# Convex Sharded Counter Component

[![npm version](https://badge.fury.io/js/@convex-dev%2Fsharded-counter.svg)](https://badge.fury.io/js/@convex-dev%2Fsharded-counter)

**Note: Convex Components are currently in beta.**

<!-- START: Include on https://convex.dev/components -->

This component adds counters to Convex. It acts as a key-value store from
string to number, with sharding to increase throughput when updating values.

Since it's built on Convex, everything is automatically consistent, reactive,
and cached.

For example, if you want to display
[one million checkboxes](https://en.wikipedia.org/wiki/One_Million_Checkboxes)
[on your Convex site](https://www.youtube.com/watch?v=LRUWplYoejQ), you want to
count the checkboxes in real-time while allowing a lot of the boxes to change in
parallel.

More generally, whenever you have a counter that is changing frequently, you
can use this component to keep track of it efficiently.

```ts
export const checkBox = mutation({
  args: { i: v.number() },
  handler: async (ctx, args) => {
    const checkbox = await ctx.db
      .query("checkboxes")
      .withIndex("i", (q) => q.eq("i", args.i))
      .unique();
    if (!checkbox.isChecked) {
      await ctx.db.patch(checkbox._id, { isChecked: true });

      // Here we increment the number of checkboxes.
      await numCheckboxes.inc(ctx);
    }
  },
});
export const getCount = query({
  args: {},
  handler: async (ctx, _args) => {
    return await numCheckboxes.count(ctx);
  },
});
```

This relies on the assumption that you need to frequently modify the counter,
but only need to read its value from a query, or infrequently in a mutation.
If you read the count every time you modify it, you lose the sharding benefit.

## Pre-requisite: Convex

You'll need an existing Convex project to use the component.
Convex is a hosted backend platform, including a database, serverless functions,
and a ton more you can learn about [here](https://docs.convex.dev/get-started).

Run `npm create convex` or follow any of the [quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

First, install the component package:

```ts
npm install @convex-dev/sharded-counter
```

Then, create a `convex.config.ts` file in your app's `convex/` folder and install the
component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";

const app = defineApp();
app.use(shardedCounter);

export default app;
```

Finally, create a new `ShardedCounter` within your `convex/` folder, and point it to
the installed component.

```ts
import { components } from "./_generated/api";
import { ShardedCounter } from "@convex-dev/sharded-counter";

const counter = new ShardedCounter(components.shardedCounter);
```

## Updating and reading counters

Once you have a `ShardedCounter`, there are a few methods you can use to update
the counter for a key in a mutation or action.

```ts
await counter.add(ctx, "checkboxes"); // increment
await counter.add(ctx, "checkboxes", -5); // decrement by 5

const numCheckboxes = counter.for("checkboxes");
await numCheckboxes.inc(ctx); // increment
await numCheckboxes.dec(ctx); // decrement
await numCheckboxes.add(ctx, 5); // add 5
await numCheckboxes.subtract(ctx, 5); // subtract 5
```

And you can read the counter's value in a query, mutation, or action.

```ts
await counter.count(ctx, "checkboxes");
await numCheckboxes.count(ctx);
```

See more example usage in [example.ts](./example/convex/example.ts).

## Sharding the counter

When a single document is modified by two mutations at the same time, the
mutations slow down to achieve
[serializable results](https://docs.convex.dev/database/advanced/occ).

To achieve high throughput, the ShardedCounter distributes counts across
multiple documents, called "shards". Increments and decrements update a random
shard, while queries of the total count read from all shards.

1. More shards => greater throughput when incrementing or decrementing.
2. Fewer shards => better latency when querying the count.

You can set the number of shards when initializing the ShardedCounter, either
setting it specially for each key:

```ts
const counter = new ShardedCounter(components.shardedCounter, {
  shards: { checkboxes: 100 }, // 100 shards for the key "checkboxes"
});
```

Or by setting a default that applies to all keys not specified in `shards`:

```ts
const counter = new ShardedCounter(components.shardedCounter, {
  shards: { checkboxes: 100 },
  defaultShards: 20,
});
```

The default number of shards if none is specified is 16.

Note your keys can be a subtype of string. e.g. if you want to store a count of
friends for each user, and you don't care about throughput for a single user,
you would declare ShardedCounter like so:

```ts
const friendCounts = new ShardedCounter<Record<Id<"users">, number>>(
  components.shardedCounter,
  { defaultShards: 1 },
);

// Decrement a user's friend count by 1
await friendsCount.add(ctx, userId, -1);
```

## Backfilling an existing count

If you want to count items like documents in a table, you may already have
documents before installing the ShardedCounter component, and these should be
accounted for.

The easy version of this is to calculate the value once and add that value, if
there aren't active requests happening. You can also periodically re-calculate
the value and update the counter, if there aren't in-flight requests.

The tricky part is handling requests while doing the calculation: making sure to
merge active updates to counts with old values that you want to backfill.

See example code at the bottom of
[example/convex/example.ts](example/convex/example.ts).

Walkthrough of steps:

1. Create `backfillCursor` table in schema.ts
2. Create a new document in this table, with fields
   `{ creationTime: 0, id: "", isDone: false }`
3. Wherever you want to update a counter based on a document changing, wrap the
   update in a conditional, so it only gets updated if the backfill has processed
   that document. In the example, you would be changing `insertUserBeforeBackfill`
   to be implemented as `insertUserDuringBackfill`.
4. Define backfill functions similar to `backfillUsers` and `backfillUsersBatch`
5. Call `backfillUsersBatch` from the dashboard.
6. Remove the conditional when updating counters. In the example, you would be
   changing `insertUserDuringBackfill` to be implemented as
   `insertUserAfterBackfill`.
7. Delete the `backfillCursor` table.

<!-- END: Include on https://convex.dev/components -->
