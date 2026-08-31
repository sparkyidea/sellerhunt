import { Hono } from "hono";
import ebayOAuth from "./ebay";
import shopifyOAuth from "./shopify";

const marketplaceOAuth = new Hono();

marketplaceOAuth.route("/ebay", ebayOAuth);
marketplaceOAuth.route("/shopify", shopifyOAuth);

export default marketplaceOAuth;
