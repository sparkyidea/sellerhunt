import type eBayApi from "ebay-api";
import type { Channel } from "../../../types";
import { mapChannel } from "./mapper/map-channel";

/**
 * Fetch eBay user information including store/business name
 * Uses the Commerce Identity API for reliable user details
 */
export async function getChannel(client: eBayApi): Promise<Channel> {
  const response = await client.commerce.identity.getUser();
  return mapChannel(response);
}
