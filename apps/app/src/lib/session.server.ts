import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { authClient } from "./auth-client";

// RSC session lookup that goes over HTTP to apps/api with the incoming
// request's cookie, like the tRPC server client. Only NEXT_PUBLIC_* env is
// needed here — no auth secret, no DB.
export const getServerSession = cache(async () => {
  const cookie = (await headers()).get("cookie");
  const { data } = await authClient.getSession({
    fetchOptions: { headers: cookie ? { cookie } : {} },
  });
  return data;
});
