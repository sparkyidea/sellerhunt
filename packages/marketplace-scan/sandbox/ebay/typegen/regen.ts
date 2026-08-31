// biome-ignore-all lint/correctness/noUndeclaredVariables: Bun-only sandbox script
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: orchestrator
/**
 * Regenerate `src/adapters/ebay/raw-types/{search,storefront}-response.ts` from
 * the raw sandbox captures in `sandbox/ebay/output/`.
 *
 * Pipeline:
 *   1. Read each raw response and combine the per-`_type` module samples
 *      into one synthetic object whose keys are the desired interface names.
 *      (Quicktype only accepts stdin reliably here — feeding it dynamic-key
 *      module bags directly produces wrong types.)
 *   2. Pipe each synthetic object through `quicktype` to get one cohesive
 *      `.gen.ts` per response with deduped helper interfaces.
 *   3. Drop the synthetic wrapper interface, narrow each top-level module's
 *      `_type` to a literal (so the union is discriminable), rename the
 *      `Envelope` interface so the two files don't collide if imported in the
 *      same module, and append the hand-written response envelope + union.
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/typegen/regen.ts
 *
 * Refresh raw captures first if the wire format may have changed:
 *   bun run packages/marketplace-scan/sandbox/ebay/search-listings.ts
 *   bun run packages/marketplace-scan/sandbox/ebay/get-seller.ts
 *   bun run packages/marketplace-scan/sandbox/ebay/get-listing.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, "../output");
const SCRATCH_DIR = resolve(HERE, ".scratch");
const SRC_TYPES_DIR = resolve(HERE, "../../../src/adapters/ebay/raw-types");

type Json = unknown;

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ModuleSpec {
  /** Name of the generated TypeScript interface (also the synthetic input key). */
  interfaceName: string;
  /** Literal value of the top-level `_type` field on this module. */
  literal: string;
}

interface ResponseSpec {
  /** Name of the destination .ts file (in `src/adapters/ebay/raw-types`). */
  destFilename: string;
  /**
   * Prefix for the per-file `Envelope` rename so the three response files don't
   * collide on the unqualified `Envelope` symbol if both are imported in the
   * same module.
   */
  envelopePrefix: string;
  /** Module interfaces, in the order they appear in the discriminated union. */
  modules: ModuleSpec[];
  /** Name of the raw JSON file in `sandbox/ebay/output`. */
  rawFilename: string;
  /** Tail block (response envelope) appended after the generated types. */
  tail: string;
  /** Name of the discriminated union we append. */
  unionName: string;
  /** Top-level type name we ask quicktype to use for the synthetic wrapper. */
  wrapperName: string;
}

const SEARCH: ResponseSpec = {
  rawFilename: "search-listings.raw.json",
  destFilename: "search-response.ts",
  wrapperName: "SearchTypes",
  envelopePrefix: "SearchResponse",
  unionName: "EbaySearchModule",
  modules: [
    { interfaceName: "ItemModule", literal: "ITEM" },
    { interfaceName: "AdPDModule", literal: "AD_PD" },
    { interfaceName: "SearchAdsModule", literal: "searchads" },
    { interfaceName: "PrefetchImageModule", literal: "PrefetchImageModule" },
    { interfaceName: "SearchStatusModule", literal: "SearchStatusModule" },
    {
      interfaceName: "FloatingActionButtonModule",
      literal: "FloatingActionButtonModule",
    },
    { interfaceName: "FooterNotesListModule", literal: "FOOTER_NOTES_LIST" },
    { interfaceName: "BosPlaceholderModule", literal: "BOS_PLACEHOLDER" },
    { interfaceName: "NavigationsListModule", literal: "NAVIGATIONS_LIST" },
    {
      interfaceName: "SearchRefinementsModule",
      literal: "SearchRefinementsModule",
    },
    {
      interfaceName: "ThemedContainerItemCardsModule",
      literal: "THEMED_CONTAINER_ITEM_CARDS",
    },
  ],
  tail: `/**
 * Top-level shape of the eBay mobile search response
 * (\`apisd.ebay.com/experience/search/v1/search_results\`).
 *
 * Sample-derived: \`modules\` keys are dynamic ("listing1", "listing2", ...,
 * "FAB_MODEL", ...), so we type them as a record keyed by string and
 * discriminated by \`_type\`.
 */
export interface EbaySearchResponse {
  modules: Record<string, EbaySearchModule>;
  deferred_modules?: Array<Record<string, EbaySearchModule>>;
  meta: SearchResponseMeta;
}
`,
};

const STOREFRONT: ResponseSpec = {
  rawFilename: "get-seller.raw.json",
  destFilename: "storefront-response.ts",
  wrapperName: "StorefrontTypes",
  envelopePrefix: "StorefrontResponse",
  unionName: "EbayStorefrontModule",
  modules: [
    {
      interfaceName: "PresenceInformationModule",
      literal: "PresenceInformationModule",
    },
    { interfaceName: "SectionModule", literal: "SectionModule" },
    { interfaceName: "ContactSellerModule", literal: "ContactSellerModule" },
    {
      interfaceName: "DetailedSellerRatingSummaryModule",
      literal: "DetailedSellerRatingSummaryModel",
    },
    { interfaceName: "FeedbackSummaryModule", literal: "FeedbackSummaryModel" },
    { interfaceName: "SeekSurveyModule", literal: "SeekSurveyModule" },
    { interfaceName: "ContainerModule", literal: "ContainerModule" },
    { interfaceName: "ShareModule", literal: "ShareModule" },
    { interfaceName: "RatingSummaryModule", literal: "RatingSummaryModel" },
    { interfaceName: "TabsModule", literal: "TabsModule" },
  ],
  tail: `/**
 * Top-level shape of the eBay mobile storefront response
 * (\`apisd.ebay.com/experience/storefront/v1/store_results\`).
 *
 * Sample-derived: each \`modules.<NAME>\` entry is one of the discriminated
 * module types below. Known module slots are typed precisely; unknown keys
 * fall through to the union.
 */
export interface EbayStorefrontResponse {
  modules: Partial<Record<string, EbayStorefrontModule>> & {
    PRESENCE_INFORMATION_MODULE?: PresenceInformationModule;
    ABOUT_DESCRIPTION_MODULE?: SectionModule;
    CONTACT_SELLER_MODULE?: ContactSellerModule;
    FEEDBACK_DETAILED_SELLER_RATING_SUMMARY_MODULE?: DetailedSellerRatingSummaryModule;
    FEEDBACK_DETAIL_LIST_MODULE?: FeedbackSummaryModule;
    SEEK_SURVEY_MODULE?: SeekSurveyModule;
    LISTINGS_MODULE?: ContainerModule;
    SHARE_MODULE?: ShareModule;
    FEEDBACK_OVERALL_RATING_SUMMARY_MODULE?: RatingSummaryModule;
    TABS_MODULE?: TabsModule;
  };
  meta: StorefrontResponseMeta;
}
`,
};

const LISTING_DETAIL: ResponseSpec = {
  rawFilename: "get-listing.raw.json",
  destFilename: "listing-detail-response.ts",
  wrapperName: "ListingDetailTypes",
  envelopePrefix: "ListingDetailResponse",
  unionName: "EbayListingDetailModule",
  modules: [
    { interfaceName: "VlsViewModule", literal: "VLSViewModule" },
    { interfaceName: "BuyBoxModule", literal: "BuyBoxModule" },
    { interfaceName: "BuyBoxActionModule", literal: "BuyBoxActionModule" },
    { interfaceName: "BuyingFlowModule", literal: "BuyingFlowModule" },
    { interfaceName: "TitleViewModel", literal: "TitleViewModel" },
    { interfaceName: "PictureViewModel", literal: "PictureViewModel" },
    { interfaceName: "ConditionViewModel", literal: "ConditionViewModel" },
    {
      interfaceName: "VolumePricingViewModel",
      literal: "VolumePricingViewModel",
    },
    { interfaceName: "LayoutSectionModule", literal: "LayoutSectionModule" },
    { interfaceName: "SectionModule", literal: "SectionModule" },
    {
      interfaceName: "DetailedSellerRatingSummaryModule",
      literal: "DetailedSellerRatingSummaryModel",
    },
    {
      interfaceName: "FeedbackTabbedSummaryModule",
      literal: "FeedbackTabbedSummaryModel",
    },
    {
      interfaceName: "HeaderAndOverlayViewModel",
      literal: "HeaderAndOverlayViewModel",
    },
    { interfaceName: "CardModule", literal: "CARD_MODULE" },
    { interfaceName: "AdPDModule", literal: "AD_PD" },
    {
      interfaceName: "PlaceholderMerchNavigationModule",
      literal: "PLACEHOLDER_MERCH_NAVIGATION",
    },
    { interfaceName: "VasDataModule", literal: "VASDataModel" },
    { interfaceName: "SemanticDataModule", literal: "SemanticDataModule" },
  ],
  tail: `/**
 * Top-level shape of the eBay mobile view-item response
 * (\`apisd.ebay.com/experience/listing_details/v2/view_item\`).
 *
 * Sample-derived: \`modules.<NAME>\` keys are stable strings (one per UX
 * component); the \`VLS\` slot — which carries the structured listing record
 * scanners care about — is typed precisely. Other known slots are typed via
 * their module interface; unknown keys fall through to the union.
 */
export interface EbayListingDetailResponse {
  modules: Partial<Record<string, EbayListingDetailModule>> & {
    VLS?: VlsViewModule;
    BUY_BOX?: BuyBoxModule;
    BUY_BOX_CTA?: BuyBoxActionModule;
    BUYING_FLOW?: BuyingFlowModule;
    TITLE?: TitleViewModel;
    PICTURE?: PictureViewModel;
    CONDITION?: ConditionViewModel;
    CONDITION_V2?: ConditionViewModel;
    CONDITION_DESCRIPTION?: SectionModule;
    VOLUME_PRICING?: VolumePricingViewModel;
    SHIPPING_SECTION_MODULE?: LayoutSectionModule;
    RETURNS_SECTION_MODULE?: LayoutSectionModule;
    PAYMENTS_SECTION_MODULE?: LayoutSectionModule;
    SHIPPING_RETURNS_PAYMENT_SECTION_MODULE?: LayoutSectionModule;
    ABOUT_THIS_ITEM?: LayoutSectionModule;
    ABOUT_THIS_ITEM_MIN_VIEW?: LayoutSectionModule;
    ITEM_DESC_SELLER?: LayoutSectionModule;
    ABOUT_THIS_SELLER_SECTION_MODULE?: SectionModule;
    DETAILED_SELLER_RATING_SUMMARY_V2?: DetailedSellerRatingSummaryModule;
    FEEDBACK_DETAIL_LIST_TABBED_V2_HORIZONTAL?: FeedbackTabbedSummaryModule;
    HEADER_AND_OVERLAY?: HeaderAndOverlayViewModel;
    ITEM_CARD_MINIMAL?: CardModule;
    SEMANTIC_DATA_V2?: SemanticDataModule;
    VAS?: VasDataModule;
  };
  meta: ListingDetailResponseMeta;
}
`,
};

const REGEN_HEADER = `// AUTO-GENERATED — do not edit by hand.
// Regenerate after a fresh sandbox capture:
//   bun run packages/marketplace-scan/sandbox/ebay/typegen/regen.ts
// The shapes here are sample-derived; eBay's undocumented mobile API may add
// or rename fields without notice.
// biome-ignore-all assist/source/useSortedInterfaceMembers: preserve sample order
// biome-ignore-all lint/style/noEnum: quicktype emits enums for inferred unions
// biome-ignore-all lint/style/useConsistentArrayType: quicktype-emitted style
// biome-ignore-all lint/suspicious/noEmptyInterface: sample had empty objects
// biome-ignore-all lint/suspicious/noExplicitAny: sample had ambiguously-shaped arrays
`;

function buildSyntheticInput(
  raw: Json,
  spec: ResponseSpec
): Record<string, Json> {
  if (!isObject(raw)) {
    throw new Error("raw response is not an object");
  }
  const buckets: Record<string, Json>[] = [];
  if (isObject(raw.modules)) {
    buckets.push(raw.modules);
  }
  if (Array.isArray(raw.deferred_modules)) {
    for (const entry of raw.deferred_modules) {
      if (isObject(entry)) {
        buckets.push(entry);
      }
    }
  }

  const byType = new Map<string, Json>();
  for (const bucket of buckets) {
    for (const value of Object.values(bucket)) {
      if (!isObject(value)) {
        continue;
      }
      const type = typeof value._type === "string" ? value._type : "__untyped";
      if (!byType.has(type)) {
        byType.set(type, value);
      }
    }
  }

  const synthetic: Record<string, Json> = {};
  for (const module of spec.modules) {
    const sample = byType.get(module.literal);
    if (!sample) {
      throw new Error(
        `no sample found for ${module.interfaceName} (_type=${module.literal}) in ${spec.rawFilename}`
      );
    }
    synthetic[module.interfaceName] = sample;
  }
  synthetic.envelope = {
    ...raw,
    modules: undefined,
    deferred_modules: undefined,
  };
  return synthetic;
}

async function runQuicktype(input: string, topLevel: string): Promise<string> {
  const proc = Bun.spawn(
    [
      "npx",
      "-y",
      "quicktype",
      "-l",
      "ts",
      "-t",
      topLevel,
      "--just-types",
      "--no-date-times",
      "--explicit-unions",
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
  );
  proc.stdin.write(input);
  await proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`quicktype exited ${exitCode}: ${stderr}`);
  }
  return stdout;
}

function dropWrapper(source: string, wrapperName: string): string {
  const re = new RegExp(
    String.raw`export interface ${wrapperName}\s*\{[^}]*\}\s*\n+`,
    "m"
  );
  const next = source.replace(re, "");
  if (next === source) {
    throw new Error(`failed to drop wrapper ${wrapperName}`);
  }
  return next;
}

function renameSymbol(source: string, from: string, to: string): string {
  return source.replace(new RegExp(String.raw`\b${from}\b`, "g"), to);
}

function narrowTopLevelType(
  source: string,
  interfaceName: string,
  literal: string
): string {
  const re = new RegExp(
    String.raw`(export interface ${interfaceName}\s*\{[^}]*?)(\b_type:\s*[^;]+;)`,
    "m"
  );
  const next = source.replace(re, `$1_type: ${JSON.stringify(literal)};`);
  if (next === source) {
    throw new Error(`failed to narrow _type on ${interfaceName}`);
  }
  return next;
}

function buildUnion(name: string, modules: ModuleSpec[]): string {
  return `export type ${name} =\n${modules
    .map((m) => `  | ${m.interfaceName}`)
    .join("\n")};\n`;
}

async function build(spec: ResponseSpec): Promise<void> {
  const rawText = await Bun.file(resolve(RAW_DIR, spec.rawFilename)).text();
  const synthetic = buildSyntheticInput(JSON.parse(rawText), spec);

  await mkdir(SCRATCH_DIR, { recursive: true });
  const scratchPath = resolve(SCRATCH_DIR, `${spec.destFilename}.input.json`);
  await writeFile(scratchPath, JSON.stringify(synthetic, null, 2));

  const generated = await runQuicktype(
    JSON.stringify(synthetic),
    spec.wrapperName
  );

  let out = dropWrapper(generated, spec.wrapperName);
  out = renameSymbol(out, "EnvelopeMeta", `${spec.envelopePrefix}Meta`);
  out = renameSymbol(out, "Envelope", `${spec.envelopePrefix}Envelope`);
  for (const module of spec.modules) {
    out = narrowTopLevelType(out, module.interfaceName, module.literal);
  }
  out = `${REGEN_HEADER}\n${out}\n${buildUnion(spec.unionName, spec.modules)}\n${spec.tail}`;

  await mkdir(SRC_TYPES_DIR, { recursive: true });
  const destPath = resolve(SRC_TYPES_DIR, spec.destFilename);
  await writeFile(destPath, out);
  console.log(`wrote ${destPath}`);
}

await build(SEARCH);
await build(STOREFRONT);
await build(LISTING_DETAIL);
