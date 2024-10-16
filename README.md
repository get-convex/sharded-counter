# Convex Sharded Counter Component

[![npm version](https://badge.fury.io/js/@convex-dev%2Fsharded-counter.svg)](https://badge.fury.io/js/@convex-dev%2Fsharded-counter)

This component adds counters to Convex. It acts as a key-value store from
string to number, with sharding to increase throughput when updating values.

Since it's built on Convex, everything is automatically consistent, reactive,
and cached.

For example, if you want to display
[one million checkboxes](https://en.wikipedia.org/wiki/One_Million_Checkboxes)
[on your Convex site](https://www.youtube.com/watch?v=LRUWplYoejQ), you want to
count the checkboxes in real-time while allowing lots of the boxes to change in
parallel.

More generally, whenever you have a counter that is changing frequently, you
can use this component to keep track of it efficiently.

```ts
export const checkBox = mutation({
  args: {i: v.number()},
  handler: async (ctx, args) => {
    const checkbox = await ctx.db.query("checkboxes")
      .withIndex("i", q=>q.eq("i", args.i)).unique();
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
import { ShardedCounter } from "@convex-dev/counter";

const counter = new ShardedCounter(components.counter, {
  ...options
});
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
```

## Backfilling an existing count

If you want to count items like documents in a table, you may already have
documents before installing the ShardedCounter component, and these should be
accounted for.

The tricky part is making sure to merge active updates to counts with old
values that you want to backfill.

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

# 🧑‍🏫 What is Convex?

[Convex](https://convex.dev) is a hosted backend platform with a
built-in database that lets you write your
[database schema](https://docs.convex.dev/database/schemas) and
[server functions](https://docs.convex.dev/functions) in
[TypeScript](https://docs.convex.dev/typescript). Server-side database
[queries](https://docs.convex.dev/functions/query-functions) automatically
[cache](https://docs.convex.dev/functions/query-functions#caching--reactivity) and
[subscribe](https://docs.convex.dev/client/react#reactivity) to data, powering a
[realtime `useQuery` hook](https://docs.convex.dev/client/react#fetching-data) in our
[React client](https://docs.convex.dev/client/react). There are also clients for
[Python](https://docs.convex.dev/client/python),
[Rust](https://docs.convex.dev/client/rust),
[ReactNative](https://docs.convex.dev/client/react-native), and
[Node](https://docs.convex.dev/client/javascript), as well as a straightforward
[HTTP API](https://docs.convex.dev/http-api/).

The database supports
[NoSQL-style documents](https://docs.convex.dev/database/document-storage) with
[opt-in schema validation](https://docs.convex.dev/database/schemas),
[relationships](https://docs.convex.dev/database/document-ids) and
[custom indexes](https://docs.convex.dev/database/indexes/)
(including on fields in nested objects).

The
[`query`](https://docs.convex.dev/functions/query-functions) and
[`mutation`](https://docs.convex.dev/functions/mutation-functions) server functions have transactional,
low latency access to the database and leverage our
[`v8` runtime](https://docs.convex.dev/functions/runtimes) with
[determinism guardrails](https://docs.convex.dev/functions/runtimes#using-randomness-and-time-in-queries-and-mutations)
to provide the strongest ACID guarantees on the market:
immediate consistency,
serializable isolation, and
automatic conflict resolution via
[optimistic multi-version concurrency control](https://docs.convex.dev/database/advanced/occ) (OCC / MVCC).

The [`action` server functions](https://docs.convex.dev/functions/actions) have
access to external APIs and enable other side-effects and non-determinism in
either our
[optimized `v8` runtime](https://docs.convex.dev/functions/runtimes) or a more
[flexible `node` runtime](https://docs.convex.dev/functions/runtimes#nodejs-runtime).

Functions can run in the background via
[scheduling](https://docs.convex.dev/scheduling/scheduled-functions) and
[cron jobs](https://docs.convex.dev/scheduling/cron-jobs).

Development is cloud-first, with
[hot reloads for server function](https://docs.convex.dev/cli#run-the-convex-dev-server) editing via the
[CLI](https://docs.convex.dev/cli),
[preview deployments](https://docs.convex.dev/production/hosting/preview-deployments),
[logging and exception reporting integrations](https://docs.convex.dev/production/integrations/),
There is a
[dashboard UI](https://docs.convex.dev/dashboard) to
[browse and edit data](https://docs.convex.dev/dashboard/deployments/data),
[edit environment variables](https://docs.convex.dev/production/environment-variables),
[view logs](https://docs.convex.dev/dashboard/deployments/logs),
[run server functions](https://docs.convex.dev/dashboard/deployments/functions), and more.

There are built-in features for
[reactive pagination](https://docs.convex.dev/database/pagination),
[file storage](https://docs.convex.dev/file-storage),
[reactive text search](https://docs.convex.dev/text-search),
[vector search](https://docs.convex.dev/vector-search),
[https endpoints](https://docs.convex.dev/functions/http-actions) (for webhooks),
[snapshot import/export](https://docs.convex.dev/database/import-export/),
[streaming import/export](https://docs.convex.dev/production/integrations/streaming-import-export), and
[runtime validation](https://docs.convex.dev/database/schemas#validators) for
[function arguments](https://docs.convex.dev/functions/args-validation) and
[database data](https://docs.convex.dev/database/schemas#schema-validation).

Everything scales automatically, and it’s [free to start](https://www.convex.dev/plans).
