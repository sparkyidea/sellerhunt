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
  containers: AdPDModuleContainer[];
  size: Size;
}

export enum NameEnum {
  AdPD = "AD_PD",
  BosPlaceholder = "BOS_PLACEHOLDER",
  Item = "ITEM",
  QueryAnswer = "QUERY_ANSWER",
  StatusBarAnswer = "STATUS_BAR_ANSWER",
  ThemedCarousel = "THEMED_CAROUSEL",
  Whitespace = "WHITESPACE",
}

export interface AdPDModuleContainer {
  meta: ContainerMeta;
  action: ContainerAction;
  store: Image;
  callToAction: CallToAction;
  headline: MesgGroup;
  trustSignal: MesgGroup;
  trustSignals: MesgGroup[];
  trust: Trust[];
  items: Item[];
  sponsored: LogisticsCost;
  storeName: MesgGroup;
  styles: string[];
}

export interface ContainerAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: PurpleParams;
  trackingList: PurpleTrackingList[];
}

export enum PurpleType {
  Action = "Action",
}

export interface PurpleParams {
  store_name: string;
  _sacat: string;
  promoted_items: string;
}

export interface PurpleTrackingList {
  actionKind: ActionKindEnum;
  operationId: string;
  flushImmediately: boolean;
  eventFamily?: string;
  eventAction?: EventAction;
  eventProperty?: PurpleEventProperty;
}

export enum ActionKindEnum {
  Collapse = "COLLAPSE",
  Expand = "EXPAND",
  Hidedialog = "HIDEDIALOG",
  Hscroll = "HSCROLL",
  Nav = "NAV",
  Navsrc = "NAVSRC",
  Select = "SELECT",
  Showdialog = "SHOWDIALOG",
  Viewdtls = "VIEWDTLS",
}

export enum EventAction {
  Actn = "ACTN",
}

export interface PurpleEventProperty {
  encpd: string;
  moduledtl: string;
  sid: string;
}

export interface CallToAction {
  _type: string;
  text: string;
  ctaIcon: Icon;
  action: ContainerAction;
}

export interface Icon {
  _type: IconType;
  name: IconName;
}

export enum IconType {
  Icon = "Icon",
}

export enum IconName {
  ArrowRight = "ARROW_RIGHT",
  CornerWatch = "CORNER_WATCH",
  CornerWatching = "CORNER_WATCHING",
  Redhot = "REDHOT",
}

export interface MesgGroup {
  _type: MesgGroupType;
  textSpans: BrandName[];
}

export enum MesgGroupType {
  ActionableTextualDisplay = "ActionableTextualDisplay",
  TextualDisplay = "TextualDisplay",
}

export interface BrandName {
  _type: BrandNameType;
  text?: string;
  styles?: Style[];
  action?: BrandNameAction;
  listingStyles?: ListingStyle[];
  icon?: string;
  listingType?: string;
}

export enum BrandNameType {
  ListingTextSpan = "listingTextSpan",
  TextSpan = "TextSpan",
}

export interface BrandNameAction {
  _type: PurpleType;
  type: FluffyType;
  name?: FieldID;
  trackingList?: FluffyTrackingList[];
  URL?: string;
  params?: FluffyParams;
}

export enum FieldID {
  HelpCenter = "HELP_CENTER",
  PricingLink = "pricing link",
  RefineDone = "REFINE_DONE",
  RefineShowLess = "REFINE_SHOW_LESS",
  RefineShowResults = "REFINE_SHOW_RESULTS",
  RefreshSearch = "REFRESH_SEARCH",
  Sort = "sort",
}

export interface FluffyParams {
  loadingText: string;
}

export interface FluffyTrackingList {
  eventFamily?: EventFamily;
  eventAction?: EventAction;
  actionKind: ActionKindEnum;
  actionKinds?: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: FluffyEventProperty;
}

export enum EventFamily {
  Lst = "LST",
}

export interface FluffyEventProperty {
  moduledtl?: string;
  pageci?: string;
  parentrq?: Parentrq;
  sid?: string;
  trkp?: string;
}

export enum Parentrq {
  The53Bb1De35F2A58C6 = "53bb1de35f2a58c6",
}

export enum FluffyType {
  Operation = "OPERATION",
  Webview = "WEBVIEW",
}

export enum ListingStyle {
  CenterHighlight = "CENTER_HIGHLIGHT",
  LightOutlineRed = "LIGHT_OUTLINE_RED",
  SecondaryInfo = "SECONDARY_INFO",
}

export enum Style {
  Bold = "BOLD",
  LegalLink = "LEGAL_LINK",
  Negative = "NEGATIVE",
  Primary = "PRIMARY",
  Strikethrough = "STRIKETHROUGH",
}

export interface Item {
  _type: string;
  action: ItemAction;
  listingId: string;
  image: Image;
  viewportTracking: ViewportTracking;
}

export interface ItemAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: TentacledParams;
  trackingList: PurpleTrackingList[];
}

export interface TentacledParams {
  listingId: string;
}

export interface Image {
  _type: ImageType;
  title: string;
  imageId: string;
  imageIdType: ImageIDType;
  URL: string;
  originalSize: Size;
}

export enum ImageType {
  Image = "Image",
}

export enum ImageIDType {
  ZoomGUID = "ZOOM_GUID",
}

export interface Size {
  height: number;
  width: number;
}

export interface ViewportTracking {
  trackableId: string;
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

export interface LogisticsCost {
  _type: LogisticsCostType;
  textSpans: ItemCount[];
}

export enum LogisticsCostType {
  TextualDisplay = "TextualDisplay",
  TextualDisplayValue = "TextualDisplayValue",
}

export interface ItemCount {
  _type: BrandNameType;
  text: string;
}

export interface Trust {
  _type: string;
  text: MesgGroup;
}

export interface AdPDModuleMeta {
  name: ProviderEnum;
  trackingList: StickyTrackingList[];
  moduleIdentification: PurpleModuleIdentification;
  viewportTracking: ViewportTracking;
}

export interface PurpleModuleIdentification {
  instanceId: string;
  provider: ProviderEnum;
  sojournerModuleId: string;
  uxComponentGroup: ProviderEnum;
}

export enum ProviderEnum {
  AdPDS2 = "AD_PD_S2",
  BosPlaceholder = "BOS_PLACEHOLDER",
  ItemCard = "ITEM_CARD",
  ItemsCarouselWithColor = "ITEMS_CAROUSEL_WITH_COLOR",
  NavigationAnswerTextList = "NAVIGATION_ANSWER_TEXT_LIST",
  PromotedItemCard = "PROMOTED_ITEM_CARD",
  StatusBarV2 = "STATUS_BAR_V2",
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
  keyword: string;
  itemIds: string;
  clearingPrice: string;
  bid: string;
  adSubType: string;
}

export interface BosPlaceholderModule {
  _type: "BOS_PLACEHOLDER";
  action: BosPlaceholderModuleAction;
  trackingInfo: TrackingInfo;
  POST: Post;
  variant: string;
  showSpinningCircle: boolean;
  modules: string[];
}

export interface Post {
  mainSearchContext: MainSearchContext;
}

export interface MainSearchContext {
  requestUrl: string;
  listings: Listing[];
}

export interface Listing {
  itemId: number;
  VarId: number;
  promoted: boolean;
  rank: number;
  leafCat: number;
}

export interface BosPlaceholderModuleAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: NameEnum;
  params: StickyParams;
  trackingList: any[];
}

export interface StickyParams {
  "Experience.enableBullseyeForUserPersonalization": string;
  requestedPageLayoutsForMultiLayoutRegion: RequestedPageLayoutsForMultiLayoutRegion;
  async: string;
  enableDeferredModules: string;
  moduleScenarios: string;
  pageci: string;
  _pgn: string;
  _nkw: Nkw;
  _sacat: string;
  answersVersion: string;
  _sop: string;
  _vs: string;
}

export enum Nkw {
  Toy = "toy",
}

export enum RequestedPageLayoutsForMultiLayoutRegion {
  List1_ColumnLarge1_ColumnGrid2_Column = "LIST_1_COLUMN,LARGE_1_COLUMN,GRID_2_COLUMN",
}

export interface TrackingInfo {
  moduleInstance: string;
  parentrq: Parentrq;
  trackViews: boolean;
  trackPerf: boolean;
}

export interface FloatingActionButtonModule {
  _type: "FloatingActionButtonModule";
  sortLink: SortLink;
  filterLink: FilterLink;
  follow: Follow;
}

export interface FilterLink {
  _type: MesgGroupType;
  textSpans: ItemCount[];
  action: FilterLinkAction;
}

export interface FilterLinkAction {
  _type: PurpleType;
  URL: string;
  type: FluffyType;
  name: string;
  params: CurrentParamsClass;
  trackingList: FluffyTrackingList[];
}

export interface CurrentParamsClass {
  enableDeferredModules: string;
  _nkw: Nkw;
  answersVersion: string;
  _sop: string;
  requestedPageLayoutsForMultiLayoutRegion: RequestedPageLayoutsForMultiLayoutRegion;
  _psop?: string;
  _vs: string;
  modules?: string;
  supportedUxComponentNames: string;
}

export interface Follow {
  followStatus: boolean;
  suppressQuickTip: boolean;
}

export interface SortLink {
  _type: MesgGroupType;
  textSpans: ItemCount[];
  action: BrandNameAction;
}

export interface FooterNotesListModule {
  _type: "FOOTER_NOTES_LIST";
  mesgGroup: MesgGroup[];
}

export interface ItemModule {
  _type: "ITEM";
  action: ItemModuleAction;
  id: string;
  presentityId: string;
  listingId: string;
  title: LogisticsCost;
  image: Image;
  displayPrice: Price;
  quantity: Quantity;
  logisticsCost: LogisticsCost;
  itemPropertyOrdering: ItemPropertyOrdering;
  viewportTracking: ViewportTracking;
  __search: ItemModuleSearch;
  trackingInfo: TrackingInfo;
  meta: ItemModuleMeta;
}

export interface ItemModuleSearch {
  lastOne: One;
  itemLocation: ItemCount;
  sellerInfo: SellerInfo;
  normalizedCondition: BrandName;
  defaultWatchIconOnImage: PurpleDefaultWatchIconOnImage;
  brandName: BrandName;
  /** "X sold" demand badge; absent when eBay shows no sales for the card. */
  quantitySold?: QuantitySold;
}

export interface PurpleDefaultWatchIconOnImage {
  watch: PurpleWatch;
  isWatching: boolean;
  watching: PurpleWatching;
}

export interface PurpleWatch {
  _type: string;
  icon: Icon;
  text: PurpleText;
  action: PurpleAction;
}

export interface PurpleAction {
  _type: PurpleType;
  URL: string;
  type: FluffyType;
  name: PurpleName;
  params: IndigoParams;
  trackingList: IndigoTrackingList[];
}

export enum PurpleName {
  MskuWatch = "MSKU_WATCH",
  Watch = "WATCH",
}

export interface IndigoParams {
  pt: null;
  itemId: string;
}

export interface IndigoTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: ActionKindEnum;
  actionKinds: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IndigoEventProperty;
}

export interface IndigoEventProperty {
  trackableId: string;
  clickaction: PurpleName;
  itm: string;
  moduledtl: PurpleModuledtl;
  sid: PurpleModuledtl;
}

export enum PurpleModuledtl {
  P2351460M4114L8480 = "p2351460.m4114.l8480",
}

export interface PurpleText {
  _type: MesgGroupType;
  textSpans: PurpleTextSpan[];
  accessibilityText: string;
}

export interface PurpleTextSpan {
  _type: BrandNameType;
  action: PurpleAction;
  accessibilityText: string;
}

export interface PurpleWatching {
  _type: string;
  icon: Icon;
  text: FluffyText;
  action: FluffyAction;
}

export interface FluffyAction {
  _type: PurpleType;
  URL: string;
  type: FluffyType;
  name: FluffyName;
  params: IndecentParams;
  trackingList: IndecentTrackingList[];
}

export enum FluffyName {
  MskuUnwatch = "MSKU_UNWATCH",
  Unwatch = "UNWATCH",
}

export interface IndecentParams {
  itemId: string;
}

export interface IndecentTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: ActionKind;
  actionKinds: ActionKind[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: IndecentEventProperty;
}

export enum ActionKind {
  Click = "CLICK",
}

export interface IndecentEventProperty {
  clickaction: FluffyName;
  moduledtl: FluffyModuledtl;
  sid: FluffyModuledtl;
}

export enum FluffyModuledtl {
  P2351460M4114 = "p2351460.m4114",
}

export interface FluffyText {
  _type: MesgGroupType;
  textSpans: FluffyTextSpan[];
  accessibilityText: string;
}

export interface FluffyTextSpan {
  _type: BrandNameType;
  action: FluffyAction;
  accessibilityText: string;
}

export interface One {
  _type: string;
  icon: Icon;
  text: MesgGroup;
}

export interface SellerInfo {
  _type: string;
  text: LogisticsCost;
}

export interface ItemModuleAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: HilariousParams;
  trackingList: HilariousTrackingList[];
}

export interface HilariousParams {
  listingId: string;
  _skw: Nkw;
  hash: string;
  amdata?: string;
}

export interface HilariousTrackingList {
  actionKind: ActionKindEnum;
  actionKinds: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: HilariousEventProperty;
  eventFamily?: EventFamily;
  eventAction?: EventAction;
}

export interface HilariousEventProperty {
  sid?: string;
  trackableId?: string;
  parentrq?: Parentrq;
  pageci?: string;
  orgdata?: string;
  interaction?: string;
  moduledtl?: string;
}

export interface Price {
  _type: LogisticsCostType;
  textSpans: BrandName[];
  value: Value;
  accessibilityText?: string;
}

export interface Value {
  _type: string;
  value: number;
  currency: string;
}

export interface ItemPropertyOrdering {
  DEFAULT: Default;
}

export interface Default {
  subheader: Array<string[]>;
  header: Array<string[]>;
  primary: Array<string[]>;
  caption?: Array<string[]>;
}

export interface ItemModuleMeta {
  moduleIdentification: FluffyModuleIdentification;
}

export interface FluffyModuleIdentification {
  sojournerModuleId: string;
}

export interface Quantity {
  _type: LogisticsCostType;
  textSpans: ItemCount[];
  value: number;
}

export interface NavigationsListModule {
  _type: "NAVIGATIONS_LIST";
  meta: NavigationsListModuleMeta;
  trackingInfo: TrackingInfo;
  containers: NavigationsListModuleContainer[];
  title: ContainerTitle;
}

export interface NavigationsListModuleContainer {
  _type: string;
  cards: PurpleCard[];
  title: ContainerTitle;
}

export interface PurpleCard {
  _type: string;
  title: LogisticsCost;
  action: TentacledAction;
}

export interface TentacledAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: AmbitiousParams;
  trackingList: FluffyTrackingList[];
}

export interface AmbitiousParams {
  _nkw: string;
}

export interface ContainerTitle {
  _type: MesgGroupType;
  textSpans: TitleTextSpan[];
}

export interface TitleTextSpan {
  _type: BrandNameType;
  text: string;
  accessibilityText: string;
  action?: ClearAllAction;
}

export interface ClearAllAction {
  _type: PurpleType;
  URL: string;
  type: FluffyType;
  name: string;
  params: Param;
  trackingList: FluffyTrackingList[];
}

export interface Param {
  _fsrp: string;
  _oaa: string;
  _vs: string;
  _nkw: Nkw;
}

export interface NavigationsListModuleMeta {
  name: string;
  trackingList: any[];
  dataSource: string;
}

export interface PrefetchImageModule {
  _type: "PrefetchImageModule";
}

export interface SearchAdsModule {
  _type: "searchads";
  meta: SearchAdsModuleMeta;
  ctxUrl: string;
  placements: Placement[];
}

export interface SearchAdsModuleMeta {
  name: string;
}

export interface Placement {
  loc: string;
  init: string;
  load: string;
  pid: string;
  type: string;
  seq: string;
}

export interface SearchRefinementsModule {
  _type: "SearchRefinementsModule";
  group?: Group[];
  heading: LogisticsCost;
  baseURL: string;
  actions: Actions;
  paramKeyValues: Param;
  resultCountCTA: ResultCountCTA;
}

export interface Actions {
  done: Done;
  clearAll: ClearAll;
}

export interface ClearAll {
  _type: ClearAllType;
  textSpans?: TitleTextSpan[];
  accessibilityText: string;
  action?: ClearAllAction;
  text?: string;
  styles?: string[];
}

export enum ClearAllType {
  TextSpan = "TextSpan",
  TextualDisplay = "TextualDisplay",
}

export interface Done {
  _type: ClearAllType;
  textSpans?: Done[];
  accessibilityText: string;
  action?: BrandNameAction;
  text?: string;
}

export interface Group {
  _type: GroupType;
  fieldId: string;
  lockable?: boolean;
  paramKey?: string;
  label?: DoneClass;
  accessoryLabel?: LogisticsCost;
  action?: GroupAction;
  selectionType?: SelectionType;
  entries?: GroupEntry[];
  uxComponentHint?: string;
  needsLoad?: boolean;
  paramValueDelimiter?: string;
  expandInline?: boolean;
  heading?: LogisticsCost;
  expanded?: boolean;
  expandLabel?: Label;
  collapseLabel?: Label;
}

export enum GroupType {
  CollapsibleGroup = "CollapsibleGroup",
  Group = "Group",
  ItemConditionGroup = "ItemConditionGroup",
}

export interface GroupAction {
  _type: PurpleType;
  type: string;
  name: string;
  trackingList: FluffyTrackingList[];
  params?: CunningParams;
}

export interface CunningParams {
  surveyKey: string;
  ctx: string;
}

export interface Label {
  _type: MesgGroupType;
  textSpans: CollapseLabelTextSpan[];
  action: CollapseLabelAction;
}

export interface CollapseLabelAction {
  _type: PurpleType;
  type: FluffyType;
  name: string;
  trackingList: FluffyTrackingList[];
}

export interface CollapseLabelTextSpan {
  _type: BrandNameType;
  text: string;
  accessibilityText: string;
}

export interface GroupEntry {
  _type: TentacledType;
  fieldId?: string;
  selected?: boolean;
  paramValue?: string;
  label?: PurpleLabel;
  action?: BrandNameAction;
  defaultChoice?: boolean;
  paramKey?: string;
  uxComponentHint?: string;
  accessoryLabel?: DoneClass;
  secondaryLabel?: MesgGroup;
  paramValueType?: string;
  endParamKey?: string;
  endParamValue?: string;
  beginParamKey?: string;
  beginParamValue?: string;
  validations?: Validation[];
  beginLabel?: LogisticsCost;
  middleLabel?: LogisticsCost;
  beginPlaceHolder?: DoneClass;
  endPlaceHolder?: DoneClass;
  beginClear?: LogisticsCost;
  endClear?: LogisticsCost;
  minOnlyAccessoryLabel?: LogisticsCost;
  maxOnlyAccessoryLabel?: LogisticsCost;
  minAndMaxAccessoryLabel?: LogisticsCost;
  priceDistributionInfo?: PriceDistributionInfo[];
  additionalParamKeyValues?: PurpleAdditionalParamKeyValues;
  expandInline?: boolean;
  entries?: PurpleEntry[];
  selectionType?: SelectionType;
  paramValueDelimiter?: string;
  needsLoad?: boolean;
  message?: Message;
  heading?: LogisticsCost;
  subHeading?: LogisticsCost;
  accessibilityText?: string;
  distanceGroup?: DistanceGroup;
  zipcode?: Zipcode;
  displayTemplate?: DisplayTemplate;
  disabled?: boolean;
  layoutType?: string;
}

export enum TentacledType {
  Group = "Group",
  LayoutsField = "LayoutsField",
  PriceDistributionGraph = "PriceDistributionGraph",
  RangeEntrySelection = "RangeEntrySelection",
  RangeValueSelection = "RangeValueSelection",
  TextualSelection = "TextualSelection",
  WithinLocationField = "WithinLocationField",
}

export interface DoneClass {
  _type: MesgGroupType;
  textSpans: ItemCount[];
  accessibilityText?: string;
}

export interface PurpleAdditionalParamKeyValues {
  _oac?: string;
  _dcat?: string;
  _fspt?: string;
}

export interface DisplayTemplate {
  _type: MesgGroupType;
  textSpans: DisplayTemplateTextSpan[];
}

export interface DisplayTemplateTextSpan {
  _type: BrandNameType;
  template: string;
}

export interface DistanceGroup {
  _type: GroupType;
  fieldId: string;
  paramKey: ParamKey;
  label: LogisticsCost;
  accessoryLabel: LogisticsCost;
  uxComponentHint: string;
  selectionType: SelectionType;
  expandInline: boolean;
  entries: DistanceGroupEntry[];
}

export interface DistanceGroupEntry {
  _type: TentacledType;
  fieldId: string;
  paramValue: string;
  additionalParamKeyValues: FluffyAdditionalParamKeyValues;
  label: LogisticsCost;
  action: BrandNameAction;
  selected?: boolean;
}

export interface FluffyAdditionalParamKeyValues {
  _fspt: string;
}

export enum ParamKey {
  Age20Level = "Age%20Level",
  Brand = "Brand",
  Character20Family = "Character%20Family",
  Gender = "Gender",
  LHCharity = "LH_Charity",
  LHComplete = "LH_Complete",
  LHInVault = "LH_InVault",
  LHLPickup = "LH_LPickup",
  LHLots = "LH_Lots",
  LHSaleItems = "LH_SaleItems",
  LHSavings = "LH_Savings",
  LHSold = "LH_Sold",
  LHTitleDesc = "LH_TitleDesc",
  LhAs = "LH_AS",
  LhFr = "LH_FR",
  LhRpa = "LH_RPA",
  Sadis = "_sadis",
  Shop20For = "Shop%20For",
  Stpos = "_stpos",
}

export enum SelectionType {
  Multiple = "MULTIPLE",
  NotApplicable = "NOT_APPLICABLE",
  Single = "SINGLE",
}

export interface PurpleEntry {
  _type: ZipcodeType;
  fieldId: string;
  paramValue?: string;
  label: LogisticsCost;
  action?: BrandNameAction;
  paramKey?: ParamKey;
  additionalParamKeyValues?: TentacledAdditionalParamKeyValues;
  accessoryLabel?: DoneClass;
  uxComponentHint?: UXComponentHint;
  lockable?: boolean;
  secondaryLabel?: LogisticsCost;
  fieldActions?: FieldAction[];
  accessibilityText?: string;
  selectionType?: SelectionType;
  entries?: FluffyEntry[];
  paramValueDelimiter?: string;
  needsLoad?: boolean;
}

export enum ZipcodeType {
  Group = "Group",
  TextualEntry = "TextualEntry",
  TextualSelection = "TextualSelection",
}

export interface TentacledAdditionalParamKeyValues {
  _dcat: string;
}

export interface FluffyEntry {
  _type: TentacledType;
  fieldId: string;
  selected?: boolean;
  label: LogisticsCost;
  action: BrandNameAction;
  defaultChoice?: boolean;
  paramValue?: string;
  additionalParamKeyValues?: StickyAdditionalParamKeyValues;
  paramKey?: ParamKey;
  accessoryLabel?: DoneClass;
  uxComponentHint?: UXComponentHint;
}

export interface StickyAdditionalParamKeyValues {
  _fspt?: string;
  _dcat?: string;
}

export enum UXComponentHint {
  CarouselPill = "CAROUSEL_PILL",
  Checkbox = "CHECKBOX",
  Toggle = "TOGGLE",
  VerticalList = "VERTICAL_LIST",
  Zipcode = "ZIPCODE",
}

export interface FieldAction {
  whenAct: ActionKindEnum;
  doReact: string;
  onField: string;
}

export interface PurpleLabel {
  _type: MesgGroupType;
  textSpans: BrandName[];
  accessibilityText?: string;
}

export interface Message {
  title: LogisticsCost;
  messageType: string;
  displayIcon: boolean;
}

export interface PriceDistributionInfo {
  _type: PriceDistributionInfoType;
  minPrice: number;
  maxPrice?: number;
  matchCount: number;
  label: DoneClass;
}

export enum PriceDistributionInfoType {
  PriceRangeInfo = "PriceRangeInfo",
}

export interface Validation {
  _type: string;
  message: Message;
  required: boolean;
  primitiveType: string;
  contentType: string;
}

export interface Zipcode {
  _type: ZipcodeType;
  fieldId: string;
  paramKey: ParamKey;
  paramValue: string;
  label: LogisticsCost;
  accessoryLabel: DoneClass;
  fieldActions: FieldAction[];
}

export interface ResultCountCTA {
  _type: MesgGroupType;
  textSpans: CollapseLabelTextSpan[];
  action: BrandNameAction;
}

export interface SearchStatusModule {
  _type: "SearchStatusModule";
  includeFollowSearch: boolean;
  buyingFormatOption: BuyingFormatOption;
  itemConditionGroup: ItemConditionGroup;
  follow: Follow;
  itemCount: ItemCount;
  refineOption: RefineOption;
  viewTypeGroup: ViewTypeGroup;
  sortGroup: SortGroup;
}

export interface BuyingFormatOption {
  _type: string;
  fieldId: string;
  lockable: boolean;
  label: DoneClass;
  uxComponentHint: string;
  selectionType: SelectionType;
  entries: BuyingFormatOptionEntry[];
  statusLabel: LogisticsCost;
}

export interface BuyingFormatOptionEntry {
  _type: TentacledType;
  fieldId: string;
  selected?: boolean;
  paramKey: string;
  paramValue: string;
  label: DoneClass;
  action: StickyAction;
  defaultChoice?: boolean;
}

export interface StickyAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: MagentaParams;
  trackingList: FluffyTrackingList[];
}

export interface MagentaParams {
  enableDeferredModules: string;
  rt: string;
  _nkw: Nkw;
  answersVersion: string;
  _sop: string;
  requestedPageLayoutsForMultiLayoutRegion: RequestedPageLayoutsForMultiLayoutRegion;
  _vs: string;
  LH_All?: string;
  supportedUxComponentNames: string;
  LH_Auction?: string;
  LH_BIN?: string;
  LH_BO?: string;
}

export interface ItemConditionGroup {
  _type: string;
  fieldId: string;
  lockable: boolean;
  paramKey: string;
  label: DoneClass;
  selectionType: SelectionType;
  paramValueDelimiter: string;
  entries: ItemConditionGroupEntry[];
}

export interface ItemConditionGroupEntry {
  _type: TentacledType;
  fieldId: string;
  paramValue: string;
  label: LogisticsCost;
  accessoryLabel: DoneClass;
  action: BrandNameAction;
}

export interface RefineOption {
  _type: MesgGroupType;
  textSpans: RefineOptionTextSpan[];
  accessibilityText: string;
  action: FilterLinkAction;
  actionData: SearchRefinementsModule;
}

export interface RefineOptionTextSpan {
  _type: BrandNameType;
  text: string;
  action: FilterLinkAction;
}

export interface SortGroup {
  _type: string;
  fieldId: FieldID;
  lockable: boolean;
  paramKey: string;
  label: DoneClass;
  action: BrandNameAction;
  selectionType: SelectionType;
  entries: SortGroupEntry[];
  statusLabel: LogisticsCost;
  done: DoneClass;
}

export interface SortGroupEntry {
  _type: TentacledType;
  fieldId: string;
  selected?: boolean;
  paramValue: string;
  label: DoneClass;
  action: IndigoAction;
  defaultChoice?: boolean;
}

export interface IndigoAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  params: CurrentParamsClass;
  trackingList: FluffyTrackingList[];
}

export interface ViewTypeGroup {
  _type: GroupType;
  fieldId: string;
  paramKey: string;
  label: DoneClass;
  uxComponentHint: string;
  selectionType: SelectionType;
  expandInline: boolean;
  entries: ViewTypeGroupEntry[];
}

export interface ViewTypeGroupEntry {
  _type: TentacledType;
  fieldId: string;
  paramValue: string;
  label: LogisticsCost;
  action: IndecentAction;
  layoutType: string;
  selected?: boolean;
  defaultChoice?: boolean;
}

export interface IndecentAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: FriskyParams;
  trackingList: FluffyTrackingList[];
}

export interface FriskyParams {
  _dmd: string;
  enableDeferredModules: string;
  rt: string;
  _pgn: string;
  _nkw: Nkw;
  answersVersion: string;
  _sop: string;
  requestedPageLayoutsForMultiLayoutRegion: RequestedPageLayoutsForMultiLayoutRegion;
  _vs: string;
  supportedUxComponentNames: string;
}

export interface ThemedContainerItemCardsModule {
  _type: "THEMED_CONTAINER_ITEM_CARDS";
  containers: ThemedContainerItemCardsModuleContainer[];
  meta: ThemedContainerItemCardsModuleMeta;
  contentTheme: string;
  trackingInfo: TrackingInfo;
}

export interface ThemedContainerItemCardsModuleContainer {
  _type: string;
  controls: Controls;
  cards: FluffyCard[];
  subTitle: DoneClass;
  title: DoneClass;
}

export interface FluffyCard {
  _type: NameEnum;
  action: CunningAction;
  id: string;
  presentityId: string;
  listingId: string;
  title: LogisticsCost;
  image: Image;
  displayPrice: Price;
  additionalPrice?: Price;
  quantity: Quantity;
  logisticsCost: LogisticsCost;
  itemPropertyOrdering: ItemPropertyOrdering;
  viewportTracking: ViewportTracking;
  __search: CardSearch;
  meta: ItemModuleMeta;
}

export interface CardSearch {
  smeInfo: Trust;
  itemLocation: ItemCount;
  sellerInfo: SellerInfo;
  normalizedCondition: BrandName;
  defaultWatchIconOnImage: FluffyDefaultWatchIconOnImage;
  hasVariations?: boolean;
  brandName: BrandName;
  discount?: BrandName;
  quantitySold?: QuantitySold;
  almostGone?: One;
  watchCountTotal?: WatchCountTotal;
  formatBestOfferEnabled?: LogisticsCost;
}

export interface FluffyDefaultWatchIconOnImage {
  watch: FluffyWatch;
  isWatching: boolean;
  watching: FluffyWatching;
}

export interface FluffyWatch {
  _type: string;
  icon: Icon;
  text: TentacledText;
  action: HilariousAction;
}

export interface HilariousAction {
  _type: PurpleType;
  type: FluffyType;
  name: PurpleName;
  params: MischievousParams;
  trackingList: AmbitiousTrackingList[];
  URL?: string;
}

export interface MischievousParams {
  itemId: string;
  variationId?: string;
  pt: null;
}

export interface AmbitiousTrackingList {
  eventFamily: EventFamily;
  eventAction: EventAction;
  actionKind: ActionKindEnum;
  actionKinds: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: AmbitiousEventProperty;
}

export interface AmbitiousEventProperty {
  trackableId: string;
  clickaction: PurpleName;
  itm: string;
  amdata: Amdata;
  adctrl: Adctrl;
  enc: string;
  moduledtl: PurpleModuledtl;
  sid: PurpleModuledtl;
}

export enum Adctrl {
  AdCtrlAtwAdd = "AD_CTRL_ATW_ADD",
}

export enum Amdata {
  AmclksrcA2W = "amclksrc=A2W",
}

export interface TentacledText {
  _type: MesgGroupType;
  textSpans: TentacledTextSpan[];
  accessibilityText: string;
}

export interface TentacledTextSpan {
  _type: BrandNameType;
  action: HilariousAction;
  accessibilityText: string;
}

export interface FluffyWatching {
  _type: string;
  icon: Icon;
  text: StickyText;
  action: AmbitiousAction;
}

export interface AmbitiousAction {
  _type: PurpleType;
  type: FluffyType;
  name: FluffyName;
  params: BraggadociousParams;
  trackingList: IndecentTrackingList[];
  URL?: string;
}

export interface BraggadociousParams {
  itemId: string;
  variationId?: string;
}

export interface StickyText {
  _type: MesgGroupType;
  textSpans: StickyTextSpan[];
  accessibilityText: string;
}

export interface StickyTextSpan {
  _type: BrandNameType;
  action: AmbitiousAction;
  accessibilityText: string;
}

export interface QuantitySold {
  _type: string;
  text: QuantitySoldText;
  icon?: Icon;
}

export interface QuantitySoldText {
  _type: MesgGroupType;
  textSpans: BrandName[];
  convertedFrom: ItemCount[];
}

export interface WatchCountTotal {
  _type: string;
  text: QuantitySoldText;
}

export interface CunningAction {
  _type: PurpleType;
  URL: string;
  type: ActionKindEnum;
  name: string;
  params: HilariousParams;
  trackingList: CunningTrackingList[];
}

export interface CunningTrackingList {
  actionKind: ActionKindEnum;
  actionKinds: ActionKindEnum[];
  operationId: string;
  flushImmediately: boolean;
  eventProperty: CunningEventProperty;
  eventFamily?: EventFamily;
  eventAction?: EventAction;
}

export interface CunningEventProperty {
  sid?: string;
  trackableId?: string;
  parentrq?: Parentrq;
  pageci?: string;
  ampid?: string;
  checksum?: string;
  interaction?: string;
  enc?: string;
  moduledtl?: string;
}

export interface Controls {
  slider: Slider;
}

export interface Slider {
  _type: string;
  action: BrandNameAction;
}

export interface ThemedContainerItemCardsModuleMeta {
  trackingList: FluffyTrackingList[];
}

export interface SearchResponseEnvelope {
  meta: SearchResponseMeta;
}

export interface SearchResponseMeta {
  trackingList: FriskyTrackingList[];
  pageTemplate: PageTemplate;
  pageci: string;
  parentrq: Parentrq;
  deviceSize: string;
  searchResultsRiverViewType: string;
  globalHeaderMeta: GlobalHeaderMeta;
  followModuleMeta: FollowModuleMeta;
  promotedLabel: string;
  pagination: Pagination;
  keyword: Nkw;
  uiConfig: UIConfig;
  speedMetrics: { [key: string]: number };
  qualifiedTreatments: any[];
  sponsoredDescription: SponsoredDescription;
}

export interface FollowModuleMeta {
  followSearchText: string;
  followingSearchText: string;
  iHeartEbayEnabled: boolean;
}

export interface GlobalHeaderMeta {
  uvcc: boolean;
  topLevelCategories: string;
  appliedCategory: string;
}

export interface PageTemplate {
  _type: string;
  templateId: string;
  regions: Regions;
}

export interface Regions {
  SNACKBAR: CenterTop;
  STATUS_BAR_REGION: StatusBarRegion;
  PBE_REGION: CenterTop;
  SEARCH_RESULTS_RIVER: SearchResultsRiver;
  CENTER_TOP: CenterTop;
  SEARCH_REFINEMENTS_MODEL_V2: FabModel;
  OVERLAY: CenterTop;
  RTM: FabModel;
  FAB_MODEL: FabModel;
}

export interface CenterTop {
  _type: string;
  layouts: CENTERTOPLayouts;
}

export interface CENTERTOPLayouts {}

export interface FabModel {
  _type: string;
  layouts: FABMODELLayouts;
}

export interface FABMODELLayouts {
  LIST_1_COLUMN: List1_Column;
}

export interface List1_Column {
  _type: string;
  positions: PurplePosition[];
  name: string;
}

export interface PurplePosition {
  _type: StickyType;
  moduleLocator: string;
  moduleType: string;
}

export enum StickyType {
  ModulePosition = "ModulePosition",
}

export interface SearchResultsRiver {
  _type: string;
  accessibilityText: string;
  layouts: SEARCHRESULTSRIVERLayouts;
  viewType: string;
}

export interface SEARCHRESULTSRIVERLayouts {
  GRID_2_COLUMN: Column;
  LARGE_1_COLUMN: Column;
  LIST_1_COLUMN: Column;
}

export interface Column {
  _type: string;
  positions: GRID2_COLUMNPosition[];
  meta: GRID2_COLUMNMeta;
  name: string;
}

export interface GRID2_COLUMNMeta {
  trackingList: MagentaTrackingList[];
}

export interface MagentaTrackingList {
  eventFamily: EventFamily;
  eventAction: string;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: MagentaEventProperty;
}

export interface MagentaEventProperty {
  layt: string;
  pageci: string;
  region: string;
}

export interface GRID2_COLUMNPosition {
  _type: StickyType;
  moduleLocator?: string;
  placementSize: PlacementSize;
  uxComponentName?: ProviderEnum;
  moduleType: NameEnum;
}

export enum PlacementSize {
  Cell = "CELL",
  Row = "ROW",
}

export interface StatusBarRegion {
  _type: string;
  layouts: STATUSBARREGIONLayouts;
}

export interface STATUSBARREGIONLayouts {
  LIST_1_COLUMN: Column;
}

export interface Pagination {
  pageNumber: number;
  entriesPerPage: number;
  totalPages: number;
  totalEntries: number;
  currentParams: CurrentParamsClass;
}

export interface SponsoredDescription {
  title: TitleElement;
  content: Content;
}

export interface Content {
  _type: string;
  sections: Section[];
}

export interface Section {
  _type: string;
  dataItems: TitleElement[];
}

export interface TitleElement {
  _type: MesgGroupType;
  textSpans: ClearAll[];
  accessibilityText: string;
  action?: BrandNameAction;
}

export interface FriskyTrackingList {
  eventFamily: EventFamily;
  eventAction: string;
  operationId: string;
  flushImmediately: boolean;
  eventProperty: FriskyEventProperty;
}

export interface FriskyEventProperty {
  parentrq?: Parentrq;
  pageci?: string;
  ciid?: string;
}

export interface UIConfig {
  "Experience.ds65MwebVariant": string;
  "Experience.searchControlBarVariant": string;
  "Experience.showQuickViewOnDiversityVariant": string;
  "Experience.statusBarRedesignVariant": string;
  "Experience.enableTrustSignalConsolidation": string;
  "Experience.shouldEnableRedesignFilter": string;
  "Experience.showSellerFeedbackVariantmWeb": string;
  "Experience.itemOverflowPlacement": string;
  isRelatedSearchesModulePresent: string;
  "Experience.EnableDynamicImageSizing": string;
  "Experience.showAddToCart": string;
  "Experience.shouldUseAdsPlatformFor3P": string;
  "Experience.bosAGTypeInMobileRiver": string;
  "Experience.relocateSponsoredBadge": string;
  "Experience.enableDynamicRelatedSearches": string;
  "Experience.mobileFilterEvolutionEnabled": string;
  "Experience.visualExplorationSearch": string;
  "Experience.displayCenterDetailsSection": string;
  "Experience.enableReducedListingOnPageLoad": string;
  "Experience.removeDistanceDependencyFromCC": string;
  "Experience.quickFiltersEnabled": string;
  "Experience.priceGroupOrderVariant": string;
  "Experience.viewMoreVariant": string;
  "Experience.enableTopOfSearchRedesign": string;
  "Experience.stickySearchBarVariant": string;
  "Experience.icoCompareItems": string;
}

export type EbaySearchModule =
  | ItemModule
  | AdPDModule
  | SearchAdsModule
  | PrefetchImageModule
  | SearchStatusModule
  | FloatingActionButtonModule
  | FooterNotesListModule
  | BosPlaceholderModule
  | NavigationsListModule
  | SearchRefinementsModule
  | ThemedContainerItemCardsModule;

/**
 * Top-level shape of the eBay mobile search response
 * (`apisd.ebay.com/experience/search/v1/search_results`).
 *
 * Sample-derived: `modules` keys are dynamic ("listing1", "listing2", ...,
 * "FAB_MODEL", ...), so we type them as a record keyed by string and
 * discriminated by `_type`.
 */
export interface EbaySearchResponse {
  modules: Record<string, EbaySearchModule>;
  deferred_modules?: Array<Record<string, EbaySearchModule>>;
  meta: SearchResponseMeta;
}
