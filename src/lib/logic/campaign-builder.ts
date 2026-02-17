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

interface AdGroupItem {
  keyword: string;
  matchType: 'Exact' | 'Phrase';
  volume: number;
  cpc: number;
  cpcLow?: number;
  cpcHigh?: number;
  competitionIndex?: number;
  qualityScore?: number;
  qualityRating?: string;
}

interface NegativeKeywordItem {
  campaign: string;
  adGroup: string;
  keyword: string;
  matchType: 'Phrase';
  status: 'Negative';
}

interface CampaignStructure {
  campaignName: string;
  landingPage?: string;
  adGroups: {
    [adGroupName: string]: AdGroupItem[];
  };
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

type ThemeBucket = {
  theme: string;
  keywords: KeywordMetric[];
};

export interface CampaignBuildOptions {
  minAdGroupKeywords?: number;
  maxAdGroupKeywords?: number;
}

type AdGroupLimits = {
  min: number;
  max: number;
};

export class CampaignBuilder {
  private static readonly DEFAULT_MIN_AD_GROUP_KEYWORDS = 3;
  private static readonly DEFAULT_MAX_AD_GROUP_KEYWORDS = 10;
  private static readonly CATCH_ALL_PREFIX = 'Catchall - General';

  static build(
    services: ServiceInput[],
    keywordMetrics: KeywordMetric[],
    options: CampaignBuildOptions = {},
  ): CampaignStructure[] {
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

    const campaigns: CampaignStructure[] = [];
    for (const profile of serviceProfiles) {
      const campaignKeywords = keywordsByService.get(profile.name) || [];
      const adGroups = this.buildAdGroupsForCampaign(profile, campaignKeywords, limits);
      if (Object.keys(adGroups).length === 0) continue;

      campaigns.push({
        campaignName: `Service - ${profile.name}`,
        landingPage: profile.landingPage,
        adGroups,
      });
    }

    if (unmatchedKeywords.length === 0) {
      return campaigns;
    }

    if (campaigns.length > 0) {
      const primary = campaigns[0];
      const primaryProfile = serviceProfiles[0];
      const existing = this.normalizeKeywordsFromAdGroups(primary.adGroups);
      primary.adGroups = this.buildAdGroupsForCampaign(
        primaryProfile,
        this.dedupeKeywords([...existing, ...unmatchedKeywords]),
        limits,
      );
      return campaigns;
    }

    const [fallbackProfile] = serviceProfiles;
    const adGroups = this.buildAdGroupsForCampaign(fallbackProfile, unmatchedKeywords, limits);
    if (Object.keys(adGroups).length === 0) return [];

    campaigns.push({
      campaignName: `Service - ${fallbackProfile.name}`,
      landingPage: fallbackProfile.landingPage,
      adGroups,
    });
    return campaigns;
  }

  private static buildAdGroupsForCampaign(
    serviceProfile: ServiceProfile,
    campaignKeywords: KeywordMetric[],
    limits: AdGroupLimits,
  ): { [key: string]: AdGroupItem[] } {
    const adGroups: { [key: string]: AdGroupItem[] } = {};
    const sorted = this.sortKeywords([...campaignKeywords]);
    if (sorted.length === 0) return adGroups;

    const catchAllSize = this.selectCatchAllSize(sorted.length, limits);
    const catchAllKeywords = sorted.slice(0, catchAllSize);
    const remaining = sorted.slice(catchAllSize);

    const themeBuckets = this.groupKeywordsByTheme(remaining, serviceProfile);
    const overflow: KeywordMetric[] = [];
    const themedGroups: ThemeBucket[] = [];

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

      chunks.forEach((chunk, index) => {
        if (chunk.length < limits.min) {
          overflow.push(...chunk);
          return;
        }
        const suffix = chunks.length > 1 ? ` (${index + 1})` : '';
        themedGroups.push({
          theme: `${this.toTitleCase(theme)} - Theme${suffix}`,
          keywords: chunk,
        });
      });
    }

    const catchAll = [...catchAllKeywords];
    this.moveKeywordsToCatchAll(catchAll, overflow, limits);

    if (overflow.length > 0) {
      const overflowChunks = this.chunkKeywordsIntoGroups(overflow, limits);
      if (overflowChunks.length > 0) {
        for (const [index, chunk] of overflowChunks.entries()) {
          if (chunk.length < limits.min) continue;
          const suffix = overflowChunks.length > 1 ? ` (${index + 1})` : '';
          themedGroups.push({
            theme: `Additional - Theme${suffix}`,
            keywords: chunk,
          });
        }
      } else {
        catchAll.push(...overflow);
      }
    }

    const dedupedCatchAll = this.dedupeKeywords(catchAll);
    const catchAllGroups = dedupedCatchAll.length >= limits.min
      ? this.chunkKeywordsIntoGroups(dedupedCatchAll, limits)
      : [];
    if (catchAllGroups.length > 0) {
      for (const [index, chunk] of catchAllGroups.entries()) {
        const key = `${CampaignBuilder.CATCH_ALL_PREFIX}${catchAllGroups.length > 1 ? ` (${index + 1})` : ''}`;
        adGroups[key] = this.rowsForKeywords(chunk);
      }
    } else if (dedupedCatchAll.length > 0) {
      adGroups[CampaignBuilder.CATCH_ALL_PREFIX] = this.rowsForKeywords(dedupedCatchAll);
    }

    for (const themedGroup of themedGroups) {
      const key = themedGroup.theme;
      const existing = adGroups[key];
      if (!existing || existing.length === 0) {
        adGroups[key] = this.rowsForKeywords(themedGroup.keywords);
      }
    }

    if (Object.keys(adGroups).length === 0) {
      adGroups[CampaignBuilder.CATCH_ALL_PREFIX] = this.rowsForKeywords(sorted);
      return adGroups;
    }

    return adGroups;
  }

  private static normalizeKeywordsFromAdGroups(adGroups: CampaignStructure['adGroups']): KeywordMetric[] {
    const seen = new Set<string>();
    const out: KeywordMetric[] = [];
    for (const groupKeywords of Object.values(adGroups)) {
      for (const keyword of groupKeywords) {
        const key = keyword.keyword.toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
          text: keyword.keyword,
          volume: keyword.volume,
          cpc: keyword.cpc,
          qualityScore: keyword.qualityScore,
          qualityRating: keyword.qualityRating,
        });
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

  private static selectCatchAllSize(totalKeywords: number, limits: AdGroupLimits): number {
    if (totalKeywords <= limits.min) return totalKeywords;
    if (totalKeywords <= 25) return limits.min;
    return limits.max;
  }

  private static moveKeywordsToCatchAll(catchAll: KeywordMetric[], overflow: KeywordMetric[], limits: AdGroupLimits) {
    const spareCapacity = limits.max - catchAll.length;
    if (spareCapacity <= 0) return;
    const moved = overflow.splice(0, Math.min(spareCapacity, overflow.length));
    catchAll.push(...moved);
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

  private static rowsForKeywords(keywords: KeywordMetric[]): AdGroupItem[] {
    const matchTypes = this.determineMatchTypes();
    return keywords.flatMap((keyword) =>
      matchTypes.map((matchType) => ({
        keyword: keyword.text,
        matchType,
        volume: keyword.volume,
        cpc: keyword.cpc,
        cpcLow: keyword.cpcLow,
        cpcHigh: keyword.cpcHigh,
        competitionIndex: keyword.competitionIndex,
        qualityScore: keyword.qualityScore,
        qualityRating: keyword.qualityRating,
      })),
    );
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

  private static extractThemeForKeyword(keyword: KeywordMetric, profile: ServiceProfile): string {
    if (Array.isArray(keyword.themes) && keyword.themes.length > 0) {
      const explicitTheme = keyword.themes
        .map((theme) => theme.trim())
        .find((theme) => theme && theme.toLowerCase() !== 'general');

      if (explicitTheme) {
        return explicitTheme;
      }
    }

    const tokens = this.tokenize(this.normalizeText(keyword.text));
    if (tokens.length === 0) return 'General';

    const filtered = tokens.filter((token) => token && !this.isStopWord(token) && !profile.tokens.includes(token));
    if (filtered.length === 0) return 'General';

    return filtered.slice(0, 2).join(' ');
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

  private static determineMatchTypes(): ('Exact' | 'Phrase')[] {
    return ['Exact', 'Phrase'];
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
  ): NegativeKeywordItem[] {
    const selectedSet = new Set(selectedKeywords.map((k) => k.text.toLowerCase().trim()));
    const negatives: NegativeKeywordItem[] = [];
    const seen = new Set<string>();

    for (const keyword of allKeywords) {
      const key = keyword.text.toLowerCase().trim();
      if (!key || selectedSet.has(key) || seen.has(key)) continue;
      seen.add(key);
      negatives.push({
        campaign: campaignName,
        adGroup: '',
        keyword: keyword.text,
        matchType: 'Phrase',
        status: 'Negative',
      });
    }

    return negatives;
  }
}
