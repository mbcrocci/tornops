import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";

// Reading a query's result the way the views need it: the latest data even while a
// refetch runs or after one fails, when it arrived, and why it failed.

/** The latest data: the current success, or the one before a failure. */
export const dataOf = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | undefined => {
  if (AsyncResult.isSuccess(result)) return result.value;
  if (AsyncResult.isFailure(result) && Option.isSome(result.previousSuccess)) {
    return result.previousSuccess.value.value;
  }
  return undefined;
};

/** When the latest data arrived, in milliseconds, or 0 before any did. */
export const updatedAt = <A, E>(result: AsyncResult.AsyncResult<A, E>): number => {
  if (AsyncResult.isSuccess(result)) return result.timestamp;
  if (AsyncResult.isFailure(result) && Option.isSome(result.previousSuccess)) {
    return result.previousSuccess.value.timestamp;
  }
  return 0;
};

/** The typed error of a failed fetch. */
export const errorOf = <A, E>(result: AsyncResult.AsyncResult<A, E>): E | undefined =>
  Option.getOrUndefined(AsyncResult.error(result));

/** A fetch is running, the first or a refetch. */
export const isFetching = <A, E>(result: AsyncResult.AsyncResult<A, E>): boolean => result.waiting;

/** Nothing has arrived yet and a fetch is on its way. */
export const isPending = <A, E>(result: AsyncResult.AsyncResult<A, E>): boolean =>
  AsyncResult.isInitial(result) && result.waiting;
