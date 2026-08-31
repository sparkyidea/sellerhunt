import { authServer } from "@dashseller/auth/auth-server";
import { createContext } from "@dashseller/trpc/context";
import { appRouter } from "@dashseller/trpc/routers/index";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";

const trpcRoutes = new Hono();

trpcRoutes.use(
  "/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext(context.req.raw.headers, (headers) =>
        authServer.api.getSession({ headers })
      );
    },
  })
);

export default trpcRoutes;
