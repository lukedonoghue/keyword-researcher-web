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

export type ServiceContext = {
  name: string;
  landingPage: string;
};

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

export type CampaignStructure = {
  campaignName: string;
  landingPage?: string;
  adGroups: Record<string, Array<{
    keyword: string;
    matchType: string;
    volume: number;
    cpc: number;
    cpcLow?: number;
    cpcHigh?: number;
    competitionIndex?: number;
    qualityScore?: number;
    qualityRating?: string;
  }>>;
};
