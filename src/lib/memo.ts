/**
 * Remembers the last call: called again with the same arguments, by identity, it returns
 * the same result. For expensive derived data in a view, whose inputs are query results
 * that keep their identity until they change.
 */
export const memoizeLast = <Args extends ReadonlyArray<unknown>, A>(fn: (...args: Args) => A) => {
  let last: { args: Args; result: A } | undefined;
  return (...args: Args): A => {
    if (
      last &&
      last.args.length === args.length &&
      last.args.every((arg, i) => Object.is(arg, args[i]))
    ) {
      return last.result;
    }
    const result = fn(...args);
    last = { args, result };
    return result;
  };
};
