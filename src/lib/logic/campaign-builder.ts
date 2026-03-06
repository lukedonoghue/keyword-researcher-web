import type { CampaignStructureV2, AdGroup, AdGroupPriority, SubTheme, SubThemeKeyword } from '../types/index';
import { normalizeKeywordText } from './keyword-signals';

interface KeywordMetric {
  text: string;
  volume: number;
  cpc: number;
  cpcLow?: number;
  cpcHigh?: number;
  competition?: string;
  competitionIndex?: number;
  themes?: string[];
  qualityScore?: number;
  qualityRating?: string;
  intent?: 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unknown';
}

interface NegativeKeywordItem {
  campaign: string;
  adGroup: string;
  keyword: string;
  matchType: 'Phrase' | 'Exact';
  status: 'Negative';
}

type ServiceInput = string | { name: string; landingPage?: string };

type ServiceProfile = {
  name: string;
  normalizedName: string;
  tokens: string[];
  phrases: string[];
  landingPage?: string;
};

type ServiceMatch = {
  service: string;
  score: number;
};

export interface CampaignBuildOptions {
  minAdGroupKeywords?: number;
  maxAdGroupKeywords?: number;
  targetDomain?: string;
}

type AdGroupLimits = {
  min: number;
  max: number;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

const negativeSignalTerms = [
  'login', 'log in', 'signin', 'sign in', 'forgot', 'password', 'account',
  'support', 'help desk', 'faq', 'privacy', 'policy', 'terms', 'contact us',
  'cookie', 'tos', 'sitemap', 'careers', 'career', 'job', 'jobs',
  'complaint', 'disclaimer', 'newsletter', 'subscription', 'unsubscribe',
  'used', 'second hand', 'secondhand', 'diy', 'do it yourself',
  'free', 'salary', 'salaries', 'internship', 'volunteer',
  'wiki', 'wikipedia', 'reddit', 'youtube', 'forum',
];

function hasNegativeSignal(text: string, competitorNames: string[] = []): boolean {
  const normalized = normalizeKeywordText(text);
  if (!normalized) return false;

  // Check for navigational / non-commercial terms
  for (const term of negativeSignalTerms) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalized)) return true;
  }

  // Check for competitor brand names
  for (const name of competitorNames) {
    const normalizedName = normalizeKeywordText(name);
    if (!normalizedName) continue;
    const pattern = new RegExp(`\\b${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalized)) return true;
  }

  return false;
}

export class CampaignBuilder {
  private static readonly DEFAULT_MIN_AD_GROUP_KEYWORDS = 3;
  private static readonly DEFAULT_MAX_AD_GROUP_KEYWORDS = 10;

  static build(
    services: ServiceInput[],
    keywordMetrics: KeywordMetric[],
    options: CampaignBuildOptions = {},
  ): CampaignStructureV2[] {
    const normalizedServices = this.normalizeServiceProfiles(services);
    if (normalizedServices.length === 0) return [];

    const cleanKeywords = this.dedupeKeywords(keywordMetrics);
    if (cleanKeywords.length === 0) return [];

    const limits = this.resolveAdGroupLimits(options);
    const serviceProfiles = normalizedServices.map((service) => this.createServiceProfile(service));
    const keywordsByService = new Map<string, KeywordMetric[]>();
    const unmatchedKeywords: KeywordMetric[] = [];

    for (const keyword of cleanKeywords) {
      const match = this.findBestServiceMatch(keyword.text, serviceProfiles);
      if (!match || match.score < 1.5) {
        unmatchedKeywords.push(keyword);
        continue;
      }
      const existing = keywordsByService.get(match.service) ?? [];
      existing.push(keyword);
      keywordsByService.set(match.service, existing);
    }

    const campaigns: CampaignStructureV2[] = [];
    const usedLandingPages = new Set<string>();

    for (const profile of serviceProfiles) {
      const campaignKeywords = keywordsByService.get(profile.name) || [];
      const adGroups = this.buildAdGroupsV2(profile, campaignKeywords, limits);
      if (adGroups.length === 0) continue;

      // A8: Landing page fallback — construct if missing or duplicate
      let landingPage = profile.landingPage;
      if (!landingPage || usedLandingPages.has(landingPage)) {
        const domain = options.targetDomain || '';
        if (domain) {
          landingPage = `https://${domain}/${slugify(profile.name)}/`;
        }
      }
      if (landingPage) usedLandingPages.add(landingPage);

      campaigns.push({
        campaignName: `Service - ${profile.name}`,
        campaignTheme: `${profile.name} Services`,
        landingPage,
        bidStrategy: 'Maximize conversions',
        adGroups,
      });
    }

    // Distribute unmatched keywords to the primary campaign
    if (unmatchedKeywords.length > 0 && campaigns.length > 0) {
      const primary = campaigns[0];
      const primaryProfile = serviceProfiles[0];
      const existingKws = this.extractKeywordsFromAdGroups(primary.adGroups);
      const combined = this.dedupeKeywords([...existingKws, ...unmatchedKeywords]);
      primary.adGroups = this.buildAdGroupsV2(primaryProfile, combined, limits);
    } else if (unmatchedKeywords.length > 0 && campaigns.length === 0) {
      const [fallbackProfile] = serviceProfiles;
      const adGroups = this.buildAdGroupsV2(fallbackProfile, unmatchedKeywords, limits);
      if (adGroups.length > 0) {
        campaigns.push({
          campaignName: `Service - ${fallbackProfile.name}`,
          campaignTheme: `${fallbackProfile.name} Services`,
          landingPage: fallbackProfile.landingPage,
          bidStrategy: 'Maximize conversions',
          adGroups,
        });
      }
    }

    return this.assignPriority(campaigns);
  }

  static assignPriority(campaigns: CampaignStructureV2[]): CampaignStructureV2[] {
    if (campaigns.length === 0) return campaigns;

    // Compute per-campaign metrics
    const campaignMetrics = campaigns.map((campaign) => {
      const intentCounts = { transactional: 0, commercial: 0, informational: 0, navigational: 0, unknown: 0 };
      const seen = new Set<string>();
      let cpcSum = 0;
      let volumeSum = 0;
      let kwCount = 0;

      for (const ag of campaign.adGroups) {
        for (const st of ag.subThemes) {
          for (const kw of st.keywords) {
            const key = kw.keyword.toLowerCase().trim();
            if (seen.has(key)) continue;
            seen.add(key);
            const intent = kw.intent ?? this.inferIntentFromSubTheme(st.name);
            intentCounts[intent]++;
            cpcSum += kw.cpc;
            volumeSum += kw.volume;
            kwCount++;
          }
        }
      }

      const avgCpc = kwCount > 0 ? cpcSum / kwCount : 0;
      return { campaign, intentCounts, avgCpc, totalVolume: volumeSum, kwCount };
    });

    const maxAvgCpc = Math.max(...campaignMetrics.map((m) => m.avgCpc), 0.01);

    for (const m of campaignMetrics) {
      const total = m.kwCount || 1;
      // Intent score: transactional×3 + commercial×2 + informational×0.5 + navigational×0
      const rawIntentScore =
        (m.intentCounts.transactional * 3 +
          m.intentCounts.commercial * 2 +
          m.intentCounts.informational * 0.5 +
          m.intentCounts.navigational * 0) /
        total;
      // Normalize to 0-100 (max possible raw = 3)
      const intentScore = Math.min((rawIntentScore / 3) * 100, 100);
      const valueScore = (m.avgCpc / maxAvgCpc) * 100;
      const priorityScore = Math.round(intentScore * 0.7 + valueScore * 0.3);

      let priority: 'high' | 'medium' | 'low';
      let recommendedBidStrategy: string;
      if (priorityScore >= 60) {
        priority = 'high';
        recommendedBidStrategy = 'Maximize conversions';
      } else if (priorityScore >= 30) {
        priority = 'medium';
        recommendedBidStrategy = 'Maximize conversions (target CPA if budget-constrained)';
      } else {
        priority = 'low';
        recommendedBidStrategy = 'Maximize clicks';
      }

      m.campaign.priority = priority;
      m.campaign.priorityScore = priorityScore;
      m.campaign.intentBreakdown = m.intentCounts;
      m.campaign.avgCpc = m.avgCpc;
      m.campaign.totalVolume = m.totalVolume;
      m.campaign.recommendedBidStrategy = recommendedBidStrategy;
    }

    // Sort by priorityScore descending
    campaigns.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
    return campaigns;
  }

  private static inferIntentFromSubTheme(subThemeName: string): 'transactional' | 'commercial' | 'informational' | 'navigational' | 'unknown' {
    const name = subThemeName.toLowerCase();
    if (name.includes('service') || name.includes('core')) return 'transactional';
    if (name.includes('research') || name.includes('comparison')) return 'commercial';
    if (name.includes('information') || name.includes('info')) return 'informational';
    if (name.includes('brand') || name.includes('navigation')) return 'navigational';
    return 'unknown';
  }

  private static readonly actionIntents = new Set<string>(['transactional', 'commercial']);
  private static readonly researchIntents = new Set<string>(['informational', 'navigational', 'unknown']);

  private static classifyIntentTier(intent: string | undefined): 'action' | 'research' {
    if (!intent) return 'research';
    return this.actionIntents.has(intent) ? 'action' : 'research';
  }

  private static buildAdGroupsV2(
    serviceProfile: ServiceProfile,
    campaignKeywords: KeywordMetric[],
    limits: AdGroupLimits,
  ): AdGroup[] {
    const sorted = this.sortKeywords([...campaignKeywords]);
    if (sorted.length === 0) return [];

    // For very small keyword sets, single group
    if (sorted.length <= limits.min * 2) {
      const subThemes = this.buildSubThemesForGroup(sorted);
      return this.assignAdGroupPriority([{ name: serviceProfile.name, subThemes }]);
    }

    // Step 1: Split by intent tier
    const actionKeywords: KeywordMetric[] = [];
    const researchKeywords: KeywordMetric[] = [];

    for (const kw of sorted) {
      if (this.classifyIntentTier(kw.intent) === 'action') {
        actionKeywords.push(kw);
      } else {
        researchKeywords.push(kw);
      }
    }

    const adGroups: AdGroup[] = [];
    const serviceName = serviceProfile.name;

    // Step 2: Build ad groups for each tier, sub-splitting by theme if over limit
    for (const [tier, tierKeywords] of [['Action', actionKeywords], ['Research', researchKeywords]] as const) {
      if (tierKeywords.length === 0) continue;

      if (tierKeywords.length <= limits.max) {
        // Fits in one group
        const subThemes = this.buildSubThemesForGroup(tierKeywords);
        adGroups.push({ name: `${serviceName} - ${tier}`, subThemes });
      } else {
        // Sub-split by modifier theme
        const themeBuckets = this.groupKeywordsByTheme(tierKeywords, serviceProfile);
        const overflow: KeywordMetric[] = [];

        for (const [theme, keywords] of themeBuckets.entries()) {
          if (keywords.length < limits.min) {
            overflow.push(...keywords);
            continue;
          }

          const chunks = this.chunkKeywordsIntoGroups(keywords, limits);
          if (chunks.length === 0) {
            overflow.push(...keywords);
            continue;
          }

          for (const [index, chunk] of chunks.entries()) {
            if (chunk.length < limits.min) {
              overflow.push(...chunk);
              continue;
            }
            const suffix = chunks.length > 1 ? ` (${index + 1})` : '';
            const themeName = theme === 'General' ? '' : `: ${this.toTitleCase(theme)}`;
            const groupName = `${serviceName} - ${tier}${themeName}${suffix}`;
            const subThemes = this.buildSubThemesForGroup(chunk);
            adGroups.push({ name: groupName, subThemes });
          }
        }

        // Handle overflow within this tier
        if (overflow.length > 0) {
          const tierGroups = adGroups.filter((ag) => ag.name.includes(`- ${tier}`));
          if (tierGroups.length > 0 && overflow.length < limits.min) {
            this.distributeKeywordsRoundRobin(overflow, tierGroups, limits);
          } else if (overflow.length >= limits.min) {
            const chunks = this.chunkKeywordsIntoGroups(overflow, limits);
            for (const [idx, chunk] of chunks.entries()) {
              const suffix = chunks.length > 1 ? ` (${idx + 1})` : '';
              const subThemes = this.buildSubThemesForGroup(chunk);
              adGroups.push({ name: `${serviceName} - ${tier}: General${suffix}`, subThemes });
            }
          } else {
            // Too few and no tier groups exist — create a single group
            const subThemes = this.buildSubThemesForGroup(overflow);
            adGroups.push({ name: `${serviceName} - ${tier}`, subThemes });
          }
        }
      }
    }

    // Ensure no empty ad groups, then assign priorities
    const nonEmpty = adGroups.filter((ag) => ag.subThemes.some((st) => st.keywords.length > 0));
    return this.assignAdGroupPriority(nonEmpty);
  }

  static assignAdGroupPriority(adGroups: AdGroup[]): AdGroup[] {
    if (adGroups.length === 0) return adGroups;

    // Compute metrics per ad group
    const metrics = adGroups.map((ag) => {
      const seen = new Set<string>();
      let transactional = 0;
      let commercial = 0;
      let cpcSum = 0;
      let volumeSum = 0;
      let kwCount = 0;

      for (const st of ag.subThemes) {
        for (const kw of st.keywords) {
          const key = kw.keyword.toLowerCase().trim();
          if (seen.has(key)) continue;
          seen.add(key);
          const intent = kw.intent ?? 'unknown';
          if (intent === 'transactional') transactional++;
          if (intent === 'commercial') commercial++;
          cpcSum += kw.cpc;
          volumeSum += kw.volume;
          kwCount++;
        }
      }

      return { ag, transactional, commercial, cpcSum, volumeSum, kwCount };
    });

    const maxAvgCpc = Math.max(...metrics.map((m) => (m.kwCount > 0 ? m.cpcSum / m.kwCount : 0)), 0.01);
    const maxVolume = Math.max(...metrics.map((m) => m.volumeSum), 1);

    // Score each ad group
    const scored = metrics.map((m) => {
      const total = m.kwCount || 1;
      const transactionalPct = (m.transactional / total) * 100;
      const commercialPct = (m.commercial / total) * 100;
      const avgCpc = m.kwCount > 0 ? m.cpcSum / m.kwCount : 0;
      const normalizedAvgCpc = (avgCpc / maxAvgCpc) * 100;
      const normalizedVolume = (m.volumeSum / maxVolume) * 100;

      const score = Math.round(
        (transactionalPct * 0.40) +
        (commercialPct * 0.25) +
        (normalizedAvgCpc * 0.20) +
        (normalizedVolume * 0.15)
      );

      return { ag: m.ag, score, transactionalPct, commercialPct };
    });

    // Sort by score descending to find top 3
    scored.sort((a, b) => b.score - a.score);

    for (let i = 0; i < scored.length; i++) {
      const { ag, score, transactionalPct, commercialPct } = scored[i];
      let priority: AdGroupPriority;

      if (i < 3 || score >= 60 || (transactionalPct + commercialPct) > 50) {
        priority = 'core';
      } else if (i < 5 || score >= 30) {
        priority = 'recommended';
      } else {
        priority = 'additional';
      }

      ag.priority = priority;
      ag.priorityScore = score;
    }

    // Re-sort: core first, then recommended, then additional (within each tier, by score desc)
    const priorityOrder: Record<AdGroupPriority, number> = { core: 0, recommended: 1, additional: 2 };
    adGroups.sort((a, b) => {
      const pa = priorityOrder[a.priority ?? 'additional'];
      const pb = priorityOrder[b.priority ?? 'additional'];
      if (pa !== pb) return pa - pb;
      return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
    });

    return adGroups;
  }

  private static buildSubThemesForGroup(keywords: KeywordMetric[]): SubTheme[] {
    // Sub-cluster by match type: Exact vs Phrase
    const matchTypes: ('Exact' | 'Phrase')[] = ['Exact', 'Phrase'];
    const subThemes: SubTheme[] = [];

    // Also try semantic sub-clustering if there are enough keywords
    if (keywords.length >= 6) {
      // Group by intent for semantic sub-themes
      const intentGroups = new Map<string, KeywordMetric[]>();
      for (const kw of keywords) {
        const intent = kw.intent || 'general';
        const group = intentGroups.get(intent) ?? [];
        group.push(kw);
        intentGroups.set(intent, group);
      }

      // If we get meaningful intent groups, use them
      if (intentGroups.size > 1) {
        const intentLabels: Record<string, string> = {
          transactional: 'Service Queries',
          commercial: 'Research & Comparison',
          informational: 'Information',
          general: 'General',
          unknown: 'General',
          navigational: 'Brand & Navigation',
        };

        for (const [intent, kws] of intentGroups.entries()) {
          const label = intentLabels[intent] || this.toTitleCase(intent);
          const kwRows: SubThemeKeyword[] = kws.flatMap((kw) =>
            matchTypes.map((mt) => ({
              keyword: kw.text,
              matchType: mt,
              volume: kw.volume,
              cpc: kw.cpc,
              cpcLow: kw.cpcLow,
              cpcHigh: kw.cpcHigh,
              competitionIndex: kw.competitionIndex,
              qualityScore: kw.qualityScore,
              qualityRating: kw.qualityRating,
              intent: kw.intent,
            }))
          );
          subThemes.push({ name: label, keywords: kwRows });
        }
        return subThemes;
      }
    }

    // Default: single sub-theme with all keywords in both match types
    const allRows: SubThemeKeyword[] = keywords.flatMap((kw) =>
      matchTypes.map((mt) => ({
        keyword: kw.text,
        matchType: mt,
        volume: kw.volume,
        cpc: kw.cpc,
        cpcLow: kw.cpcLow,
        cpcHigh: kw.cpcHigh,
        competitionIndex: kw.competitionIndex,
        qualityScore: kw.qualityScore,
        qualityRating: kw.qualityRating,
        intent: kw.intent,
      }))
    );
    subThemes.push({ name: 'Core Keywords', keywords: allRows });
    return subThemes;
  }

  private static extractKeywordsFromAdGroups(adGroups: AdGroup[]): KeywordMetric[] {
    const seen = new Set<string>();
    const out: KeywordMetric[] = [];
    for (const ag of adGroups) {
      for (const st of ag.subThemes) {
        for (const kw of st.keywords) {
          const key = kw.keyword.toLowerCase().trim();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push({
            text: kw.keyword,
            volume: kw.volume,
            cpc: kw.cpc,
            cpcLow: kw.cpcLow,
            cpcHigh: kw.cpcHigh,
            competitionIndex: kw.competitionIndex,
            qualityScore: kw.qualityScore,
            qualityRating: kw.qualityRating,
          });
        }
      }
    }
    return out;
  }

  private static resolveAdGroupLimits(options: CampaignBuildOptions): AdGroupLimits {
    const rawMin = Number.isFinite(options.minAdGroupKeywords)
      ? Math.round(Number(options.minAdGroupKeywords))
      : this.DEFAULT_MIN_AD_GROUP_KEYWORDS;
    const min = Math.max(1, rawMin);

    const rawMax = Number.isFinite(options.maxAdGroupKeywords)
      ? Math.round(Number(options.maxAdGroupKeywords))
      : this.DEFAULT_MAX_AD_GROUP_KEYWORDS;
    const max = Math.max(min, rawMax);

    return { min, max };
  }

  private static chunkKeywordsIntoGroups(keywords: KeywordMetric[], limits: AdGroupLimits): KeywordMetric[][] {
    if (keywords.length < limits.min) return [];
    if (keywords.length <= limits.max) return [keywords];

    const chunks: KeywordMetric[][] = [];
    let index = 0;

    while (index < keywords.length) {
      const remaining = keywords.length - index;
      const groupsLeft = Math.ceil(remaining / limits.max);
      const idealSize = remaining - limits.min * (groupsLeft - 1);
      const size = Math.max(limits.min, Math.min(limits.max, idealSize));
      const next = keywords.slice(index, index + size);

      if (next.length < limits.min) {
        return [];
      }

      chunks.push(next);
      index += size;
    }

    return chunks;
  }

  private static countUniqueKeywords(adGroup: AdGroup): number {
    const seen = new Set<string>();
    for (const st of adGroup.subThemes) {
      for (const kw of st.keywords) {
        seen.add(kw.keyword.toLowerCase().trim());
      }
    }
    return seen.size;
  }

  private static distributeKeywordsRoundRobin(
    keywords: KeywordMetric[],
    adGroups: AdGroup[],
    limits: AdGroupLimits,
  ): void {
    if (keywords.length === 0 || adGroups.length === 0) return;
    let groupIdx = 0;
    for (const kw of keywords) {
      // Find next group that hasn't hit max (try all groups once)
      let placed = false;
      for (let attempt = 0; attempt < adGroups.length; attempt++) {
        const candidate = adGroups[(groupIdx + attempt) % adGroups.length]!;
        if (this.countUniqueKeywords(candidate) < limits.max) {
          const subThemes = this.buildSubThemesForGroup([kw]);
          candidate.subThemes.push(...subThemes);
          groupIdx = (groupIdx + attempt + 1) % adGroups.length;
          placed = true;
          break;
        }
      }
      if (!placed) break; // All groups at max
    }
  }

  private static groupKeywordsByTheme(keywords: KeywordMetric[], profile: ServiceProfile): Map<string, KeywordMetric[]> {
    const buckets = new Map<string, KeywordMetric[]>();

    for (const keyword of keywords) {
      const theme = this.extractThemeForKeyword(keyword, profile);
      const existing = buckets.get(theme) ?? [];
      existing.push(keyword);
      buckets.set(theme, existing);
    }

    for (const [theme, terms] of buckets) {
      const sorted = [...terms].sort((a, b) => this.compareKeywordPriority(a, b));
      buckets.set(theme, sorted);
    }

    return new Map(Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)));
  }

  private static readonly modifierThemes: Array<{ theme: string; patterns: RegExp[] }> = [
    {
      theme: 'Cost & Pricing',
      patterns: [
        /\b(cost|price|pricing|prices|quote|quotes|estimate|estimates|rates?|fees?|how much|cheap|cheapest|affordable|expensive|budget|worth)\b/i,
      ],
    },
    {
      theme: 'Near Me',
      patterns: [
        /\b(near me|near|nearby|local|in \w+|suburb|area)\b/i,
        /\b\w+ (city|suburb|town|region|area)$/i,
      ],
    },
    {
      theme: 'Reviews & Comparison',
      patterns: [
        /\b(review|reviews|best|top rated|compare|comparison|vs|versus|alternative|alternatives|rated|rating|ratings|recommended)\b/i,
      ],
    },
    {
      theme: 'DIY & How To',
      patterns: [
        /\b(how to|diy|do it yourself|tutorial|guide|step by step|tips|ideas|yourself)\b/i,
      ],
    },
  ];

  private static extractThemeForKeyword(keyword: KeywordMetric, profile: ServiceProfile): string {
    const normalized = this.normalizeText(keyword.text);

    // Classify by modifier pattern — groups keywords by searcher intent within a campaign
    for (const { theme, patterns } of this.modifierThemes) {
      if (patterns.some((p) => p.test(normalized))) {
        return theme;
      }
    }

    // Fallback: extract meaningful non-service, non-modifier tokens
    const tokens = this.tokenize(normalized);
    if (tokens.length === 0) return 'General';

    const filtered = tokens.filter((token) => token && !this.isStopWord(token) && !profile.tokens.includes(token));
    if (filtered.length === 0) return 'General';

    // Only use token-based theme if the tokens are specific enough (not single generic words)
    const candidate = filtered.slice(0, 2).join(' ');
    return candidate;
  }

  private static normalizeServiceProfiles(services: ServiceInput[]): Array<{ name: string; landingPage?: string }> {
    const normalized: Array<{ name: string; landingPage?: string }> = [];
    const seen = new Set<string>();

    for (const service of services) {
      const normalizedService =
        typeof service === 'string'
          ? { name: service.trim(), landingPage: undefined }
          : { name: service.name.trim(), landingPage: service.landingPage?.trim() || undefined };
      if (!normalizedService.name) continue;
      const key = normalizedService.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(normalizedService);
    }

    return normalized;
  }

  private static findBestServiceMatch(text: string, serviceProfiles: ServiceProfile[]): ServiceMatch | null {
    const normalized = this.normalizeText(text);
    const tokens = this.tokenize(normalized);
    let bestMatch: ServiceMatch | null = null;

    for (const profile of serviceProfiles) {
      const current = this.getServiceMatch(normalized, tokens, profile);
      if (!bestMatch || current.score > bestMatch.score) {
        bestMatch = current;
      }
    }

    return bestMatch && bestMatch.score > 0 ? bestMatch : null;
  }

  private static getServiceMatch(normalizedKeyword: string, keywordTokens: string[], profile: ServiceProfile): ServiceMatch {
    let score = 0;

    for (const phrase of profile.phrases) {
      if (phrase && normalizedKeyword.includes(phrase)) score += 6;
    }

    for (const token of profile.tokens) {
      if (!token) continue;
      const wordBoundary = new RegExp(`\\b${this.escapeRegex(token)}\\b`, 'i');
      if (wordBoundary.test(normalizedKeyword)) {
        score += 4;
      } else if (normalizedKeyword.includes(token)) {
        score += 2;
      }
    }

    const hasPartialOverlap = profile.tokens.some((token) => token && keywordTokens.includes(token));
    if (hasPartialOverlap) score += 1;

    return { service: profile.name, score };
  }

  private static dedupeKeywords(keywords: KeywordMetric[]): KeywordMetric[] {
    const deduped = new Map<string, KeywordMetric>();

    for (const keyword of keywords) {
      const normalized = keyword.text.trim().toLowerCase();
      if (!normalized) continue;

      const existing = deduped.get(normalized);
      const existingQuality = existing?.qualityScore ?? 0;
      if (
        !existing ||
        keyword.volume > existing.volume ||
        (keyword.volume === existing.volume && keyword.cpc < existing.cpc) ||
        (keyword.volume === existing.volume &&
          keyword.cpc === existing.cpc &&
          (keyword.qualityScore ?? 0) > existingQuality)
      ) {
        deduped.set(normalized, keyword);
      }
    }

    return Array.from(deduped.values());
  }

  private static sortKeywords(keywords: KeywordMetric[]): KeywordMetric[] {
    const deduped = this.dedupeKeywords(keywords);
    return deduped.sort((a, b) => this.compareKeywordPriority(a, b));
  }

  private static createServiceProfile(service: { name: string; landingPage?: string }): ServiceProfile {
    const normalizedName = this.normalizeText(service.name);
    const tokens = this.tokenize(normalizedName).filter((token) => !this.isStopWord(token));
    const phrases: string[] = [];

    if (tokens.length > 1) phrases.push(tokens.join(' '));
    if (tokens.length >= 2) phrases.push(tokens.slice(-2).join(' '));

    return {
      name: service.name.trim(),
      normalizedName,
      tokens,
      phrases: Array.from(new Set<string>(phrases.map((phrase) => phrase.toLowerCase()))).filter(Boolean),
      landingPage: service.landingPage,
    };
  }

  private static compareKeywordPriority(a: KeywordMetric, b: KeywordMetric): number {
    if ((b.qualityScore ?? 0) !== (a.qualityScore ?? 0)) return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
    if (b.volume !== a.volume) return b.volume - a.volume;
    if (a.cpc !== b.cpc) return a.cpc - b.cpc;
    return a.text.localeCompare(b.text);
  }

  private static normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/["'`]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static tokenize(text: string): string[] {
    return this.normalizeText(text).split(' ').filter(Boolean);
  }

  private static readonly stopWordSet = new Set([
    'service',
    'services',
    'and',
    'or',
    'the',
    'a',
    'an',
    'for',
    'in',
    'of',
    'to',
    'with',
    'on',
    'at',
    'by',
    'from',
    'your',
    'our',
    'we',
    'us',
    'local',
    'near',
    'nearby',
    'support',
    'help',
    'best',
    'top',
    'new',
    'online',
    'using',
    'buy',
    'get',
    'how',
    'what',
  ]);

  private static isStopWord(token: string): boolean {
    return this.stopWordSet.has(token);
  }

  private static toTitleCase(value: string): string {
    return value
      .split(' ')
      .filter(Boolean)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(' ');
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  static buildNegativeKeywords(
    allKeywords: KeywordMetric[],
    selectedKeywords: KeywordMetric[],
    campaignName: string = 'Campaign',
    competitorNames: string[] = [],
  ): NegativeKeywordItem[] {
    const selectedSet = new Set(selectedKeywords.map((k) => k.text.toLowerCase().trim()));
    const negatives: NegativeKeywordItem[] = [];
    const seen = new Set<string>();

    // 1. Add competitor brand names as negatives
    for (const name of competitorNames) {
      const key = name.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      negatives.push({
        campaign: campaignName,
        adGroup: '',
        keyword: name.trim(),
        matchType: 'Phrase',
        status: 'Negative',
      });
    }

    // 2. Only add keywords with genuine negative signals — not "everything we didn't pick"
    for (const keyword of allKeywords) {
      const key = keyword.text.toLowerCase().trim();
      if (!key || selectedSet.has(key) || seen.has(key)) continue;

      if (hasNegativeSignal(keyword.text, competitorNames)) {
        seen.add(key);
        negatives.push({
          campaign: campaignName,
          adGroup: '',
          keyword: keyword.text,
          matchType: 'Phrase',
          status: 'Negative',
        });
      }
    }

    return negatives;
  }
}
