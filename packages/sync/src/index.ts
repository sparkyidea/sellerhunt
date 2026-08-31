// biome-ignore lint/performance/noBarrelFile: externally consumed entrypoint
export {
  type DisconnectOutcome,
  disconnectChannel,
} from "./channels/disconnect";
export {
  type PullChannelInfoResult,
  pullChannelInfo,
} from "./channels/pull-channel-info";
export {
  type ReconcileChannelSubscriptionsResult,
  reconcileChannelSubscriptions,
} from "./channels/subscriptions";
export { recordSyncConflict, type SyncConflict } from "./conflicts";
export {
  type SyncClock,
  type SyncContext,
  type SyncCredentials,
  type SyncLogger,
  type SyncMarketplaceCredentials,
  systemClock,
} from "./context";
export {
  type ArchiveListingOutcome,
  archiveListing,
} from "./listings/archive";
export {
  type SyncChannelListingsResult,
  syncChannelListings,
} from "./listings/sync-channel-listings";
export {
  type UpsertListingsResult,
  upsertListings,
} from "./listings/upsert-listings";
export {
  applyOrderLineEffects,
  deriveEffectDeltas,
  type EffectDeltas,
  type OrderLineEffectInput,
  type OrderLineEffectOutcome,
} from "./orders/inventory";
export { findRelinkableOrders } from "./orders/relink";
export {
  type DefaultWarehouse,
  resolveDefaultWarehouse,
  upsertOrderShipments,
} from "./orders/shipments";
export {
  type SyncChannelOrdersResult,
  syncChannelOrders,
} from "./orders/sync-channel-orders";
export { type SyncOneOrderOutcome, syncOneOrder } from "./orders/sync-one";
export {
  type OrdersUpsertPorts,
  type UpsertOrdersInput,
  type UpsertOrdersResult,
  upsertOrders,
} from "./orders/upsert-orders";
export { getDomainWatermark, recordDomainRun } from "./orders/watermark";
export {
  adoptRemoteObject,
  claimOutboxRow,
  claimRecovery,
  confirmOutboxRow,
  failOutboxRow,
  listPendingRows,
  listRecoverableRows,
  markAwaitingConfirmation,
  markConflict,
  markSending,
  type OutboxClaim,
  OutboxTransitionError,
  type RecoveryOutcome,
  redispatchFailedRow,
  resetStaleClaims,
  resolveRecovery,
  startReconciliation,
  sweepSendingTimeouts,
} from "./outbox/fenced";
export { createOrdersUpsertPorts } from "./outbox/order-ports";
export {
  getInFlightOutboxRows,
  getProtectedEntityIds,
  type InFlightOutboxRow,
} from "./outbox/protection";
export {
  buildShipmentRemoteSnapshot,
  findMatchingFulfillment,
  type RemoteSnapshot,
  type ShippingFulfillment,
} from "./outbox/reconciliation";
export {
  type PushShipmentResult,
  pushShipment,
  type RecoverShipmentResult,
  recoverShipmentPush,
  type ShipmentPushPorts,
} from "./shipments/push-shipment";
export {
  computeIncrementalSince,
  openSyncWindow,
  type SyncWindow,
} from "./sync-window";
export {
  type ApiClientFactory,
  TokenAuthError,
  TokenManager,
} from "./token-manager";
export {
  type ResolvedCoords,
  type ResolveEventCoordsInput,
  resolveEventCoords,
} from "./tracking/resolve-event-coords";
export {
  type UpsertTrackingInput,
  type UpsertTrackingResult,
  upsertTracking,
} from "./tracking/upsert-tracking";
export type { SyncDomain } from "./types";
