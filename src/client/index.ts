import {
  Expand,
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { GenericId } from "convex/values";
import { api } from "../component/_generated/api";

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
    public component: UseApi<typeof api>,
    public options?: { shards?: Record<ShardsKey, number>; defaultShards?: number }
  ) {}
  /**
   * Increase the counter for key `name` by `count`.
   * If `count` is negative, the counter will decrease.
   * 
   * @param name The key to update the counter for.
   * @param count The amount to increment the counter by. Defaults to 1.
   */
  async add<Name extends string = ShardsKey>(
    ctx: RunMutationCtx,
    name: Name,
    count: number = 1
  ) {
    return ctx.runMutation(this.component.public.add, {
      name,
      count,
      shards: this.shardsForKey(name),
    });
  }
  /**
   * Decrease the counter for key `name` by `count`.
   */
  async subtract<Name extends string = ShardsKey>(
    ctx: RunMutationCtx,
    name: Name,
    count: number = 1
  ) {
    return this.add(ctx, name, -count);
  }
  /**
   * Increment the counter for key `name` by 1.
   */
  async inc<Name extends string = ShardsKey>(ctx: RunMutationCtx, name: Name) {
    return this.add(ctx, name, 1);
  }
  /**
   * Decrement the counter for key `name` by 1.
   */
  async dec<Name extends string = ShardsKey>(ctx: RunMutationCtx, name: Name) {
    return this.add(ctx, name, -1);
  }
  /**
   * Gets the counter for key `name`.
   *
   * NOTE: this reads from all shards. If used in a mutation, it will contend
   * with all mutations that update the counter for this key.
   */
  async count<Name extends string = ShardsKey>(
    ctx: RunQueryCtx,
    name: Name
  ) {
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
  async rebalance<Name extends string = ShardsKey>(
    ctx: RunMutationCtx,
    name: Name,
  ) {
    await ctx.runMutation(this.component.public.rebalance, {
      name,
      shards: this.shardsForKey(name),
    });
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
  async estimateCount<Name extends string = ShardsKey>(
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
  for<Name extends string = ShardsKey>(name: Name) {
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
  private shardsForKey<Name extends string = ShardsKey>(name: Name) {
    const explicitShards = this.options?.shards?.[name as string as ShardsKey];
    return explicitShards ?? this.options?.defaultShards;
  }
}

/* Type utils follow */

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};
type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

export type OpaqueIds<T> =
  T extends GenericId<infer _T>
    ? string
    : T extends (infer U)[]
      ? OpaqueIds<U>[]
      : T extends object
        ? { [K in keyof T]: OpaqueIds<T[K]> }
        : T;

export type UseApi<API> = Expand<{
  [mod in keyof API]: API[mod] extends FunctionReference<
    infer FType,
    "public",
    infer FArgs,
    infer FReturnType,
    infer FComponentPath
  >
    ? FunctionReference<
        FType,
        "internal",
        OpaqueIds<FArgs>,
        OpaqueIds<FReturnType>,
        FComponentPath
      >
    : UseApi<API[mod]>;
}>;
