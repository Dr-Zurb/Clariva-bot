import { dehydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";

/** Dehydrate only successful queries matching `predicate` (np-08 PHI guard). */
export function dehydrateMatchingQueries(
  client: QueryClient,
  predicate: (query: Query) => boolean,
): DehydratedState {
  return dehydrate(client, {
    shouldDehydrateQuery: (query) =>
      query.state.status === "success" && predicate(query),
  });
}

export function queryKeyStartsWith(
  query: Query,
  prefix: readonly unknown[],
): boolean {
  return prefix.every((segment, index) => query.queryKey[index] === segment);
}
