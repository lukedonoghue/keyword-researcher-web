import type { SeedKeyword, SuppressedKeyword, CampaignStrategy } from '../types/index';
import { getKeywordQualityScore } from './quality-score';
import { analyzeKeywordSignals, isCompetitorBrand } from './keyword-signals';
import { dedupeSeedKeywords } from './keyword-merge';

export function applyStrategyFilter(keywords: SeedKeyword[], strategy: CampaignStrategy, competitorNames: string[] = []): {
  selected: SeedKeyword[];
  suppressed: SuppressedKeyword[];
} {
  const selected: SeedKeyword[] = [];
  const suppressed: SuppressedKeyword[] = [];

  for (const keyword of keywords) {
    const reasons: string[] = [];

    const competitorMatch = isCompetitorBrand(keyword.text, competitorNames);
    if (competitorMatch) {
      reasons.push(`Contains competitor brand name: ${competitorMatch}`);
    }

    if (keyword.volume < strategy.minVolume) {
      reasons.push(`Search volume ${keyword.volume} below strategy minimum ${strategy.minVolume}`);
    }

    if (strategy.maxCpc !== null && strategy.maxCpc > 0 && keyword.cpc > strategy.maxCpc) {
      reasons.push(`CPC $${keyword.cpc} above strategy max CPC $${strategy.maxCpc}`);
    }

    if (!strategy.includeNegativeCandidates && keyword.isNegativeCandidate) {
      reasons.push('Likely negative intent or low-value target');
    }

    if (!strategy.includeInformational && keyword.intent === 'informational') {
      reasons.push('Informational intent filtered out by campaign goal');
    }

    if (strategy.focusHighIntent && keyword.intent !== 'transactional' && keyword.intent !== 'commercial') {
      reasons.push('Low-intent keyword filtered for conversion-focused strategy');
    }

    if (reasons.length > 0) {
      suppressed.push({ ...keyword, suppressionReasons: reasons });
      continue;
    }

    selected.push({
      ...keyword,
      suppressionReasons: [],
    });
  }

  const ranked = selected
    .map((keyword) => {
      const quality = getKeywordQualityScore(keyword);
      return {
        ...keyword,
        qualityScore: quality.score,
        qualityRating: quality.rating,
        suppressionReasons: [],
      };
    })
    .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

  const minimumTarget = 12;
  if (ranked.length < minimumTarget) {
    const selectedKeys = new Set(ranked.map((keyword) => keyword.text.toLowerCase()));
    const supplements = suppressed
      .filter((keyword) => !keyword.isNegativeCandidate && keyword.intent !== 'navigational')
      .filter((keyword) => keyword.suppressionReasons.every((reason) => !reason.toLowerCase().includes('cpc')))
      .map((keyword) => {
        const quality = getKeywordQualityScore(keyword);
        return {
          ...keyword,
          qualityScore: quality.score,
          qualityRating: quality.rating,
          suppressionReasons: [],
        };
      })
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

    for (const supplement of supplements) {
      const key = supplement.text.toLowerCase();
      if (selectedKeys.has(key)) continue;
      ranked.push(supplement);
      selectedKeys.add(key);
      if (ranked.length >= minimumTarget) break;
    }
  }

  return { selected: ranked, suppressed };
}

export function buildCampaignStrategyDefaults(): CampaignStrategy {
  return {
    goal: 'conversions',
    monthlyBudget: 2000,
    minVolume: 50,
    maxCpc: null,
    minAdGroupKeywords: 3,
    maxAdGroupKeywords: 10,
    focusHighIntent: true,
    includeInformational: false,
    includeNegativeCandidates: false,
    competitorCampaignMode: 'exclude',
    brandCampaignMode: 'exclude',
    matchTypeStrategy: 'exact_phrase',
  };
}

export function buildCampaignStrategyFromInput(input: {
  goal: CampaignStrategy['goal'];
  monthlyBudget: number;
  maxCpc: number | null;
  minAdGroupKeywords: number;
  maxAdGroupKeywords: number;
  focusHighIntent: boolean;
  includeInformational: boolean;
  includeNegativeCandidates: boolean;
  competitorCampaignMode: CampaignStrategy['competitorCampaignMode'];
  brandCampaignMode: CampaignStrategy['brandCampaignMode'];
  matchTypeStrategy: CampaignStrategy['matchTypeStrategy'];
}): CampaignStrategy {
  const minVolume =
    input.goal === 'conversions' ? Math.max(10, Math.round(input.monthlyBudget * 0.005))
      : input.goal === 'traffic' ? Math.max(10, Math.round(input.monthlyBudget * 0.003))
      : Math.max(10, Math.round(input.monthlyBudget * 0.005));

  const minAdGroupKeywords = Math.max(1, Math.round(input.minAdGroupKeywords || 1));
  const maxAdGroupKeywords = Math.max(minAdGroupKeywords, Math.round(input.maxAdGroupKeywords || minAdGroupKeywords));

  return {
    goal: input.goal,
    monthlyBudget: input.monthlyBudget,
    minVolume,
    maxCpc: input.maxCpc,
    minAdGroupKeywords,
    maxAdGroupKeywords,
    focusHighIntent: input.focusHighIntent,
    includeInformational: input.includeInformational,
    includeNegativeCandidates: input.includeNegativeCandidates,
    competitorCampaignMode: input.competitorCampaignMode,
    brandCampaignMode: input.brandCampaignMode,
    matchTypeStrategy: input.matchTypeStrategy,
  };
}

export function enrichSeedKeywordsWithSignals(keywords: SeedKeyword[]): SeedKeyword[] {
  const deduped = dedupeSeedKeywords(keywords);

  return deduped.map((keyword) => {
    const signals = analyzeKeywordSignals(keyword.text);
    return {
      ...keyword,
      ...signals,
      suppressionReasons: [],
    };
  });
}
