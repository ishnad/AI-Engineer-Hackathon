/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as calls from "../calls.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as liveStats from "../liveStats.js";
import type * as personas from "../personas.js";
import type * as proposedPersonas from "../proposedPersonas.js";
import type * as seed from "../seed.js";
import type * as signatures from "../signatures.js";
import type * as weeklyRecap from "../weeklyRecap.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  calls: typeof calls;
  crons: typeof crons;
  http: typeof http;
  liveStats: typeof liveStats;
  personas: typeof personas;
  proposedPersonas: typeof proposedPersonas;
  seed: typeof seed;
  signatures: typeof signatures;
  weeklyRecap: typeof weeklyRecap;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
