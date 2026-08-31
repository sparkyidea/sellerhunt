/**
 * Envelope eBay POSTs to the destination endpoint. `data` is topic-specific
 * — handlers narrow it per topic; unknown topics keep the raw payload in the
 * webhook inbox for later inspection.
 */
export interface EbayNotificationEnvelope {
  metadata?: {
    topic?: string;
    schemaVersion?: string;
    deprecated?: boolean;
  };
  notification?: {
    /** Unique per event — the webhook-inbox idempotency key. */
    notificationId?: string;
    eventDate?: string;
    publishDate?: string;
    publishAttemptCount?: number;
    data?: Record<string, unknown>;
  };
}

/** `notification.data` for MARKETPLACE_ACCOUNT_DELETION. */
export interface EbayAccountDeletionData {
  eiasToken?: string;
  userId?: string;
  username?: string;
}
