import { authServer } from "@dashseller/auth/auth-server";
import { Hono } from "hono";

const authRoutes = new Hono();

// Better-auth handler for all auth routes
authRoutes.on(["POST", "GET"], "/*", (c) => authServer.handler(c.req.raw));

export default authRoutes;
