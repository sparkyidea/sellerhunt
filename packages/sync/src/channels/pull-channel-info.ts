import { channel } from "@dashseller/db/schema";
import type { ApiClient } from "@dashseller/marketplace/types";
import { eq } from "drizzle-orm";
import type { SyncContext } from "../context";

export interface PullChannelInfoResult {
  displayName: string;
  reference: string;
}

/**
 * Fetch seller/store info from the marketplace and refresh the channel row.
 */
export async function pullChannelInfo(
  ctx: SyncContext,
  params: { apiClient: ApiClient; channelId: string }
): Promise<PullChannelInfoResult> {
  const info = await params.apiClient.getChannel();

  await ctx.db
    .update(channel)
    .set({
      displayName: info.displayName,
      reference: info.reference,
      updatedAt: new Date(),
    })
    .where(eq(channel.id, params.channelId));

  ctx.logger.info("Updated channel info", {
    channelId: params.channelId,
    reference: info.reference,
    displayName: info.displayName,
  });

  return { displayName: info.displayName, reference: info.reference };
}
