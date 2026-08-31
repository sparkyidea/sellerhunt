import "server-only"; // <-- ensure this file cannot be imported from the client
import { env } from "@dashseller/env/app";
import type { AppRouter } from "@dashseller/trpc/routers/index";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import {
  createTRPCOptionsProxy,
  type TRPCQueryOptions,
} from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import superjson from "superjson";
import { makeQueryClient } from "./query-client";

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

// RSC tRPC calls go over HTTP to apps/api, forwarding the incoming request's
// Cookie header so Better Auth resolves the same session as the browser.
// This keeps server-side credentials (DB, geo, marketplace, R2, auth secret,
// etc.) out of the Next process — only NEXT_PUBLIC_* are needed here.
const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${env.NEXT_PUBLIC_API_URL}/trpc`,
      transformer: superjson,
      headers: async () => {
        const cookie = (await headers()).get("cookie");
        return cookie ? { cookie } : {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient: getQueryClient,
});

// Awaitable prefetch that surfaces tRPC errors instead of silently caching
// them. react-query's prefetchQuery swallows rejections by design (so a
// failed warm-up doesn't crash the page) — but for RSC pages that need the
// data to render, that's the wrong default: the procedure would throw,
// the prefetch would absorb it, and the user would see a generic
// ErrorBoundary fallback after a wasted server render.
//
// Behavior:
//   - NOT_FOUND → Next.js `notFound()` (swaps in the 404 route).
//   - other errors → rethrown, hits `error.tsx`.
//   - success → query is cached and ready for useSuspenseQuery hydration.
//
// Branches on `queryKey[1].type` set by tRPC's `queryOptions` vs
// `infiniteQueryOptions` builders. Pair with `useSuspenseQuery` /
// `useSuspenseInfiniteQuery` on the client using the same builder call.
// biome-ignore lint/suspicious/noExplicitAny: tRPC's TRPCQueryOptions is the canonical generic constraint here; narrowing isn't expressible
export async function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T
) {
  const queryClient = getQueryClient();
  if (queryOptions.queryKey[1]?.type === "infinite") {
    // biome-ignore lint/suspicious/noExplicitAny: prefetchInfiniteQuery type doesn't narrow from TRPCQueryOptions union
    await queryClient.prefetchInfiniteQuery(queryOptions as any);
  } else {
    await queryClient.prefetchQuery(queryOptions);
  }
  const state = queryClient.getQueryState(queryOptions.queryKey);
  if (
    state?.error instanceof TRPCClientError &&
    state.error.data?.code === "NOT_FOUND"
  ) {
    notFound();
  }
  if (state?.error) {
    throw state.error;
  }
}

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}
