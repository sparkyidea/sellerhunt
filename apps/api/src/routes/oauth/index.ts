import { Hono } from "hono";
import marketplaceOAuth from "./marketplace";

const oauthRoutes = new Hono();

// Mount OAuth routes
oauthRoutes.route("/", marketplaceOAuth);

// Future OAuth integrations can be added here:
// oauthRoutes.route("/payment", paymentOAuth);
// oauthRoutes.route("/shipping", shippingOAuth);

export default oauthRoutes;
