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

export interface AdPDModule {
  _type: "AD_PD";
  meta: AdPDModuleMeta;
  containers: Container[];
  size: Size;
}

export interface Container {
  meta: ContainerMeta;
  action: ContainerAction;
  store: ProfileLogo;
  callToAction: CallToAction;
  headline: TitleElement;
  trustSignal: TitleElement;
  trustSignals: TitleElement[];
  trust: Trust[];
  items: ItemElement[];
  sponsored: DisplayLabel;
  storeName: TitleElement;
  title: DisplayLabel;
  styles: string[];
}

export interface ContainerAction {
  _type: ActionType;
  URL: string;
  type: ActionKind;
  name: string;
  params: PurpleParams;
  trackingList: PurpleTrackingList[];
}

export enum ActionType {
  Action = "Action",
  Icon = "Icon",
}

export interface PurpleParams {
  store_name: string;
  _sacat: string;
  promoted_items: string;
}

export interface PurpleTrackingList {
  actionKind: string;
  operationId: string;
  flushImmediately: boolean;
  eventFamily?: string;
  eventAction?: EventAction;
  eventProperty?: PurpleEventProperty;
}

export enum EventAction {
  Actn = "ACTN",
  View = "VIEW",
}

export interface PurpleEventProperty {
  encpd: string;
  moduledtl: string;
  sid: string;
}

export enum ActionKind {
  Click = "CLICK",
  Nav = "NAV",
}

export interface CallToAction {
  _type: string;
  text: string;
  ctaIcon: CtaIcon;
  action: ContainerAction;
}

export interface CtaIcon {
  _type: ActionType;
  name: string;
}

export interface TitleElement {
  _type: TitleType;
  textSpans: HeadlineTextSpan[];
}

export enum TitleType {
  TextualDisplay = "TextualDisplay",
  TextualDisplayValue = "TextualDisplayValue",
}

export interface HeadlineTextSpan {
  _type: TextSpanType;
  text?: string;
  styles?: TypeElement[];
  icon?: string;
}

export enum TextSpanType {
  TextSpan = "TextSpan",
}

export enum TypeElement {
  Bold = "BOLD",
  InlineLink = "INLINE_LINK",
  Positive = "POSITIVE",
  Primary = "PRIMARY",
  Pseudolink = "PSEUDOLINK",
  Secondary = "SECONDARY",
}

export interface ItemElement {
  _type: string;
  action: ItemAction;
  listingId: string;
  image: ProfileLogo;
}

export interface ItemAction {
  _type: ActionType;
  URL: string;
  type: ActionKind;
  name: string;
  params: FluffyParams;
  trackingList: PurpleTrackingList[];
}

export interface FluffyParams {
  listingId: string;
}

export interface ProfileLogo {
  _type: ProfileLogoType;
  title: string;
  imageId: string;
  imageIdType: ImageIDType;
  URL: string;
  originalSize?: Size;
  action?: ProfileLogoAction;
}

export enum ProfileLogoType {
  Image = "Image",
}

export interface ProfileLogoAction {
  _type: ActionType;
  type: ActionKind;
  name: PurpleName;
  params: TentacledParams;
  trackingList: FluffyTrackingList[];
}

export enum PurpleName {
  FeedbackDetail = "FEEDBACK_DETAIL",
}

export interface TentacledParams {
  receiver_username: SellerUserNameEnum;
  item_id?: string;
  feedback_id: string;
  action_source: ActionSource;
}

export enum ActionSource {
  All = "ALL",
  Item = "ITEM",
}

export enum SellerUserNameEnum {
  Poofyo101Jumpmansneakers = "poofyo101jumpmansneakers",
}

export interface FluffyTrackingList {
  eventFamily: string;
  eventAction: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: FluffyEventProperty;
}

export interface FluffyEventProperty {
  fdbk_image_id: string;
  moduledtl: string;
  sid: string;
}

export enum ImageIDType {
  ZoomGUID = "ZOOM_GUID",
}

export interface Size {
  height: number;
  width: number;
}

export interface ContainerMeta {
  trackingList: TentacledTrackingList[];
}

export interface TentacledTrackingList {
  eventProperty: TentacledEventProperty;
}

export interface TentacledEventProperty {
  creativeContext: string;
}

export interface DisplayLabel {
  _type: TitleType;
  textSpans: DisplayLabelTextSpan[];
}

export interface DisplayLabelTextSpan {
  _type: TextSpanType;
  text: string;
}

export interface Trust {
  _type: string;
  text?: TitleElement;
}

export interface AdPDModuleMeta {
  name: string;
  trackingList: StickyTrackingList[];
  moduleIdentification: ModuleIdentification;
  viewportTracking: ViewportTracking;
}

export interface ModuleIdentification {
  instanceId: string;
  provider: string;
  sojournerModuleId: string;
  uxComponentGroup?: string;
  scenario?: Scenario;
}

export enum Scenario {
  ConditionV2 = "CONDITION_V2",
  DetailedSellerRatingSummaryV2 = "DETAILED_SELLER_RATING_SUMMARY_V2",
  Empty = "*",
  FeedbackDetailListTabbedV2Horizontal = "FEEDBACK_DETAIL_LIST_TABBED_V2_HORIZONTAL",
}

export interface StickyTrackingList {
  eventFamily: string;
  eventAction: string;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: StickyEventProperty;
}

export interface StickyEventProperty {
  adType: string;
  adGroupId: string;
  itemIds: string;
  clearingPrice: string;
  bid: string;
  adSubType: string;
}

export interface ViewportTracking {
  trackableId: string;
}

export interface BuyBoxActionModule {
  _type: "BuyBoxActionModule";
  buttons: Button[];
  meta: BuyBoxActionModuleMeta;
}

export interface Button {
  _type: string;
  text: string;
  type: TypeElement;
  action: ButtonAction;
  actionId: string;
  viewportTracking: ViewportTracking;
  ctaIcon?: CtaIcon;
}

export interface ButtonAction {
  _type: ActionType;
  type: string;
  name: string;
  trackingList: IndigoTrackingList[];
  clientPresentationMetadata?: ClientPresentationMetadataClass;
  params?: ClientPresentationMetadataClass;
}

export interface ClientPresentationMetadataClass {
  itemId: string;
}

export interface IndigoTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IndigoEventProperty;
}

export enum EventFamily {
  Itm = "ITM",
}

export interface IndigoEventProperty {
  pageci: string;
  moduledtl: string;
  sid: string;
  itm?: string;
  watch?: string;
  isMsku?: string;
  unwatch?: string;
}

export interface BuyBoxActionModuleMeta {
  name: string;
  moduleIdentification: ModuleIdentification;
  viewportTracking: ViewportTracking;
  trackingList?: ThumbnailsViewerInfoTrackingList[];
  moduleId?: string;
}

export interface ThumbnailsViewerInfoTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IndecentEventProperty;
  actionKind?: PurpleActionKind;
}

export enum PurpleActionKind {
  Click = "CLICK",
  Hscroll = "HSCROLL",
}

export interface IndecentEventProperty {
  moduledtl: string;
  itm?: string;
  pageci?: string;
  nofp?: string;
}

export interface BuyBoxModule {
  _type: "BuyBoxModule";
  binModel: BuyBoxModuleBinModel;
  repositionCoupon: boolean;
  deliveryInfo: DeliveryInfo;
  sellerInfo: SellerInfo;
  meta: BuyBoxActionModuleMeta;
}

export interface BuyBoxModuleBinModel {
  price: BinModelPrice;
  isAddedToCart: boolean;
}

export interface BinModelPrice {
  _type: TitleType;
  value: ExchangeRate;
  textSpans: DisplayLabelTextSpan[];
}

export interface ExchangeRate {
  value: number;
  currency: Currency;
}

export enum Currency {
  Usd = "USD",
}

export interface DeliveryInfo {
  deliveryMessage: TitleElement[];
}

export interface SellerInfo {
  _type: string;
  profileLogo: ProfileLogo;
  contactSeller: ContactSeller;
  action: SellerInfoAction;
  dataItems: TitleElement[];
}

export interface SellerInfoAction {
  _type: ActionType;
  type: string;
  name: string;
  clientPresentationMetadata: PurpleClientPresentationMetadata;
  trackingList: HelpTracking[];
  accessibilityText: string;
}

export interface PurpleClientPresentationMetadata {
  viewHint: string;
  presentationType: string;
  region: string;
}

export interface HelpTracking {
  eventFamily: EventFamily;
  eventAction?: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: HelpTrackingEventProperty;
}

export interface HelpTrackingEventProperty {
  pageci?: string;
  moduledtl?: string;
  sid: string;
  overflowMenu?: string;
}

export interface ContactSeller {
  _type: string;
  type: TypeElement;
  action: ContactSellerAction;
}

export interface ContactSellerAction {
  _type: ActionType;
  type: ActionKind;
  name: string;
  params: VICONTACTSELLERParams;
  clientPresentationMetadata: VICONTACTSELLERClientPresentationMetadata;
  trackingList: HelpTracking[];
  accessibilityText: string;
}

export interface VICONTACTSELLERClientPresentationMetadata {
  isBuyer: string;
  isClassified: string;
}

export interface VICONTACTSELLERParams {
  orderId: string;
  listingId: string;
  username: SellerUserNameEnum;
}

export interface BuyingFlowModule {
  _type: "BuyingFlowModule";
  actionMap: ActionMap;
  meta: BuyBoxActionModuleMeta;
}

export interface ActionMap {
  VI_ITEM_DESCRIPTION: Tion;
  VI_CONTACT_SELLER: ViContactSeller;
  VI_ADD_TO_CART: ViAddToCart;
  VI_BUY_IT_NOW: ViAddToCart;
}

export interface ViAddToCart {
  _type: ActionType;
  type: string;
  name: string;
  clientPresentationMetadata?: VIADDTOCARTClientPresentationMetadata;
  trackingList?: VIADDTOCARTTrackingList[];
}

export interface VIADDTOCARTClientPresentationMetadata {
  eligibleForShopActions: string;
  shopactionsRequestType: string;
  eligibleForBlockingShopActions: string;
}

export interface VIADDTOCARTTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: HilariousEventProperty;
}

export interface HilariousEventProperty {
  moduledtl: string;
  sid: string;
}

export interface ViContactSeller {
  _type: ActionType;
  type: ActionKind;
  name: string;
  params: VICONTACTSELLERParams;
  clientPresentationMetadata: VICONTACTSELLERClientPresentationMetadata;
}

export interface Tion {
  _type: ActionType;
  URL: string;
  type: string;
  name: string;
  clientPresentationMetadata: VIITEMDESCRIPTIONClientPresentationMetadata;
  trackingList?: HelpTracking[];
}

export interface VIITEMDESCRIPTIONClientPresentationMetadata {
  viewTitle: string;
}

export interface CardModule {
  _type: "CARD_MODULE";
  card: Card;
  meta: BuyBoxActionModuleMeta;
}

export interface Card {
  _type: string;
  listingId: string;
  title: DisplayLabel;
  image: CardImage;
}

export interface CardImage {
  _type: ProfileLogoType;
  imageId: string;
  imageIdType: ImageIDType;
  URL: string;
}

export interface ConditionViewModel {
  _type: "ConditionViewModel";
  displayLabel: DisplayLabel;
  displayValue: DisplayValue;
  meta: BuyBoxActionModuleMeta;
}

export interface DisplayValue {
  _type: string;
  text: Text;
}

export interface Text {
  _type: TitleType;
  textSpans: HeadlineTextSpan[];
  accessibilityText: string;
  action: TextAction;
}

export interface TextAction {
  _type: ActionType;
  type: string;
  name: string;
  clientPresentationMetadata: FluffyClientPresentationMetadata;
  trackingList: HelpTracking[];
  accessibilityText: string;
}

export interface FluffyClientPresentationMetadata {
  region: string;
  presentationType: string;
}

export interface DetailedSellerRatingSummaryModule {
  _type: "DetailedSellerRatingSummaryModel";
  title: TitleElement;
  subTitle: DisplayLabel;
  ratingDetails: RatingDetail[];
}

export interface RatingDetail {
  ratingLabel: DisplayLabel;
  starRating: StarRating;
}

export interface StarRating {
  _type: string;
  averageRating: FeedbackRatingSelectionLabel;
}

export interface FeedbackRatingSelectionLabel {
  _type: TitleType;
  value?: number;
  textSpans: DisplayLabelTextSpan[];
  accessibilityText: string;
}

export interface FeedbackTabbedSummaryModule {
  _type: "FeedbackTabbedSummaryModel";
  meta: BuyBoxActionModuleMeta;
  label: TitleElement;
  feedbackTabViews: FeedbackTabView[];
}

export interface FeedbackTabView {
  _type: string;
  tab: Tab;
  feedbackCards: FeedbackCard[];
  seeAllFeedback: SeeAllFeedback;
  feedbackRatingSelectionLabel: FeedbackRatingSelectionLabel;
  feedbackRatingSelection: FeedbackRatingSelection[];
  filterSelectionButton: FilterSelectionButton;
  topicsAccessibilityText: string;
  filtersExpandCollapseControls: FiltersExpandCollapseControls;
  topics?: TopicElement[];
}

export interface FeedbackCard {
  _type: FeedbackCardType;
  feedbackId: string;
  feedbackInfo: FeedbackInfo;
  feedbackAction: FeedbackActionClass;
  viewportTracking: ViewportTracking;
  trackingList: FeedbackCardTrackingList[];
}

export enum FeedbackCardType {
  FeedbackCard = "FeedbackCard",
}

export interface FeedbackActionClass {
  _type: ActionType;
  type: ActionKind;
  name: FeedbackActionName;
  params: FeedbackActionParams;
  clientPresentationMetadata: FeedbackActionClientPresentationMetadata;
  trackingList: VIADDTOCARTTrackingList[];
}

export interface FeedbackActionClientPresentationMetadata {
  cta: Cta;
}

export enum Cta {
  SellLike = "SELL_LIKE",
  ViewFeedback = "VIEW_FEEDBACK",
}

export enum FeedbackActionName {
  Feedback = "FEEDBACK",
}

export interface FeedbackActionParams {
  tab: ActionSource;
  listingId: string;
  sort: Sort;
  username: SellerUserNameEnum;
  allItemsTabListingId?: string;
  commentType?: string;
  filter_topic?: string;
}

export enum Sort {
  Relevancev2 = "RELEVANCEV2",
}

export interface FeedbackInfo {
  rating: RatingClass;
  context: FeedbackRatingSelectionLabel;
  contextTime: FeedbackRatingSelectionLabel;
  comment: FeedbackRatingSelectionLabel;
  readMore: ReadMore;
  imageCount: string;
  verifiedPurchaseSignal?: DisplayLabel;
  item?: FeedbackInfoItem;
  image?: ProfileLogo;
}

export interface FeedbackInfoItem {
  itemSummary: ItemSummary;
}

export interface ItemSummary {
  _type: TitleType;
  textSpans: HeadlineTextSpan[];
  action?: ItemSummaryAction;
}

export interface ItemSummaryAction {
  _type: ActionType;
  type: ActionKind;
  name: string;
  params: FluffyParams;
  trackingList: IndecentTrackingList[];
}

export interface IndecentTrackingList {
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: AmbitiousEventProperty;
}

export interface AmbitiousEventProperty {
  sid: string;
}

export interface RatingClass {
  _type: ActionType;
  name: RatingName;
  accessibilityText: AccessibilityTextEnum;
  type?: string;
}

export enum AccessibilityTextEnum {
  CloseDialog = "Close dialog",
  PositiveFeedbackRating = "Positive feedback rating",
}

export enum RatingName {
  Dismiss = "DISMISS",
  Positive = "POSITIVE",
}

export interface ReadMore {
  _type: TitleType;
  textSpans: HeadlineTextSpan[];
  action: ReadMoreAction;
}

export interface ReadMoreAction {
  _type: ActionType;
  type: ActionKind;
  name: PurpleName;
  params: TentacledParams;
  trackingList: VIADDTOCARTTrackingList[];
}

export interface FeedbackCardTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: PurpleActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: CunningEventProperty;
}

export interface CunningEventProperty {
  fdbk_username: null;
  moduledtl: string;
  sid: PurpleSid;
}

export enum PurpleSid {
  P4429486M86322L178179 = "p4429486.m86322.l178179",
  P4429486M86322L178180 = "p4429486.m86322.l178180",
}

export interface FeedbackRatingSelection {
  _type: string;
  selected: boolean;
  paramKey: string;
  paramValue: string;
  label: FeedbackRatingSelectionLabel;
  action: FeedbackRatingSelectionAction;
}

export interface FeedbackRatingSelectionAction {
  _type: ActionType;
  type: ActionKind;
  name: FeedbackActionName;
  params: FeedbackActionParams;
  clientPresentationMetadata: FeedbackActionClientPresentationMetadata;
  trackingList: HilariousTrackingList[];
}

export interface HilariousTrackingList {
  eventFamily: string;
  eventAction: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IMAGEBANNERSTATUSCLICKEventProperty;
  clientImpressionPageId: string;
}

export interface IMAGEBANNERSTATUSCLICKEventProperty {
  itm: string;
  rating?: string;
  moduledtl: string;
  sid: string;
}

export interface FilterSelectionButton {
  _type: TitleType;
  textSpans: DisplayLabelTextSpan[];
  action: ViAddToCart;
}

export interface FiltersExpandCollapseControls {
  _type: string;
  collapsedModeCount: number;
  collapsedModeCardCount: number;
  viewLess: DisplayLabel;
  viewMore: DisplayLabel;
}

export interface SeeAllFeedback {
  _type: string;
  text: string;
  type: TypeElement;
  action: FeedbackActionClass;
  accessibilityText: string;
}

export interface Tab {
  _type: string;
  selected: boolean;
  label: FilterSelectionButton;
}

export interface TopicElement {
  _type: string;
  topic: TopicTopic;
}

export interface TopicTopic {
  _type: string;
  selected: boolean;
  label: DisplayLabel;
  action: FeedbackActionClass;
}

export interface HeaderAndOverlayViewModel {
  _type: "HeaderAndOverlayViewModel";
  shareHeader: MenuShare;
  menuShare: MenuShare;
  menuWatch: MenuWatch;
  menuUnwatch: MenuWatch;
  menuSellOneLikeThis: MenuSellOneLikeThis;
  helpTracking: HelpTracking;
  meta: BuyBoxActionModuleMeta;
}

export interface MenuSellOneLikeThis {
  _type: string;
  text: string;
  type: TypeElement;
  action: MenuSellOneLikeThisAction;
  accessibilityText: string;
  actionId: string;
}

export interface MenuSellOneLikeThisAction {
  _type: ActionType;
  type: ActionKind;
  name: string;
  params: StickyParams;
  clientPresentationMetadata: FeedbackActionClientPresentationMetadata;
  tracking: HelpTracking;
}

export interface StickyParams {
  listingMode: string;
  categoryIdPath: string;
  siteId: string;
  listingId: string;
}

export interface MenuShare {
  _type: string;
  text: string;
  type: TypeElement;
  action: MenuShareAction;
  accessibilityText: string;
}

export interface MenuShareAction {
  _type: ActionType;
  type: string;
  name: string;
  clientPresentationMetadata: TentacledClientPresentationMetadata;
  trackingList: HelpTracking[];
}

export interface TentacledClientPresentationMetadata {
  url: string;
  itemId: string;
}

export interface MenuWatch {
  _type: string;
  text: string;
  type: TypeElement;
  action: MenuUnwatchAction;
  accessibilityText: string;
  actionId: string;
}

export interface MenuUnwatchAction {
  _type: ActionType;
  URL: string;
  type: string;
  name: string;
  params: ClientPresentationMetadataClass;
  trackingList: HelpTracking[];
}

export interface LayoutSectionModule {
  _type: "LayoutSectionModule";
  title: DisplayLabel;
  sectionLayout: Layout;
  sections: Sections;
  hint: string[];
  meta: BuyBoxActionModuleMeta;
}

export interface Layout {
  LIST_1_COLUMN: string[];
}

export interface Sections {
  shipping: Shipping;
  title: SectionsTitle;
}

export interface Shipping {
  _type: string;
  dataItemLayout: Layout;
  dataItems: DataItems;
}

export interface DataItems {
  handlingTime: HandlingTime;
  deliveryto: Deliveryto;
  shipsto: Excludes;
  excludes: Excludes;
  taxes: Taxes;
  itemLocation: HandlingTime;
}

export interface Deliveryto {
  _type: string;
  labels: DisplayLabel[];
  values: TitleElement[];
}

export interface Excludes {
  _type: string;
  labels: DisplayLabel[];
  value: DisplayLabel;
  expandControls: ExpandControls;
}

export interface ExpandControls {
  _type: string;
  collapsedModeCardCount: number;
  viewLess: TitleElement;
  viewMore: TitleElement;
}

export interface HandlingTime {
  _type: string;
  labels: DisplayLabel[];
  values: DisplayLabel[];
}

export interface Taxes {
  _type: string;
  labels: DisplayLabel[];
  values: Value[];
}

export interface Value {
  _type: TitleType;
  textSpans: HeadlineTextSpan[];
  accessibilityText?: string;
  action?: ValueAction;
}

export interface ValueAction {
  _type: ActionType;
  URL: string;
  type: string;
  name: string;
  clientPresentationMetadata: StickyClientPresentationMetadata;
  trackingList: HelpTracking[];
}

export interface StickyClientPresentationMetadata {
  useSso: string;
}

export interface SectionsTitle {
  _type: string;
  title: DisplayLabel;
}

export interface PictureViewModel {
  _type: "PictureViewModel";
  selectedIndex: number;
  aspectType: string;
  showNavOnHover: boolean;
  thumbnailPanelType: string;
  thumbnailsViewerInfo: ThumbnailsViewerInfo;
  mediaList: MediaList[];
  nav: Nav;
  photosLabel: DisplayLabel;
  bannerStatus: DisplayLabel;
  stockImageAvailable: boolean;
  itemId: string;
  clientSideTracking: ClientSideTracking;
  accessibilityText: AccessibilityTextClass;
  mainViewWatchAction: MainViewWatchAction;
  meta: BuyBoxActionModuleMeta;
}

export interface AccessibilityTextClass {
  BACK_BUTTON: BackButton;
  CLOSE_DIALOG: BackButton;
  SECTION_HEADER: BackButton;
  OPEN_DIALOG: BackButton;
}

export interface BackButton {
  text: string;
}

export interface ClientSideTracking {
  IMAGE_SWIPE: Image;
  IMAGE_GALLERY_SINGLE_VIEW_IMAGE_DONE: Image;
  IMAGE_GALLERY_GROUP_VIEW_IMAGE_CLICK: Image;
  IMAGE_GALLERY_GROUP_VIEW_ICON: Image;
  IMAGE_CLICK: Image;
  IMAGE_GALLERY_SINGLE_VIEW_IMAGE_SWIPE: Image;
  IMAGE_GALLERY_GROUP_VIEW_DONE: Image;
  IMAGE_BANNER_STATUS_CLICK: Image;
}

export interface Image {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKinds: ActionKind[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IMAGEBANNERSTATUSCLICKEventProperty;
}

export interface MainViewWatchAction {
  _type: string;
  onCallToAction: OffCallToActionClass;
  offCallToAction: OffCallToActionClass;
  initialState: string;
  additionalParamKeyValues: AdditionalParamKeyValues;
}

export interface AdditionalParamKeyValues {
  watch_fail: string;
  watch_select_sku_error: string;
  watch_remove_action_error: string;
  unwatch_fail: string;
  watch_overflow: string;
  watch_list_already_full: string;
  watch_already_in_list: string;
}

export interface OffCallToActionClass {
  _type: string;
  text: string;
  type: TypeElement;
  action: OffCallToActionAction;
  accessibilityText: string;
  actionId: string;
}

export interface OffCallToActionAction {
  _type: ActionType;
  type: string;
  name: string;
  clientPresentationMetadata: IndigoClientPresentationMetadata;
  trackingList: IndigoTrackingList[];
}

export interface IndigoClientPresentationMetadata {
  itemId: string;
  counterPosition: string;
  presentationType: string;
  moduleKey: string;
}

export interface MediaList {
  _type: string;
  navTitle: DisplayLabel;
  image: MediaListImage;
  uploadedImageSize: Size;
  imageClickAction: ImageClickAction;
  isEPS: boolean;
  trackingMap: TrackingMap;
  mediaType: string;
}

export interface MediaListImage {
  _type: string;
  thumbnail: ProfileLogo;
  originalImg: ProfileLogo;
  zoomImg: ProfileLogo;
  isStockPhoto: boolean;
}

export interface ImageClickAction {
  _type: ActionType;
  type: string;
  name: string;
  clientPresentationMetadata: ImageClickActionClientPresentationMetadata;
  trackingList: GridItemClick[];
}

export interface ImageClickActionClientPresentationMetadata {
  mode: string;
}

export interface GridItemClick {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: GRIDITEMCLICKEventProperty;
}

export interface GRIDITEMCLICKEventProperty {
  pageci: string;
  count: string;
  index: string;
  moduledtl: string;
}

export interface TrackingMap {
  GRID_ITEM_CLICK: GridItemClick;
  THUMBNAIL_ITEM_CLICK: GridItemClick;
  MASON_ITEM_CLICK: GridItemClick;
}

export interface Nav {
  _type: string;
  enabled: boolean;
  nextTitle: DisplayLabel;
  prevTitle: DisplayLabel;
  close: DisplayLabel;
  gallery: DisplayLabel;
  enlarge: DisplayLabel;
  galleryLabel: DisplayLabel;
}

export interface ThumbnailsViewerInfo {
  _type: string;
  viewportTracking: ViewportTracking;
  trackingList: ThumbnailsViewerInfoTrackingList[];
}

export interface PlaceholderMerchNavigationModule {
  _type: "PLACEHOLDER_MERCH_NAVIGATION";
  placementId: string;
  listingId: string;
  mskuVariationId: string;
  meta: BuyBoxActionModuleMeta;
}

export interface SectionModule {
  _type: "SectionModule";
  sections: Section[];
  action: RatingClass;
  title: DisplayLabel;
  meta: BuyBoxActionModuleMeta;
}

export interface Section {
  _type: string;
  dataItems: DisplayLabel[];
}

export interface SemanticDataModule {
  _type: "SemanticDataModule";
  refreshTimers: RefreshTimers;
  enableAuctionRefresh: boolean;
  isHighBidder: boolean;
  marketplaceListedOn: string;
  listingLocale: string;
  listingStatus: string;
  singleSkuOutOfStock: boolean;
  immediatePay: boolean;
  sellerUserName: SellerUserNameEnum;
  listingId: string;
  description: string;
  startDate: EndDate;
  endDate: EndDate;
  exchangeRate: ExchangeRate;
  guestCheckout: boolean;
  meta: BuyBoxActionModuleMeta;
}

export interface EndDate {
  value: string;
  formattedValue: string;
}

export interface RefreshTimers {
  sameDayDeliveryCutoff: null;
}

export interface TitleViewModel {
  _type: "TitleViewModel";
  mainTitle: DisplayLabel;
  meta: BuyBoxActionModuleMeta;
  action: Tion;
}

export interface VasDataModule {
  _type: "VASDataModel";
  dummy: boolean;
  supportedVASTypes: string[];
  meta: VasDataModuleMeta;
}

export interface VasDataModuleMeta {
  name: string;
  moduleIdentification: ModuleIdentification;
}

export interface VlsViewModule {
  errorMessage: ErrorMessage;
  listing: Listing;
  buyingContext: BuyingContext;
  _type: "VLSViewModule";
}

export interface BuyingContext {
  hotnessSignals: HotnessSignal[];
}

export interface HotnessSignal {
  signal: string;
  signalId: number;
  signalCategory: string;
  hotnessRank: number;
  hotnessMessage?: string;
  displayLevel: string;
  signalGroup: string;
  properties?: HotnessSignalProperty[];
}

export interface HotnessSignalProperty {
  propertyName: string;
  propertyValues: PropertyPropertyValue[];
}

export interface PropertyPropertyValue {
  longValue?: number;
  intValue?: number;
}

export interface ErrorMessage {
  error: Error[];
}

export interface Error {
  errorId: number;
  domain: string;
  severity: string;
  category: string;
  message: string;
  parameter: Parameter[];
}

export interface Parameter {
  value: string;
  name: string;
}

export interface Listing {
  listingId: string;
  marketplaceListedOn: string;
  version: number;
  title: Description;
  description: Description;
  images: ImageElement[];
  format: string;
  tradingSummary: TradingSummary;
  listingLifecycle: ListingLifecycle;
  inventoryLocations: InventoryLocationElement[];
  exposureEnhancementDetail: ExposureEnhancementDetail;
  multipleVariationsListed: boolean;
  visitCounterType: string;
  userToListingRelationshipSummary: UserToListingRelationshipSummary;
  itemVariations: ItemVariation[];
  listingClassification: ListingClassification;
  termsAndPolicies: TermsAndPolicies;
  seller: Seller;
  listingLocale: string;
  sellerSKU: string;
  listingProperties: ListingProperty[];
  sellerOffer: SellerOffer[];
}

export interface Description {
  content: string;
}

export interface ExposureEnhancementDetail {
  enhancements: Enhancement[];
}

export interface Enhancement {
  name: Description;
  values: Description;
}

export interface ImageElement {
  imageURL: string;
  hostingPlatform: string;
  imageURLType: string;
  imageURLElements: ImageURLElements;
  origin: string;
  uploadMethod: string;
  originalSize: Size;
  encoding?: string;
  size?: Size;
}

export interface ImageURLElements {
  ZOOM_GUID: string;
}

export interface InventoryLocationElement {
  address: Address;
}

export interface Address {
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
}

export interface ItemVariation {
  itemVariationId: string;
  bestOfferSettings: BestOfferSettings;
  priceSettings: ItemVariationPriceSettings;
  purchasingQuantityTerms: PurchasingQuantityTerms;
  quantityAndAvailabilityByLogisticsPlans: QuantityAndAvailabilityByLogisticsPlan[];
  itemVariationTradingSummary: ItemVariationTradingSummary;
  userToItemVariationRelationshipSummary: UserToItemVariationRelationshipSummary;
}

export interface BestOfferSettings {
  bestOfferEnabled: boolean;
}

export interface ItemVariationTradingSummary {
  watchCount: number;
  computations: BuyerProtectionProperties;
}

export interface BuyerProtectionProperties {}

export interface ItemVariationPriceSettings {
  exchangeRate: ExchangeRate;
  includedVATInPrices: boolean;
  computations: Computations;
}

export interface Computations {
  price: BuyItNowPriceClass;
  buyItNowPrice: BuyItNowPriceClass;
}

export interface BuyItNowPriceClass {
  basePrice: ExchangeRate;
  chargeComponents: ChargeComponent[];
  chargeRollups: ChargeRollup[];
}

export interface ChargeComponent {
  componentId: string;
  amount: ExchangeRate;
  componentDefinition: string;
}

export interface ChargeRollup {
  rollupName: string;
  amount?: ExchangeRate;
  includesComponents?: string[];
}

export interface PurchasingQuantityTerms {
  lotSize: number;
  minRemnantSet: number;
}

export interface QuantityAndAvailabilityByLogisticsPlan {
  quantityAndAvailability: QuantityAndAvailability;
  applicableLogisticsPlans: string[];
}

export interface QuantityAndAvailability {
  availabilityStatus: string;
  availableQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
}

export interface UserToItemVariationRelationshipSummary {
  userToItemVariationRelationshipComputation: BuyerProtectionProperties;
}

export interface ListingClassification {
  inAdultCateogry: boolean;
  productIdentifiedByeBay: boolean;
  popcornEligible: boolean;
  generalCondition: GeneralCondition;
  sellerSpecifiedAspect: SellerSpecifiedAspect[];
  leafCategories: LeafCategory[];
}

export interface GeneralCondition {
  condition: Condition;
}

export interface Condition {
  conditionId: string;
  name: Description;
  description: Description;
  conditionHelpId: string;
}

export interface LeafCategory {
  rank: number;
  categoryPathFromRoot: CategoryPathFromRoot;
}

export interface CategoryPathFromRoot {
  consolidatedCategoryProperties: ConsolidatedCategoryProperty[];
  categoryIdentifier: CategoryIdentifierElement[];
}

export interface CategoryIdentifierElement {
  categoryId: number;
  name: Description;
  level: number;
}

export interface ConsolidatedCategoryProperty {
  propertyName: string;
  propertyValues: ConsolidatedCategoryPropertyPropertyValue[];
}

export interface ConsolidatedCategoryPropertyPropertyValue {
  intValue?: number;
  booleanValue?: boolean;
}

export interface SellerSpecifiedAspect {
  rank: number;
  sameValueForAllItemVariations: boolean;
  chosenBySellerToShowImages: boolean;
  name: Description;
  aspectValues: AspectValue[];
}

export interface AspectValue {
  type: string;
  rank: number;
  value: Description;
}

export interface ListingLifecycle {
  scheduledStartDate: EndDate;
  scheduledEndDate: EndDate;
  originalScheduledEndDate: EndDate;
  listingDuration: string;
  goodTillCancelled: boolean;
  revisionCount: number;
  timeRemaining: TimeRemaining;
  listingRevisions: ListingRevision[];
  listingStatus: string;
}

export interface ListingRevision {
  revisionDate: EndDate;
  listingVersion: number;
}

export interface TimeRemaining {
  value: number;
  unit: string;
}

export interface ListingProperty {
  propertyName: string;
  propertyValues: ListingPropertyPropertyValue[];
}

export interface ListingPropertyPropertyValue {
  booleanValue?: boolean;
  doubleValue?: number;
  intValue?: number;
  stringValue?: string;
}

export interface Seller {
  userIdentifier: UserIdentifier;
  businessUser: boolean;
  feedbackScore: number;
  positiveFeedbackPercentage: number;
  privateFeedbackProfile: boolean;
  designation: string;
  registrationDate: EndDate;
  registrationMarketPlaceId: string;
  registrationLocale: string;
  feedbackBasedSegment: number;
  volumeBasedSegment: number;
  powerSeller: boolean;
  specialityPrivateSeller: boolean;
  privateSaleAuthorized: boolean;
  customerSupportContactAvailable: boolean;
  hasStore: boolean;
  vehicleDealer: boolean;
  ebayStore: EbayStore;
  sellerProperties: SellerPropertyElement[];
  emailSupport: boolean;
  avatarImage: ImageElement;
  hasImage: boolean;
}

export interface EbayStore {
  storeCategories: StoreCategory[];
  storeZoomGuid: string;
  name: string;
  displayName: Description;
}

export interface StoreCategory {
  categoryIdentifier: StoreCategoryCategoryIdentifier;
}

export interface StoreCategoryCategoryIdentifier {
  categoryId: number;
}

export interface SellerPropertyElement {
  propertyName: PropertyName;
  propertyValues: HasUnansweredQuestion[];
}

export enum PropertyName {
  EbayCollectAndRemitTax = "EBAY_COLLECT_AND_REMIT_TAX",
  EbayPaymentsSupported = "EBAY_PAYMENTS_SUPPORTED",
  IsSelected = "IS_SELECTED",
  PassionPlatformOptIn = "PASSION_PLATFORM_OPT_IN",
  SyiAutoPaySelected = "SYI_AUTO_PAY_SELECTED",
}

export interface HasUnansweredQuestion {
  booleanValue: boolean;
}

export interface UserIdentifier {
  userId: string;
  username: SellerUserNameEnum;
  publicUserId: string;
}

export interface SellerOffer {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  title: string;
  subTitle: string;
  offerMessageDetail: OfferMessageDetail;
  offerImage: OfferImage[];
  offerSellerName: SellerUserNameEnum;
  displayBanner: boolean;
  commitToBuySkipped: boolean;
  displayAsPills: boolean;
  offerTierDetail: OfferTierDetail[];
}

export interface OfferImage {
  imageType: string;
  imageUrl: string;
}

export interface OfferMessageDetail {
  textMessage: string;
  htmlMessage: string;
  teaserMessage: string;
}

export interface OfferTierDetail {
  tierName: string;
  tierOrder: string;
  offerConditionDetail: OfferConditionDetail;
}

export interface OfferConditionDetail {
  offerCondition: Offer[];
  offerDiscount: Offer[];
  priceSettings: OfferConditionDetailPriceSettings;
}

export interface Offer {
  type: OfferConditionType;
  value: string;
}

export enum OfferConditionType {
  BuyQuantity = "BUY_QUANTITY",
  BuyQuantityLimit = "BUY_QUANTITY_LIMIT",
  PercentageOff = "PERCENTAGE_OFF",
}

export interface OfferConditionDetailPriceSettings {
  price: ExchangeRate;
}

export interface TermsAndPolicies {
  hideBuyerIdentity: boolean;
  eligibleForGuestCheckout: boolean;
  guestCheckoutEligibility: boolean;
  logisticsTerms: LogisticsTerms;
  buyerProtectionPolicy: BuyerProtectionPolicy;
  paymentTerms: PaymentTerms;
  applicableReturnTerms: ApplicableReturnTerm[];
  applicableTax: ApplicableTax[];
  allEligibleTrustBadges: string[];
}

export interface ApplicableReturnTerm {
  returnsAccepted: boolean;
  returnsSpecifiedBySeller: boolean;
  properties: SellerPropertyElement[];
}

export interface ApplicableTax {
  jurisdiction: Jurisdiction;
  taxType: TaxType;
  properties: SellerPropertyElement[];
  applicableToShipping: boolean;
  state: State;
}

export interface Jurisdiction {
  regionName: string;
}

export interface State {
  regionName: string;
  regionType: StateRegionType;
}

export enum StateRegionType {
  StateOrProvince = "STATE_OR_PROVINCE",
}

export enum TaxType {
  State = "STATE",
}

export interface BuyerProtectionPolicy {
  buyerProtectionProgram: string;
  buyerProtectionStatus: string;
  buyerProtectionProperties: BuyerProtectionProperties;
  embgProgramDetail: EmbgProgramDetail;
}

export interface EmbgProgramDetail {
  name: string;
  policyUrl: string;
  description: string[];
}

export interface LogisticsTerms {
  logisticsPlan: LogisticsPlan[];
  supportedLogisticsRegions: SupportedLogisticsRegions;
  sellerSalesTaxTableUsed: boolean;
  listingSiteCountry: number;
  listingCountry: number;
  s2HLogisticsPlanOnly: boolean;
}

export interface LogisticsPlan {
  planType: string;
  steps: Step[];
  planDirection: string;
  minTotalCostToBuyer: ExchangeRate;
  maxTotalCostToBuyer: ExchangeRate;
  minDeliveryEstimate: DeliveryEstimate;
  handlingPolicy: HandlingPolicy;
}

export interface HandlingPolicy {
  handlingTime: TimeRemaining;
  sameDayHandling: boolean;
  businessDaysOnly: boolean;
}

export interface DeliveryEstimate {
  timeEstimate: TimeEstimate;
  estimateTreatment: string[];
}

export interface TimeEstimate {
  minDays: number;
  maxDays: number;
  minDate: string;
  maxDate: string;
}

export interface Step {
  sequence: number;
  stepType: string;
  executorType: string;
  intermediated: boolean;
  stepExtension: StepExtension;
}

export interface StepExtension {
  type: string;
  freeShippingAvailable: boolean;
  internationalShippingAvailable: boolean;
  shippingOption: ShippingOption[];
  originLocation: OriginLocation;
}

export interface OriginLocation {
  location: OriginLocationLocation;
}

export interface OriginLocationLocation {
  locationId: string;
  address: BuyerProtectionProperties;
}

export interface ShippingOption {
  referenceId: string;
  logisticsBrandings: LogisticsBranding[];
  logisticsDisplayContainer: LogisticsDisplayContainer;
  shippingMethod: ShippingMethod;
  rank: number;
  rankScope: string;
  promotionalShipping: boolean;
  deliveryEstimate: DeliveryEstimate;
  insurance: Insurance;
  totalCostToBuyer: ExchangeRate;
  shippingCostPlan: ShippingCostPlan;
  selected: boolean;
  location: InventoryLocationElement;
  logisticDisplayMessages: any[];
}

export interface Insurance {
  insuranceOption: string;
}

export interface LogisticsBranding {
  logisticsBrandingType: string;
}

export interface LogisticsDisplayContainer {
  shippingDisplay: ShippingDisplay;
  deliveryDisplay: DeliveryDisplay;
}

export interface DeliveryDisplay {
  displayText: DeliveryDisplayDisplayText;
}

export interface DeliveryDisplayDisplayText {
  contentId: string;
}

export interface ShippingDisplay {
  displayText: ShippingDisplayDisplayText;
}

export interface ShippingDisplayDisplayText {
  content: string;
  displayHint: TypeElement;
}

export interface ShippingCostPlan {
  costPlanType: string;
  shippingCost: ExchangeRate;
  shippingBaseCost: ExchangeRate;
  freeShipping: boolean;
  additionalUnitShippingCost: ExchangeRate;
}

export interface ShippingMethod {
  shippingMethodCode: ShippingMethodCode;
  shippingMethodCategory: ShippingMethodCategory;
  carrier: Carrier;
  domesticOrInternational: string;
}

export interface Carrier {
  value: string;
}

export interface ShippingMethodCategory {
  value: string;
  displayName: DisplayName;
}

export interface DisplayName {
  content: string;
  translatedFromContent: string;
}

export interface ShippingMethodCode {
  value: string;
  displayName: Description;
}

export interface SupportedLogisticsRegions {
  regionIncluded: RegionCluded[];
  regionExcluded: RegionCluded[];
}

export interface RegionCluded {
  regionName?: string;
  regionId: string;
  regionType: RegionExcludedRegionType;
}

export enum RegionExcludedRegionType {
  Country = "COUNTRY",
  CountryRegion = "COUNTRY_REGION",
  Worldwide = "WORLDWIDE",
}

export interface PaymentTerms {
  paymentMethods: PaymentMethod[];
  properties: SellerPropertyElement[];
  immediatePay: boolean;
  paymentInstallments: PaymentInstallment[];
}

export interface PaymentInstallment {
  creditPaymentMethod: PaymentMethod;
  promotionType: string;
  offerType: string;
  message: Message;
  properties: PaymentInstallmentProperty[];
  serviceProvider: string;
  preferred: boolean;
}

export interface PaymentMethod {
  rank: number;
  paymentMethodDetail: PaymentMethodDetail;
}

export interface PaymentMethodDetail {
  paymentMethod: string;
  paymentMethodType: string;
  paymentMethodMode: string;
  paymentMethodNameText: Description;
}

export interface Message {
  content: string;
  language: string;
}

export interface PaymentInstallmentProperty {
  propertyName: string;
  propertyValues: ItemLocationCountryCode[];
}

export interface ItemLocationCountryCode {
  stringValue: string;
}

export interface TradingSummary {
  publishedAnswerCount: number;
  unansweredQuestionCount: number;
  lastVisitDate: string;
  purchaseOptions: string[];
  watchCount: number;
}

export interface UserToListingRelationshipSummary {
  userToListingRelationship: string;
  userToListingStatusMessages: UserToListingStatusMessages;
}

export interface UserToListingStatusMessages {
  statusMessageDetails: BuyerProtectionProperties;
  actionsDetails: BuyerProtectionProperties;
  propertyDetails: PropertyDetails;
}

export interface PropertyDetails {
  offerExpiration: EndTime;
  isBinnable: HasUnansweredQuestion;
  itemTitle: ItemLocationCountryCode;
  activeHours: ActiveHours;
  numberOfItemsSold: ActiveHours;
  listingType: ItemLocationCountryCode;
  showWatchMessage: HasUnansweredQuestion;
  sellerUserId: ItemLocationCountryCode;
  loginStatus: ItemLocationCountryCode;
  minsLeftForOffer: ActiveHours;
  viewerToSaleRelation: ItemLocationCountryCode;
  itemId: ItemID;
  quantitySoldMode: ItemLocationCountryCode;
  totalQuantity: ActiveHours;
  hoursLeftForOffer: ActiveHours;
  unAnsweredQCount: ActiveHours;
  hasUnansweredQuestion: HasUnansweredQuestion;
  isPrivateSale: HasUnansweredQuestion;
  endTime: EndTime;
  isImmediatePay: HasUnansweredQuestion;
  primaryCategoryId: ActiveHours;
  listingSiteId: ActiveHours;
  itemLocationCountryCode: ItemLocationCountryCode;
  isSecondOfferStatusEnabled: HasUnansweredQuestion;
}

export interface ActiveHours {
  intValue: number;
}

export interface EndTime {
  datetimeValue: EndDate;
}

export interface ItemID {
  longValue: number;
}

export interface VolumePricingViewModel {
  _type: "VolumePricingViewModel";
  group: Group;
  meta: BuyBoxActionModuleMeta;
}

export interface Group {
  _type: string;
  selectionType: string;
  entries: Entry[];
  fieldId: string;
  label: DisplayLabel;
}

export interface Entry {
  _type: string;
  fieldId: string;
  selected: boolean;
  paramKey: string;
  paramValue: ParamValue;
  paramValueType: string;
  label: TitleElement;
  secondaryLabel: SecondaryLabel;
  action: EntryAction;
}

export interface EntryAction {
  _type: ActionType;
  type: string;
  name: string;
  params: EventPropertyClass;
  trackingList: AmbitiousTrackingList[];
}

export interface EventPropertyClass {
  tier: string;
  price: string;
  qty: string;
  sid: ParamsSid;
}

export enum ParamsSid {
  P4429486M146767L44579 = "p4429486.m146767.l44579",
}

export interface AmbitiousTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: ActionKind;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: EventPropertyClass;
}

export interface ParamValue {
  quantitySelected: number;
  savingInfo: FeedbackRatingSelectionLabel;
  binModel: ParamValueBinModel;
}

export interface ParamValueBinModel {
  price: BinModelPrice;
  isAddedToCart: boolean;
  priceAdditionalInfo?: PriceAdditionalInfo;
  additionalInfo?: AdditionalInfo[];
}

export interface AdditionalInfo {
  additionalText: TitleElement;
}

export interface PriceAdditionalInfo {
  additionalText: TitleElement[];
}

export interface SecondaryLabel {
  _type: TitleType;
  textSpans: HeadlineTextSpan[];
  accessibilityText: string;
}

export interface ListingDetailResponseEnvelope {
  meta: ListingDetailResponseMeta;
}

export interface ListingDetailResponseMeta {
  pageTitle: string;
  trackingList: CunningTrackingList[];
  pageTemplate: PageTemplate;
  requestParameters: RequestParameters;
}

export interface PageTemplate {
  _type: string;
  regions: Regions;
  templateId: string;
}

export interface Regions {
  CVIP_FULL_ITEM: AboutThisItemDetailed;
  SHIPPING_RETURNS_PAYMENT_DETAILED: AboutThisItemDetailed;
  CONDITION_DESCRIPTION: AboutThisItemDetailed;
  ADDITIONAL_DISCLOSURES_DETAILED: AboutThisItemDetailed;
  TAKE_BACK_DETAILED: AboutThisItemDetailed;
  MAIN_RIVER: AboutThisItemDetailed;
  ABOUT_THIS_SELLER_DETAILED: AboutThisItemDetailed;
  ABOUT_THIS_ITEM_DETAILED: AboutThisItemDetailed;
}

export interface AboutThisItemDetailed {
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
  _type: PositionType;
  moduleLocator: string;
  uxComponentName: string;
  moduleType: string;
  dataSource: string;
  moduleIdentification: ModuleIdentification;
}

export enum PositionType {
  ModulePosition = "ModulePosition",
}

export interface RequestParameters {
  itemId: string;
  fromViCache: string;
  moduleGroups: string;
}

export interface CunningTrackingList {
  eventFamily: EventFamily;
  eventAction: string;
  operationId: string;
  flushImmediately: boolean;
  eventProperty?: MagentaEventProperty;
  clientImpressionPageId?: string;
}

export interface MagentaEventProperty {
  pageci: string;
  moduledtl: string;
  item_id?: string;
  variation_id?: string;
  sid_config_id?: string;
}

export type EbayListingDetailModule =
  | VlsViewModule
  | BuyBoxModule
  | BuyBoxActionModule
  | BuyingFlowModule
  | TitleViewModel
  | PictureViewModel
  | ConditionViewModel
  | VolumePricingViewModel
  | LayoutSectionModule
  | SectionModule
  | DetailedSellerRatingSummaryModule
  | FeedbackTabbedSummaryModule
  | HeaderAndOverlayViewModel
  | CardModule
  | AdPDModule
  | PlaceholderMerchNavigationModule
  | VasDataModule
  | SemanticDataModule;

/**
 * Top-level shape of the eBay mobile view-item response
 * (`apisd.ebay.com/experience/listing_details/v2/view_item`).
 *
 * Sample-derived: `modules.<NAME>` keys are stable strings (one per UX
 * component); the `VLS` slot — which carries the structured listing record
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
