// AUTO-GENERATED — do not edit by hand.
// Regenerate after a fresh sandbox capture:
//   bun run packages/marketplace-scan/sandbox/ebay/typegen/regen.ts
// The shapes here are sample-derived; eBay's undocumented mobile API may add
// or rename fields without notice.
// biome-ignore-all assist/source/useSortedInterfaceMembers: preserve sample order
// biome-ignore-all lint/style/noEnum: quicktype emits enums for inferred unions
// biome-ignore-all lint/style/useConsistentArrayType: quicktype-emitted style
// biome-ignore-all lint/suspicious/noEmptyInterface: sample had empty objects
// biome-ignore-all lint/suspicious/noExplicitAny: sample had ambiguously-shaped arrays

export interface ContactSellerModule {
  _type: "ContactSellerModule";
  contactAction: ContactAction;
  meta: ContactSellerModuleMeta;
}

export interface ContactAction {
  _type: string;
  text: string;
  type: string;
  action: ContactActionAction;
  disabled: boolean;
}

export interface ContactActionAction {
  _type: ActionType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: PurpleParams;
  trackingList: Tracking[];
  signInRequired: boolean;
}

export enum ActionType {
  Action = "Action",
}

export interface PurpleParams {
  username: string;
}

export interface Tracking {
  eventFamily: TrackingEventFamily;
  eventAction: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: TrackingEventProperty;
}

export enum ActionKind {
  Click = "CLICK",
}

export enum EventAction {
  Actn = "ACTN",
}

export enum TrackingEventFamily {
  Storefront = "STOREFRONT",
}

export interface TrackingEventProperty {
  soid: Soid;
  "ads-soid": string;
  moduledtl: string;
  spid: Soid;
  sid: string;
}

export enum Soid {
  FoKFOb6TSAI = "foKFOb6TSAi",
}

export enum ActionKindEnum {
  Nav = "NAV",
  Navsrc = "NAVSRC",
}

export interface ContactSellerModuleMeta {
  name: string;
}

export interface ContainerModule {
  _type: "ContainerModule";
  containers: Container[];
  meta: ContainerModuleMeta;
}

export interface Container {
  _type: string;
  cards: Card[];
  seeAll: SeeAll;
  title: Title;
}

export interface Card {
  _type: CardType;
  entityOverflow: EntityOverflow;
  action: CardAction;
  id: string;
  presentityId: string;
  listingId: string;
  title: SubTitle;
  image: Logo;
  displayPrice: DisplayPrice;
  quantity: Quantity;
  itemPropertyOrdering: ItemPropertyOrdering;
  viewportTracking: ViewportTracking;
  __search: Search;
  trackingInfo: TrackingInfo;
  meta: CardMeta;
  logisticsCost?: SubTitle;
}

export interface Search {
  itemLocation: TextSpan;
  sellerInfo: SellerInfo;
  defaultWatchIconOnImage: DefaultWatchIconOnImage;
  normalizedCondition: NormalizedCondition;
  displayAttributes?: DisplayAttributes;
  freeXDays?: Title;
  productReview?: ProductReview;
}

export interface DefaultWatchIconOnImage {
  watch: Watch;
  watching: Watching;
  isWatching: boolean;
}

export interface Watch {
  _type: WatchType;
  icon: Icon;
  text: WatchText;
  action: WatchAction;
}

export enum WatchType {
  IconAndText = "IconAndText",
}

export interface WatchAction {
  _type: ActionType;
  URL: string;
  type: PurpleType;
  name: PurpleName;
  params: FluffyParams;
  trackingList: PurpleTrackingList[];
}

export enum PurpleName {
  Watch = "WATCH",
}

export interface FluffyParams {
  pt: null;
  itemId: string;
}

export interface PurpleTrackingList {
  eventFamily: PurpleEventFamily;
  eventAction: EventAction;
  actionKind: ActionKindEnum;
  actionKinds: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: PurpleEventProperty;
}

export enum PurpleEventFamily {
  Lst = "LST",
}

export interface PurpleEventProperty {
  trackableId: string;
  clickaction: PurpleName;
  itm: string;
  moduledtl: PurpleModuledtl;
  sid: PurpleModuledtl;
  interaction: string;
}

export enum PurpleModuledtl {
  P3418065M4114L8480 = "p3418065.m4114.l8480",
}

export enum PurpleType {
  Operation = "OPERATION",
}

export interface Icon {
  _type: SecondaryCtaIconType;
  name: SecondaryCtaIconName;
}

export enum SecondaryCtaIconType {
  Icon = "Icon",
}

export enum SecondaryCtaIconName {
  CornerWatch = "CORNER_WATCH",
  CornerWatching = "CORNER_WATCHING",
  Heart = "HEART",
  HeartFill = "HEART_FILL",
}

export interface WatchText {
  _type: TextType;
  textSpans: PurpleTextSpan[];
  accessibilityText: string;
}

export enum TextType {
  TextualDisplay = "TextualDisplay",
  TextualDisplayValue = "TextualDisplayValue",
}

export interface PurpleTextSpan {
  _type: TextSpanType;
  action: WatchAction;
  accessibilityText: string;
}

export enum TextSpanType {
  TextSpan = "TextSpan",
}

export interface Watching {
  _type: WatchType;
  icon: Icon;
  text: WatchingText;
  action: WatchingAction;
}

export interface WatchingAction {
  _type: ActionType;
  URL: string;
  type: PurpleType;
  name: FluffyName;
  params: TentacledParams;
  trackingList: FluffyTrackingList[];
}

export enum FluffyName {
  Unwatch = "UNWATCH",
}

export interface TentacledParams {
  itemId: string;
}

export interface FluffyTrackingList {
  eventFamily: PurpleEventFamily;
  eventAction: EventAction;
  actionKind: ActionKind;
  actionKinds: ActionKind[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: FluffyEventProperty;
}

export interface FluffyEventProperty {
  clickaction: FluffyName;
  moduledtl: FluffyModuledtl;
  sid: FluffyModuledtl;
}

export enum FluffyModuledtl {
  P3418065M4114 = "p3418065.m4114",
}

export interface WatchingText {
  _type: TextType;
  textSpans: FluffyTextSpan[];
  accessibilityText: TextAccessibilityText;
}

export enum TextAccessibilityText {
  YouAreWatchingThisItem = "You are watching this item",
}

export interface FluffyTextSpan {
  _type: TextSpanType;
  action: WatchingAction;
  accessibilityText: TextAccessibilityText;
}

export interface DisplayAttributes {
  textualDisplays: SubTitle[];
  separator: Separator;
}

export enum Separator {
  TextMiddot = "TEXT_MIDDOT",
}

export interface SubTitle {
  _type: TextType;
  textSpans: TextSpan[];
}

export interface TextSpan {
  _type: TextSpanType;
  text: string;
}

export interface Title {
  _type: TextType;
  textSpans: FollowerDescriptionTextSpan[];
}

export interface FollowerDescriptionTextSpan {
  _type: TextSpanType;
  text: string;
  styles?: TypeElement[];
  accessibilityText?: string;
}

export enum TypeElement {
  Bold = "BOLD",
  InlineLink = "INLINE_LINK",
  Positive = "POSITIVE",
  Secondary = "SECONDARY",
}

export interface NormalizedCondition {
  _type: NormalizedConditionType;
  listingStyles: ListingStyle[];
  text: TextEnum;
}

export enum NormalizedConditionType {
  ListingTextSpan = "listingTextSpan",
}

export enum ListingStyle {
  SecondaryInfo = "SECONDARY_INFO",
}

export enum TextEnum {
  BrandNew = "Brand New",
  NewOther = "New (Other)",
}

export interface ProductReview {
  reviews: AverageRating;
  reviewCount: AverageRating;
}

export interface AverageRating {
  _type: TextType;
  value?: number;
  textSpans: TextSpan[];
  accessibilityText: string;
  action?: AverageRatingAction;
}

export interface AverageRatingAction {
  _type: ActionType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: StickyParams;
  trackingList: TentacledTrackingList[];
}

export interface StickyParams {
  iid: string;
}

export interface TentacledTrackingList {
  actionKind: ActionKindEnum;
  actionKinds: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: TentacledEventProperty;
}

export interface TentacledEventProperty {
  sid: string;
}

export interface SellerInfo {
  _type: WatchType;
  text: SubTitle;
}

export enum CardType {
  StoreFrontItemCard = "StoreFrontItemCard",
}

export interface CardAction {
  _type: ActionType;
  URL: string;
  type: ActionKindEnum;
  name: TentacledName;
  params: IndigoParams;
  trackingList: StickyTrackingList[];
}

export enum TentacledName {
  ViewItem = "VIEW_ITEM",
}

export interface IndigoParams {
  hash: string;
  listingId: string;
  epid?: string;
}

export interface StickyTrackingList {
  actionKind: ActionKindEnum;
  actionKinds: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: StickyEventProperty;
  eventFamily?: PurpleEventFamily;
  eventAction?: EventAction;
}

export interface StickyEventProperty {
  sid?: Sid;
  trackableId?: string;
  parentrq?: Parentrq;
  pageci?: string;
  interaction?: string;
  moduledtl?: string;
}

export enum Parentrq {
  The2F8816Bda2Ac3244 = "2f8816bda2ac3244",
}

export enum Sid {
  P3418065M1686L7400 = "p3418065.m1686.l7400",
}

export interface DisplayPrice {
  _type: TextType;
  value: Value;
  textSpans: FollowerDescriptionTextSpan[];
}

export interface Value {
  value: number;
  currency: Currency;
}

export enum Currency {
  Usd = "USD",
}

export interface EntityOverflow {
  icon: Rating;
  menuItems: MenuItems;
}

export interface Rating {
  _type: SecondaryCtaIconType;
  name: RatingName;
  accessibilityText: RatingAccessibilityText;
}

export enum RatingAccessibilityText {
  MoreOptionsMenu = "more options menu",
  PositiveFeedbackRating = "Positive feedback rating",
}

export enum RatingName {
  EbayOverflowMenuIcon = "ebay-overflow-menu-icon",
  Positive = "POSITIVE",
}

export interface MenuItems {
  _type: MenuItemsType;
  entries: Entry[];
}

export enum MenuItemsType {
  Group = "Group",
}

export interface Entry {
  _type: EntryType;
  label: SubTitle;
  action: EntryAction;
}

export enum EntryType {
  Field = "Field",
}

export interface EntryAction {
  _type: ActionType;
  type: PurpleType;
  name: StickyName;
  params: IndecentParams;
  trackingList: Tracking[];
}

export enum StickyName {
  HelpAndReport = "HELP_AND_REPORT",
}

export interface IndecentParams {
  titleDescription: string;
  productListingId: string;
  imageUrl: string;
}

export interface Logo {
  _type: LogoType;
  title: string;
  imageId: string;
  imageIdType: ImageIDType;
  URL: string;
  originalSize: OriginalSize;
  action?: LogoAction;
}

export enum LogoType {
  Image = "Image",
}

export interface LogoAction {
  _type: ActionType;
  URL: string;
  type: string;
  name: string;
  params?: HilariousParams;
  trackingList: Tracking[];
  clientPresentationMetadata?: PurpleClientPresentationMetadata;
}

export interface PurpleClientPresentationMetadata {
  url: string;
  username: string;
}

export interface HilariousParams {
  spTag: string;
  username: string;
}

export enum ImageIDType {
  ZoomGUID = "ZOOM_GUID",
}

export interface OriginalSize {
  height: number;
  width: number;
}

export interface ItemPropertyOrdering {
  DEFAULT: Default;
}

export interface Default {
  header: Array<Header[]>;
  primary: Array<Primary[]>;
}

export enum Header {
  Title = "title",
}

export enum Primary {
  DisplayPrice = "displayPrice",
}

export interface CardMeta {
  moduleIdentification: ModuleIdentification;
}

export interface ModuleIdentification {
  sojournerModuleId: string;
}

export interface Quantity {
  _type: TextType;
  value: number;
  textSpans: TextSpan[];
}

export interface TrackingInfo {
  moduleInstance: string;
  parentrq: Parentrq;
  trackViews: boolean;
  trackPerf: boolean;
}

export interface ViewportTracking {
  trackableId: string;
}

export interface SeeAll {
  _type: TextType;
  textSpans: TextSpan[];
  action: SeeAllAction;
}

export interface SeeAllAction {
  _type: ActionType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: AmbitiousParams;
  clientPresentationMetadata: FluffyClientPresentationMetadata;
  trackingList: Tracking[];
}

export interface FluffyClientPresentationMetadata {
  cta: string;
}

export interface AmbitiousParams {
  _dkr: string;
  iconV2Request: string;
  _blrs: string;
  _ssn: string;
  "Experience.enableUnifiedRanking": string;
  "Experience.cassiniNullLowEnabled": string;
  _oac: string;
}

export interface ContainerModuleMeta {
  name: string;
  trackingList: MetaTrackingList[];
}

export interface MetaTrackingList {
  eventFamily: TrackingEventFamily;
  eventAction: string;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IndigoEventProperty;
}

export interface IndigoEventProperty {
  soid: Soid;
  moduledtl: string;
  spid: Soid;
}

export interface DetailedSellerRatingSummaryModule {
  _type: "DetailedSellerRatingSummaryModel";
  title: Title;
  subTitle: SubTitle;
  ratingDetails: RatingDetail[];
  meta: ContactSellerModuleMeta;
}

export interface RatingDetail {
  ratingLabel: SubTitle;
  starRating: StarRating;
}

export interface StarRating {
  averageRating: AverageRating;
}

export interface FeedbackSummaryModule {
  _type: "FeedbackSummaryModel";
  feedbackView: FeedbackView;
  seeAllFeedback: SeeAllFeedback;
  label: Title;
  meta: ContactSellerModuleMeta;
}

export interface FeedbackView {
  feedbackCards: FeedbackCard[];
}

export interface FeedbackCard {
  _type: string;
  feedbackInfo: FeedbackInfo;
}

export interface FeedbackInfo {
  contextTime: AverageRating;
  context: AverageRating;
  rating: Rating;
  comment: AverageRating;
  imageCount: string;
  verifiedPurchaseSignal: SubTitle;
}

export interface SeeAllFeedback {
  _type: string;
  text: string;
  type: string;
  action: SeeAllFeedbackAction;
  accessibilityText: string;
}

export interface SeeAllFeedbackAction {
  _type: ActionType;
  type: ActionKindEnum;
  name: string;
  params: CunningParams;
  clientPresentationMetadata: FluffyClientPresentationMetadata;
  trackingList: IndigoTrackingList[];
}

export interface CunningParams {
  sort: string;
  user_context: string;
  username: string;
}

export interface IndigoTrackingList {
  actionKind: string;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IndecentEventProperty;
  eventFamily?: string;
  eventAction?: EventAction;
  clientImpressionPageId?: string;
}

export interface IndecentEventProperty {
  sid: string;
  moduledtl?: string;
}

export interface PresenceInformationModule {
  _type: "PresenceInformationModule";
  ownerUsername: string;
  presenceType: string;
  followerDescription: Title;
  feedbackDescription: FeedbackDescription;
  soldDescription: Title;
  displayName: DisplayName;
  logo: Logo;
  saveAction: SaveAction;
  epVersion: string;
  overflowButton: OverflowButton;
  openDrawer: SubTitle;
  closeDrawer: SubTitle;
  minimizeDrawer: SubTitle;
  maximizeDrawer: SubTitle;
  isOwner: boolean;
  meta: ContainerModuleMeta;
  action: LogoAction;
}

export interface DisplayName {
  _type: TextType;
  textSpans: TextSpan[];
  action: LogoAction;
}

export interface FeedbackDescription {
  _type: TextType;
  textSpans: FollowerDescriptionTextSpan[];
  action: FeedbackDescriptionAction;
}

export interface FeedbackDescriptionAction {
  _type: ActionType;
  URL: string;
  type: ActionKindEnum;
  trackingList: Tracking[];
}

export interface OverflowButton {
  _type: string;
  onCallToAction: OverflowButtonOffCallToAction;
  offCallToAction: OverflowButtonOffCallToAction;
  initialState: string;
}

export interface OverflowButtonOffCallToAction {
  _type: string;
  text: string;
  action: PurpleAction;
}

export interface PurpleAction {
  _type: ActionType;
  type: PurpleType;
}

export interface SaveAction {
  _type: string;
  onCallToAction: SaveActionOffCallToAction;
  offCallToAction: SaveActionOffCallToAction;
  initialState: string;
}

export interface SaveActionOffCallToAction {
  _type: string;
  text: string;
  secondaryCtaIcon: Icon;
  type: TypeElement;
  action: FluffyAction;
  accessibilityText: string;
}

export interface FluffyAction {
  _type: ActionType;
  type: PurpleType;
  name: string;
  params: MagentaParams;
  clientPresentationMetadata: TentacledClientPresentationMetadata;
  trackingList: Tracking[];
  accessibilityText: string;
  tracking: Tracking;
}

export interface TentacledClientPresentationMetadata {
  postBody: string;
  pageId: string;
}

export interface MagentaParams {
  hosting_module_id: string;
}

export interface RatingSummaryModule {
  _type: "RatingSummaryModel";
  title: SubTitle;
  subTitle: SubTitle;
  ratingData: RatingDatum[];
  meta: ContactSellerModuleMeta;
}

export interface RatingDatum {
  label: SubTitle;
  ratingCounts: RatingCount[];
}

export interface RatingCount {
  _type: TextType;
  textSpans: FollowerDescriptionTextSpan[];
  accessibilityText: string;
  action: RatingCountAction;
}

export interface RatingCountAction {
  _type: ActionType;
  type: ActionKindEnum;
  name: string;
  params: FriskyParams;
  clientPresentationMetadata: FluffyClientPresentationMetadata;
  trackingList: IndigoTrackingList[];
}

export interface FriskyParams {
  commentType: string;
  period: string;
  user_context: string;
  username: string;
}

export interface SectionModule {
  _type: "SectionModule";
  sections: Section[];
  meta: ContactSellerModuleMeta;
}

export interface Section {
  _type: string;
  title: Title;
}

export interface SeekSurveyModule {
  _type: "SeekSurveyModule";
  title: SubTitle;
  action: SeekSurveyModuleAction;
  meta: ContactSellerModuleMeta;
}

export interface SeekSurveyModuleAction {
  _type: ActionType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: MischievousParams;
}

export interface MischievousParams {
  surveyId: string;
  username: string;
}

export interface ShareModule {
  _type: "ShareModule";
  text: string;
  shareAction: ShareAction;
  meta: ContainerModuleMeta;
}

export interface ShareAction {
  _type: string;
  type: TypeElement;
  action: LogoAction;
  accessibilityText: string;
}

export interface TabsModule {
  _type: "TabsModule";
  tabs: Tab[];
  meta: ContactSellerModuleMeta;
}

export interface Tab {
  _type: TextType;
  textSpans: TextSpan[];
  action: TabAction;
}

export interface TabAction {
  _type: ActionType;
  type: PurpleType;
  name: string;
  params: BraggadociousParams;
  trackingList: IndecentTrackingList[];
}

export interface BraggadociousParams {
  regionKey: string;
  showFab: string;
}

export interface IndecentTrackingList {
  eventFamily: TrackingEventFamily;
  eventAction: string;
  actionKind?: string;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: HilariousEventProperty;
  clientImpressionPageId?: string;
}

export interface HilariousEventProperty {
  regionKey?: string;
  moduledtl: string;
  soid?: Soid;
  "ads-soid"?: string;
  imp?: string;
  spid?: Soid;
}

export interface StorefrontResponseEnvelope {
  meta: StorefrontResponseMeta;
}

export interface StorefrontResponseMeta {
  pageTitle: string;
  pageTemplate: PageTemplate;
}

export interface PageTemplate {
  _type: string;
  regions: { [key: string]: Region };
  templateId: string;
}

export interface Region {
  _type: string;
  layouts: Layouts;
}

export interface Layouts {
  LIST_1_COLUMN: List1_Column;
}

export interface List1_Column {
  _type: string;
  positions: Position[];
}

export interface Position {
  _type: string;
  moduleLocator: string;
  uxComponentName: string;
}

export type EbayStorefrontModule =
  | PresenceInformationModule
  | SectionModule
  | ContactSellerModule
  | DetailedSellerRatingSummaryModule
  | FeedbackSummaryModule
  | SeekSurveyModule
  | ContainerModule
  | ShareModule
  | RatingSummaryModule
  | TabsModule;

/**
 * Top-level shape of the eBay mobile storefront response
 * (`apisd.ebay.com/experience/storefront/v1/store_results`).
 *
 * Sample-derived: each `modules.<NAME>` entry is one of the discriminated
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
