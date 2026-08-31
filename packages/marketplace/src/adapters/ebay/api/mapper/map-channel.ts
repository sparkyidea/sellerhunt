import type { Channel } from "../../../../types";

/**
 * Map eBay Commerce Identity API user response to Channel
 */
export function mapChannel(response: {
  userId: string;
  username: string;
}): Channel {
  return {
    reference: response.userId,
    displayName: response.username,
  };
}
