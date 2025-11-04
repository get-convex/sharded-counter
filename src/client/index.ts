import type {
  DocumentByName,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
/**
 * A sharded counter is a map from string -> counter, where each counter can
 * be incremented or decremented atomically.
 */
export class ShardedCounter<ShardsKey extends string> {
  /**
   * A sharded counter is a map from string -> counter, where each counter can
   * be incremented or decremented.
   *
   * The counter is sharded into multiple documents to allow for higher
   * throughput of updates. The default number of shards is 16.
   *
   * - More shards => higher throughput of updates.
   * - Fewer shards => lower latency when querying the counter.
   *
   * @param options.shards The number of shards for each counter, for fixed
   *   keys.
   * @param options.defaultShards The number of shards for each counter, for
   *   keys not in `options.shards`.
   */
  constructor(
    private component: ComponentApi,
    options?: {
      shards?: Partial<Record<ShardsKey, number>>;
      defaultShards?: number;
    },
  ) {
    this.stickyShard = {};
    const defaultShards = options?.defaultShards;
    this.shardsForKey = (name: ShardsKey) => {
      const explicitShards = options?.shards?.[name];
      return explicitShards ?? defaultShards;
    };
  }

  private shardsForKey: (name: ShardsKey) => number | undefined;

  // Keep track of the shard for each key, so multiple mutations on the same key
  // will use the same shard.
  private stickyShard: Record<string, number>;

  /**
   * Increase the counter for key `name` by `count`.
   * If `count` is negative, the counter will decrease.
   *
   * @param name The key to update the counter for.
   * @param count The amount to increment the counter by. Defaults to 1.
   */
  async add<Name extends ShardsKey>(
    ctx: RunMutationCtx,
    name: Name,
    count: number = 1,
  ) {
    const shard = await ctx.runMutation(this.component.public.add, {
      name,
      count,
      shard: this.stickyShard?.[name],
      shards: this.shardsForKey(name),
    });
    this.stickyShard[name] = shard;
  }

  /**
   * Decrease the counter for key `name` by `count`.
   */
  async subtract<Name extends ShardsKey>(
    ctx: RunMutationCtx,
    name: Name,
    count: number = 1,
  ) {
    return this.add(ctx, name, -count);
  }

  /**
   * Increment the counter for key `name` by 1.
   */
  async inc<Name extends ShardsKey>(ctx: RunMutationCtx, name: Name) {
    return this.add(ctx, name, 1);
  }

  /**
   * Decrement the counter for key `name` by 1.
   */
  async dec<Name extends ShardsKey>(ctx: RunMutationCtx, name: Name) {
    return this.add(ctx, name, -1);
  }

  /**
   * Gets the counter for key `name`.
   *
   * NOTE: this reads from all shards. If used in a mutation, it will contend
   * with all mutations that update the counter for this key.
   */
  async count<Name extends ShardsKey>(ctx: RunQueryCtx, name: Name) {
    return ctx.runQuery(this.component.public.count, { name });
  }

  /**
   * Redistribute counts evenly across the counter's shards.
   *
   * If there were more shards for this counter at some point, those shards
   * will be removed.
   *
   * If there were fewer shards for this counter, or if the random distribution
   * of counts is uneven, the counts will be redistributed evenly.
   *
   * This operation reads and writes all shards, so it can cause contention if
   * called too often.
   */
  async rebalance<Name extends ShardsKey>(ctx: RunMutationCtx, name: Name) {
    await ctx.runMutation(this.component.public.rebalance, {
      name,
      shards: this.shardsForKey(name),
    });
  }

  /**
   * Clear the counter for key `name`.
   *
   * @param name The key to clear the counter for.
   */
  async reset<Name extends ShardsKey>(ctx: RunMutationCtx, name: Name) {
    await ctx.runMutation(this.component.public.reset, { name });
  }

  /**
   * Estimate the count of a counter by only reading from a subset of shards,
   * and extrapolating the total count.
   *
   * After a `rebalance`, or if there were a lot of data points to yield a
   * random distribution across shards, this should be a good approximation of
   * the total count. If there are few data points, which are not evenly
   * distributed across shards, this will be a poor approximation.
   *
   * Use this to reduce contention when reading the counter.
   */
  async estimateCount<Name extends ShardsKey>(
    ctx: RunQueryCtx,
    name: Name,
    readFromShards: number = 1,
  ) {
    return await ctx.runQuery(this.component.public.estimateCount, {
      name,
      shards: this.shardsForKey(name),
      readFromShards,
    });
  }
  /**
   * Returns an object with methods to update and query the counter for key
   * `name`. For fixed keys, you can call `counter.for("<key>")` to get methods
   * for updating or querying the counter for that key. Example:
   *
   * ```ts
   * const counter = new ShardedCounter(components.shardedCounter);
   * const beanCounter = counter.for("beans");
   * export const pushPapers = mutation({
   *  handler: async (ctx) => {
   *   await beanCounter.inc(ctx);
   *  },
   * });
   * ```
   */
  for<Name extends ShardsKey>(name: Name) {
    return {
      /**
       * Add `count` to the counter.
       */
      add: async (ctx: RunMutationCtx, count: number = 1) =>
        this.add(ctx, name, count),
      /**
       * Subtract `count` from the counter.
       */
      subtract: async (ctx: RunMutationCtx, count: number = 1) =>
        this.add(ctx, name, -count),
      /**
       * Increment the counter by 1.
       */
      inc: async (ctx: RunMutationCtx) => this.add(ctx, name, 1),
      /**
       * Decrement the counter by 1.
       */
      dec: async (ctx: RunMutationCtx) => this.add(ctx, name, -1),
      /**
       * Get the current value of the counter.
       *
       * NOTE: this reads from all shards. If used in a mutation, it will
       * contend with all mutations that update the counter for this key.
       */
      count: async (ctx: RunQueryCtx) => this.count(ctx, name),
      /**
       * Reset the counter for this key.
       */
      reset: async (ctx: RunMutationCtx) => this.reset(ctx, name),
      /**
       * Redistribute counts evenly across the counter's shards.
       *
       * This operation reads and writes all shards, so it can cause contention
       * if called too often.
       */
      rebalance: async (ctx: RunMutationCtx) => this.rebalance(ctx, name),
      /**
       * Estimate the counter by only reading from a subset of shards,
       * and extrapolating the total count.
       *
       * Use this to reduce contention when reading the counter.
       */
      estimateCount: async (ctx: RunQueryCtx, readFromShards: number = 1) =>
        this.estimateCount(ctx, name, readFromShards),
    };
  }
  trigger<Ctx extends RunMutationCtx, Name extends ShardsKey>(
    name: Name,
  ): Trigger<Ctx, GenericDataModel, TableNamesInDataModel<GenericDataModel>> {
    return async (ctx, change) => {
      if (change.operation === "insert") {
        await this.inc(ctx, name);
      } else if (change.operation === "delete") {
        await this.dec(ctx, name);
      }
    };
  }
}

/* Type utils follow */

export type Trigger<
  Ctx,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = (ctx: Ctx, change: Change<DataModel, TableName>) => Promise<void>;

export type Change<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = {
  id: GenericId<TableName>;
} & (
  | {
      operation: "insert";
      oldDoc: null;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: "update";
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: "delete";
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: null;
    }
);

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};
type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};
