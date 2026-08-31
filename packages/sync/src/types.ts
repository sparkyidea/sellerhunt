import type { syncDomainEnum } from "@dashseller/db/schema";

export type SyncDomain = (typeof syncDomainEnum.enumValues)[number];
