/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as public from "../public.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  public: typeof public;
}>;
export type Mounts = {
  public: {
    add: FunctionReference<
      "mutation",
      "public",
      { count: number; name: string; shard?: number; shards?: number },
      number
    >;
    count: FunctionReference<"query", "public", { name: string }, number>;
    estimateCount: FunctionReference<
      "query",
      "public",
      { name: string; readFromShards?: number; shards?: number },
      any
    >;
    rebalance: FunctionReference<
      "mutation",
      "public",
      { name: string; shards?: number },
      any
    >;
  };
};
// For now fullApiWithMounts is only fullApi which provides
// jump-to-definition in component client code.
// Use Mounts for the same type without the inference.
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
