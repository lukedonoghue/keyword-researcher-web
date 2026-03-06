export type KeywordIntent = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unknown';
export type SeedKeywordSource = 'spyfu' | 'google_ads' | 'manual' | 'service_discovery' | 'perplexity';

export type SeedKeyword = {
  text: string;
  volume: number;
  cpc: number;
  cpcLow?: number;
  cpcHigh?: number;
  competition?: string;
  competitionIndex?: number;
  rank?: number;
  source?: SeedKeywordSource;
  intent?: KeywordIntent;
  intentConfidence?: number;
  intentReason?: string;
  themes?: string[];
  tags?: string[];
  isNegativeCandidate?: boolean;
  negativeReasons?: string[];
  suppressionReasons?: string[];
  qualityScore?: number;
  qualityRating?: string;
  aiEnhanced?: boolean;
  aiIntentOverride?: KeywordIntent;
  aiConfidence?: number;
  aiReason?: string;
};

export type SuppressedKeyword = SeedKeyword & {
  suppressionReasons: string[];
};

export type NegativeKeywordListName = 'competitor' | 'universal' | 'brand' | 'funnel';
export type NegativeKeywordListScope = 'campaign' | 'ad_group' | 'mixed';
export type NegativeKeywordSource =
  | 'baseline'
  | 'ai_review'
  | 'competitor_research'
  | 'brand_identity'
  | 'suppressed_keyword'
  | 'ngram'
  | 'routing'
  | 'cross_campaign'
  | 'manual_review';

export type NegativeKeywordListItem = {
  keyword: string;
  matchType: 'Phrase' | 'Exact';
  enabled: boolean;
  reasons: string[];
  source: NegativeKeywordSource;
  variants?: string[];
  campaign?: string;
  adGroup?: string;
  occurrences?: number;
};

export type NegativeKeywordList = {
  name: NegativeKeywordListName;
  label: string;
  description: string;
  scope: NegativeKeywordListScope;
  defaultMatchType: 'Phrase' | 'Exact';
  items: NegativeKeywordListItem[];
};

export type NegativeKeyword = {
  campaign: string;
  adGroup: string;
  keyword: string;
  matchType: 'Phrase' | 'Exact';
  status: 'Negative';
  listName?: NegativeKeywordListName;
  source?: NegativeKeywordSource;
  reason?: string;
};

export type ServiceContext = {
  name: string;
  landingPage: string;
};

export type WebsiteMessagingProfile = {
  features: string[];
  benefits: string[];
  differentiators: string[];
  offers: string[];
  callsToAction: string[];
  proofPoints: string[];
  tone: string;
};

export type CampaignMatchTypeStrategy =
  | 'exact_phrase'
  | 'exact_only'
  | 'phrase_only';

export type CampaignStrategy = {
  goal: 'awareness' | 'conversions' | 'traffic';
  monthlyBudget: number;
  minVolume: number;
  maxCpc: number | null;
  minAdGroupKeywords: number;
  maxAdGroupKeywords: number;
  focusHighIntent: boolean;
  includeInformational: boolean;
  includeNegativeCandidates: boolean;
  competitorCampaignMode: 'exclude' | 'separate';
  brandCampaignMode: 'exclude' | 'separate';
  matchTypeStrategy: CampaignMatchTypeStrategy;
};

export type KeywordMetric = {
  text: string;
  volume: number;
  cpc: number;
  cpcLow: number;
  cpcHigh: number;
  competition: string;
  competitionIndex: number;
};

export type KeyStatus = {
  provider: string;
  missing: string[];
  ready: boolean;
};

export type LandingCandidate = {
  url: string;
  path: string;
  anchorText: string;
};

export type ScoredServiceCandidate = {
  name: string;
  score: number;
  bestSourceUrl: string;
  evidenceCount: number;
  sourceCounts: Record<'heading' | 'list' | 'link' | 'url', number>;
  supportingUrls: string[];
};

export type ScrapedSource = {
  url: string;
  markdown: string;
};

export type CampaignRow = {
  campaign: string;
  adGroup: string;
  keyword: string;
  matchType: string;
  maxCpc: number;
  finalUrl: string;
  status: string;
  estVolume: number;
  estCpcLow: number;
  estCpcHigh: number;
  competitionIndex: number;
  qualityScore: number;
  qualityRating: string;
};

export type SubThemeKeyword = {
  keyword: string;
  matchType: string;
  volume: number;
  cpc: number;
  cpcLow?: number;
  cpcHigh?: number;
  competitionIndex?: number;
  qualityScore?: number;
  qualityRating?: string;
  intent?: KeywordIntent;
};

export type SubTheme = {
  name: string;
  keywords: SubThemeKeyword[];
};

export type AdGroupPriority = 'core' | 'recommended' | 'additional';

export type ResponsiveSearchAd = {
  headlines: string[];
  descriptions: string[];
  path1?: string;
  path2?: string;
  source: 'ai' | 'fallback' | 'manual';
  model?: string;
};

export type AdGroup = {
  name: string;
  subThemes: SubTheme[];
  priority?: AdGroupPriority;
  priorityScore?: number;
  responsiveSearchAd?: ResponsiveSearchAd;
};

export type CampaignStructureV2 = {
  campaignName: string;
  campaignTheme: string;
  landingPage?: string;
  bidStrategy: string;
  dailyBudget?: number;
  adGroups: AdGroup[];
  priority?: 'high' | 'medium' | 'low';
  priorityScore?: number;
  intentBreakdown?: {
    transactional: number;
    commercial: number;
    informational: number;
    navigational: number;
    unknown: number;
  };
  avgCpc?: number;
  totalVolume?: number;
  recommendedBidStrategy?: string;
};

/** @deprecated Use CampaignStructureV2 instead */
export type CampaignStructure = CampaignStructureV2;
