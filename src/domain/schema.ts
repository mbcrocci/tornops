import { Schema } from "effect";

/**
 * A Schema for data the app takes as it comes, such as a Torn API payload whose shape the
 * fetcher already checks. It is typed as `A` and encodes to itself, so it still travels
 * through the query cache and history snapshots as plain JSON.
 */
export const Opaque = <A>(): Schema.Codec<A, A> => Schema.Any as unknown as Schema.Codec<A, A>;
