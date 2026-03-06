import type {
  CampaignStructureV2,
  NegativeKeyword,
  NegativeKeywordList,
  NegativeKeywordListItem,
  NegativeKeywordListName,
  SuppressedKeyword,
} from '../types/index';
import { isCompetitorBrand, normalizeKeywordText } from './keyword-signals';

const NEGATIVE_LIST_DEFINITIONS: Record<
  NegativeKeywordListName,
  Omit<NegativeKeywordList, 'items'>
> = {
  competitor: {
    name: 'competitor',
    label: 'Competitor List',
    description: 'Apply competitor brand exclusions to standard campaigns so competitor traffic is isolated or routed intentionally.',
    scope: 'campaign',
    defaultMatchType: 'Phrase',
  },
  universal: {
    name: 'universal',
    label: 'Universal Exclusions',
    description: 'Shared campaign exclusions mined from suppressed queries for clearly non-buying intent such as jobs, DIY, support, used/free, and forum-style searches.',
    scope: 'campaign',
    defaultMatchType: 'Phrase',
  },
  brand: {
    name: 'brand',
    label: 'Brand Protection List',
    description: 'Optional brand-term exclusions for non-brand campaigns. Enable only when you intentionally run brand traffic in its own campaign.',
    scope: 'campaign',
    defaultMatchType: 'Phrase',
  },
  funnel: {
    name: 'funnel',
    label: 'Funnel Routing List',
    description: 'Exact-match routing exclusions that push specific searches into the right campaign or ad group, including keeping non-brand terms out of brand-only campaigns.',
    scope: 'mixed',
    defaultMatchType: 'Exact',
  },
};

const strongNegativeIntentPatterns = [
  /\b(reddit|wikipedia|youtube|forum)\b/i,
  /\b(job|jobs|career|careers|salary|salaries|internship)\b/i,
  /\b(login|signin|sign in|account|support|help desk|faq|privacy|policy|terms|contact us)\b/i,
  /\b(diy|do it yourself|how to|tutorial|guide)\b/i,
  /\b(used|second hand|secondhand|free|cheap|cheapest)\b/i,
];

const exactOnlyNegativeTokens = new Set(['license', 'licence']);
const negativeSignalTokens = new Set([
  'account',
  'career',
  'careers',
  'cheap',
  'cheapest',
  'complaint',
  'complaints',
  'diy',
  'faq',
  'forum',
  'free',
  'guide',
  'help',
  'internship',
  'job',
  'jobs',
  'license',
  'licence',
  'login',
  'password',
  'policy',
  'privacy',
  'reddit',
  'salary',
  'salaries',
  'signin',
  'support',
  'terms',
  'tutorial',
  'unsubscribe',
  'used',
  'wikipedia',
  'youtube',
]);

const safeSingleTokenSignals = new Set([
  'career',
  'careers',
  'cheap',
  'cheapest',
  'complaint',
  'complaints',
  'diy',
  'faq',
  'forum',
  'free',
  'internship',
  'job',
  'jobs',
  'license',
  'licence',
  'login',
  'reddit',
  'salary',
  'salaries',
  'support',
  'tutorial',
  'unsubscribe',
  'used',
  'wikipedia',
  'youtube',
]);

const allowedNegativePhrases = new Set([
  'customer service',
  'do it yourself',
  'how to',
  'log in',
  'privacy policy',
  'sign in',
  'terms of service',
]);

const ngramStopWords = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'my',
  'of',
  'on',
  'the',
  'to',
  'with',
  'your',
]);

const allowedLeadingStopWords = new Set(['how']);
const commonDomainLabels = new Set([
  'app',
  'au',
  'blog',
  'ca',
  'co',
  'com',
  'dev',
  'go',
  'info',
  'io',
  'm',
  'net',
  'org',
  'shop',
  'uk',
  'us',
  'www',
]);

const explicitNegativeVariants: Record<string, string[]> = {
  career: ['careers'],
  careers: ['career'],
  complaint: ['complaints'],
  complaints: ['complaint'],
  job: ['jobs'],
  jobs: ['job'],
  salary: ['salaries'],
  salaries: ['salary'],
};

const baselineUniversalNegatives: Array<{
  keyword: string;
  matchType: 'Phrase' | 'Exact';
  reasons: string[];
}> = [
  {
    keyword: 'jobs',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for hiring and employment searches'],
  },
  {
    keyword: 'careers',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for hiring and employment searches'],
  },
  {
    keyword: 'salary',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for hiring and employment searches'],
  },
  {
    keyword: 'login',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for account and support queries'],
  },
  {
    keyword: 'support',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for account and support queries'],
  },
  {
    keyword: 'diy',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for do-it-yourself intent'],
  },
  {
    keyword: 'how to',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for do-it-yourself intent'],
  },
  {
    keyword: 'tutorial',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for do-it-yourself intent'],
  },
  {
    keyword: 'free',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for low-value free intent'],
  },
  {
    keyword: 'cheap',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for low-quality bargain intent'],
  },
  {
    keyword: 'cheapest',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for low-quality bargain intent'],
  },
  {
    keyword: 'used',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for second-hand or non-core purchase intent'],
  },
  {
    keyword: 'reddit',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for forum-style research traffic'],
  },
  {
    keyword: 'youtube',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for forum-style research traffic'],
  },
  {
    keyword: 'forum',
    matchType: 'Phrase',
    reasons: ['Shared baseline exclusion for forum-style research traffic'],
  },
];

function createList(name: NegativeKeywordListName, items: NegativeKeywordListItem[]): NegativeKeywordList {
  const definition = NEGATIVE_LIST_DEFINITIONS[name];
  return {
    ...definition,
    items,
  };
}

function normalizeListKey(item: Pick<NegativeKeywordListItem, 'keyword' | 'matchType' | 'campaign' | 'adGroup'>): string {
  return [
    item.campaign ?? '',
    item.adGroup ?? '',
    normalizeKeywordText(item.keyword),
    item.matchType,
  ].join('|||');
}

function sortNegativeListItems(items: NegativeKeywordListItem[]): NegativeKeywordListItem[] {
  return items.slice().sort((a, b) => a.keyword.localeCompare(b.keyword));
}

function hasStrongNegativeIntentSignal(text: string): boolean {
  return strongNegativeIntentPatterns.some((pattern) => pattern.test(text));
}

function mergeReasons(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming].filter(Boolean)));
}

function mergeVariants(existing: string[] | undefined, incoming: string[] | undefined): string[] | undefined {
  const values = [...(existing ?? []), ...(incoming ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  return Array.from(new Set(values));
}

function upsertListItem(
  map: Map<string, NegativeKeywordListItem>,
  item: NegativeKeywordListItem,
): void {
  const key = normalizeListKey(item);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      ...item,
      reasons: Array.from(new Set(item.reasons.filter(Boolean))),
      variants: mergeVariants(undefined, item.variants),
    });
    return;
  }

  map.set(key, {
    ...existing,
    enabled: existing.enabled || item.enabled,
    reasons: mergeReasons(existing.reasons, item.reasons),
    variants: mergeVariants(existing.variants, item.variants),
    occurrences: (existing.occurrences ?? 0) + (item.occurrences ?? 0),
  });
}

export function expandNegativeKeywordVariants(text: string): string[] {
  const normalized = normalizeKeywordText(text);
  if (!normalized) return [];

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const variants = new Set<string>([normalized]);
  if (tokens.length === 1) {
    for (const explicitVariant of explicitNegativeVariants[normalized] ?? []) {
      variants.add(explicitVariant);
    }
    return Array.from(variants);
  }

  return Array.from(variants);
}

function inferMatchType(keyword: string): 'Phrase' | 'Exact' {
  const tokens = normalizeKeywordText(keyword).split(' ').filter(Boolean);
  if (tokens.length === 1 && exactOnlyNegativeTokens.has(tokens[0] ?? '')) {
    return 'Exact';
  }
  return 'Phrase';
}

function campaignContainsPhrase(campaignKeywords: Map<string, string>, phrase: string): boolean {
  const normalizedPhrase = normalizeKeywordText(phrase);
  if (!normalizedPhrase) return false;

  for (const keyword of campaignKeywords.keys()) {
    if (keyword === normalizedPhrase) return true;
    if (keyword.includes(normalizedPhrase)) return true;
  }

  return false;
}

function extractPrimaryDomainLabel(targetDomain?: string): string {
  if (!targetDomain) return '';
  const labels = targetDomain
    .toLowerCase()
    .split('.')
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label) => !commonDomainLabels.has(label));

  if (labels.length === 0) return '';
  return labels.sort((a, b) => b.length - a.length)[0] ?? '';
}

export function getBrandIdentityTerms(input: {
  businessName?: string;
  targetDomain?: string;
}): string[] {
  const brandTerms = new Set<string>();

  const normalizedBusinessName = normalizeKeywordText(input.businessName ?? '');
  if (normalizedBusinessName) {
    brandTerms.add(normalizedBusinessName);
  }

  const primaryDomainLabel = extractPrimaryDomainLabel(input.targetDomain);
  const normalizedDomainLabel = normalizeKeywordText(primaryDomainLabel.replace(/[-_]+/g, ' '));
  if (normalizedDomainLabel && normalizedDomainLabel.length >= 5) {
    brandTerms.add(normalizedDomainLabel);
  }

  return Array.from(brandTerms)
    .filter((term) => term.length >= 4)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function isSafeNegativeNgram(tokens: string[]): boolean {
  if (tokens.length === 0) return false;

  const phrase = tokens.join(' ');
  if (allowedNegativePhrases.has(phrase)) return true;

  const containsSignalToken = tokens.some((token) => negativeSignalTokens.has(token));
  if (!containsSignalToken) return false;

  if (tokens.length === 1) {
    const [token] = tokens;
    return Boolean(token && token.length >= 3 && safeSingleTokenSignals.has(token));
  }

  const firstToken = tokens[0];
  const lastToken = tokens[tokens.length - 1];
  if (!firstToken || !lastToken) return false;
  if (ngramStopWords.has(firstToken) && !allowedLeadingStopWords.has(firstToken)) return false;
  if (ngramStopWords.has(lastToken)) return false;

  return true;
}

function mineUniversalNegativeNgrams(suppressedKeywords: SuppressedKeyword[]): NegativeKeywordListItem[] {
  const candidates = new Map<string, { count: number; keywords: Set<string>; matchType: 'Phrase' | 'Exact' }>();

  for (const keyword of suppressedKeywords) {
    if (!hasStrongNegativeIntentSignal(keyword.text)) continue;

    const tokens = normalizeKeywordText(keyword.text).split(' ').filter(Boolean);
    for (let size = 1; size <= Math.min(3, tokens.length); size += 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const phraseTokens = tokens.slice(index, index + size);
        if (!isSafeNegativeNgram(phraseTokens)) continue;

        const phrase = phraseTokens.join(' ');
        const existing = candidates.get(phrase) ?? {
          count: 0,
          keywords: new Set<string>(),
          matchType: inferMatchType(phrase),
        };
        existing.count += 1;
        existing.keywords.add(keyword.text.trim());
        candidates.set(phrase, existing);
      }
    }
  }

  return Array.from(candidates.entries())
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      if (b[0].split(' ').length !== a[0].split(' ').length) {
        return b[0].split(' ').length - a[0].split(' ').length;
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([keyword, meta]) => ({
      keyword,
      matchType: meta.matchType,
      enabled: true,
      reasons: [
        `Research n-gram mined from ${meta.count} suppressed keyword${meta.count === 1 ? '' : 's'}`,
      ],
      source: 'ngram' as const,
      variants: expandNegativeKeywordVariants(keyword),
      occurrences: meta.count,
    }));
}

export function flattenReviewNegativeKeywords(lists: NegativeKeywordList[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const list of lists) {
    for (const item of list.items) {
      if (!item.enabled) continue;
      const key = normalizeKeywordText(item.keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keywords.push(item.keyword.trim());
    }
  }

  return keywords;
}

export function buildReviewNegativeKeywordLists(input: {
  suppressedKeywords: SuppressedKeyword[];
  competitorNames: string[];
  businessName?: string;
  targetDomain?: string;
  enableBrandList?: boolean;
}): NegativeKeywordList[] {
  const competitorItems = new Map<string, NegativeKeywordListItem>();
  const universalItems = new Map<string, NegativeKeywordListItem>();
  const brandItems = new Map<string, NegativeKeywordListItem>();

  for (const item of baselineUniversalNegatives) {
    upsertListItem(universalItems, {
      keyword: item.keyword,
      matchType: item.matchType,
      enabled: true,
      reasons: item.reasons,
      source: 'baseline',
      variants: expandNegativeKeywordVariants(item.keyword),
      occurrences: 1,
    });
  }

  for (const brandTerm of getBrandIdentityTerms({
    businessName: input.businessName,
    targetDomain: input.targetDomain,
  })) {
    const brandMatchType = brandTerm.includes(' ') ? 'Phrase' : 'Exact';
    upsertListItem(brandItems, {
      keyword: brandTerm,
      matchType: brandMatchType,
      enabled: Boolean(input.enableBrandList),
      reasons: ['Detected from business identity. Enable only if brand traffic should be routed to a separate brand campaign.'],
      source: 'brand_identity',
      variants: brandTerm.includes(' ') ? expandNegativeKeywordVariants(brandTerm) : undefined,
    });
  }

  for (const name of input.competitorNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    upsertListItem(competitorItems, {
      keyword: trimmed,
      matchType: 'Phrase',
      enabled: true,
      reasons: ['Local competitor brand from competitor research'],
      source: 'competitor_research',
    });
  }

  for (const keyword of input.suppressedKeywords) {
    const reasons = keyword.suppressionReasons.map((reason) => reason.trim()).filter(Boolean);
    const competitorMatch = isCompetitorBrand(keyword.text, input.competitorNames);

    if (competitorMatch || reasons.some((reason) => /competitor brand/i.test(reason))) {
      upsertListItem(competitorItems, {
        keyword: competitorMatch ?? keyword.text.trim(),
        matchType: 'Phrase',
        enabled: true,
        reasons: competitorMatch
          ? [`Contains competitor brand: ${competitorMatch}`]
          : reasons,
        source: 'competitor_research',
      });
    }

    if (!competitorMatch && hasStrongNegativeIntentSignal(keyword.text)) {
      upsertListItem(universalItems, {
        keyword: keyword.text.trim(),
        matchType: inferMatchType(keyword.text),
        enabled: true,
        reasons,
        source: 'suppressed_keyword',
        variants: expandNegativeKeywordVariants(keyword.text),
        occurrences: 1,
      });
    }
  }

  for (const item of mineUniversalNegativeNgrams(input.suppressedKeywords)) {
    upsertListItem(universalItems, item);
  }

  return [
    createList('competitor', sortNegativeListItems(Array.from(competitorItems.values()))),
    createList('universal', sortNegativeListItems(Array.from(universalItems.values()))),
    createList('brand', sortNegativeListItems(Array.from(brandItems.values()))),
    createList('funnel', []),
  ];
}

export function mergeReviewNegativeKeywordLists(
  generatedLists: NegativeKeywordList[],
  persistedLists: NegativeKeywordList[],
): NegativeKeywordList[] {
  if (persistedLists.length === 0) return generatedLists;

  const persistedByName = new Map(persistedLists.map((list) => [list.name, list]));

  return generatedLists.map((generatedList) => {
    const persistedList = persistedByName.get(generatedList.name);
    if (!persistedList) return generatedList;

    const mergedItems = new Map<string, NegativeKeywordListItem>();
    const persistedItemsByKey = new Map(
      persistedList.items.map((item) => [normalizeListKey(item), item] as const)
    );

    for (const item of generatedList.items) {
      const persistedItem = persistedItemsByKey.get(normalizeListKey(item));
      upsertListItem(mergedItems, persistedItem ? {
        ...item,
        enabled: persistedItem.enabled,
        reasons: mergeReasons(item.reasons, persistedItem.reasons),
        variants: mergeVariants(item.variants, persistedItem.variants),
        occurrences: Math.max(item.occurrences ?? 0, persistedItem.occurrences ?? 0),
      } : item);
    }

    for (const item of persistedList.items) {
      if (!mergedItems.has(normalizeListKey(item))) {
        upsertListItem(mergedItems, item);
      }
    }

    return createList(generatedList.name, sortNegativeListItems(Array.from(mergedItems.values())));
  });
}

function getCampaignKeywordMap(campaign: CampaignStructureV2): Map<string, string> {
  const keywordMap = new Map<string, string>();
  for (const adGroup of campaign.adGroups) {
    for (const subTheme of adGroup.subThemes) {
      for (const keyword of subTheme.keywords) {
        const normalized = normalizeKeywordText(keyword.keyword);
        if (!normalized || keywordMap.has(normalized)) continue;
        keywordMap.set(normalized, keyword.keyword);
      }
    }
  }
  return keywordMap;
}

function getAdGroupKeywordMap(adGroup: CampaignStructureV2['adGroups'][number]): Map<string, string> {
  const keywordMap = new Map<string, string>();
  for (const subTheme of adGroup.subThemes) {
    for (const keyword of subTheme.keywords) {
      const normalized = normalizeKeywordText(keyword.keyword);
      if (!normalized || keywordMap.has(normalized)) continue;
      keywordMap.set(normalized, keyword.keyword);
    }
  }
  return keywordMap;
}

function isCatchAllAdGroup(adGroup: CampaignStructureV2['adGroups'][number]): boolean {
  return /\b(general|catch[\s-]?all|generic|broad)\b/i.test(adGroup.name);
}

export function isCompetitorCampaignName(name: string): boolean {
  return /^competitor\s*-/i.test(name.trim());
}

export function isBrandCampaignName(name: string): boolean {
  return /^brand\s*-/i.test(name.trim());
}

export function buildFunnelNegativeKeywordList(campaigns: CampaignStructureV2[]): NegativeKeywordList {
  const items = new Map<string, NegativeKeywordListItem>();

  for (const campaign of campaigns) {
    const adGroupKeywordMaps = new Map<string, Map<string, string>>();

    for (const adGroup of campaign.adGroups) {
      adGroupKeywordMaps.set(adGroup.name, getAdGroupKeywordMap(adGroup));
    }

    for (const catchAll of campaign.adGroups.filter(isCatchAllAdGroup)) {
      const catchAllMap = adGroupKeywordMaps.get(catchAll.name) ?? new Map<string, string>();

      for (const adGroup of campaign.adGroups) {
        if (adGroup.name === catchAll.name) continue;

        const specificMap = adGroupKeywordMaps.get(adGroup.name) ?? new Map<string, string>();
        for (const [normalized, keyword] of specificMap.entries()) {
          if (catchAllMap.has(normalized)) continue;
          if (hasStrongNegativeIntentSignal(keyword)) continue;
          upsertListItem(items, {
            keyword,
            matchType: 'Exact',
            enabled: true,
            reasons: [`Routes specific queries away from ${catchAll.name} into ${adGroup.name}`],
            source: 'routing',
            campaign: campaign.campaignName,
            adGroup: catchAll.name,
          });
        }
      }
    }
  }

  const brandCampaigns = campaigns.filter((campaign) => isBrandCampaignName(campaign.campaignName));
  if (brandCampaigns.length > 0) {
    const nonBrandCampaigns = campaigns.filter((campaign) => !isBrandCampaignName(campaign.campaignName));

    for (const brandCampaign of brandCampaigns) {
      const brandKeywordMap = getCampaignKeywordMap(brandCampaign);

      for (const campaign of nonBrandCampaigns) {
        const campaignKeywords = getCampaignKeywordMap(campaign);
        for (const [normalized, keyword] of campaignKeywords.entries()) {
          if (brandKeywordMap.has(normalized)) continue;
          if (hasStrongNegativeIntentSignal(keyword)) continue;
          upsertListItem(items, {
            keyword,
            matchType: 'Exact',
            enabled: true,
            reasons: [`Keeps non-brand exact queries in ${campaign.campaignName} instead of ${brandCampaign.campaignName}`],
            source: 'routing',
            campaign: brandCampaign.campaignName,
            adGroup: '',
          });
        }
      }
    }
  }

  return createList('funnel', sortNegativeListItems(Array.from(items.values())));
}

function applySharedListToCampaigns(
  list: NegativeKeywordList,
  campaigns: CampaignStructureV2[],
): NegativeKeywordList {
  const appliedItems = new Map<string, NegativeKeywordListItem>();

  for (const campaign of campaigns) {
    const campaignKeywords = getCampaignKeywordMap(campaign);
    const skipCompetitorList = list.name === 'competitor' && isCompetitorCampaignName(campaign.campaignName);
    const skipBrandList = list.name === 'brand' && isBrandCampaignName(campaign.campaignName);

    if (skipCompetitorList || skipBrandList) continue;

    for (const item of list.items) {
      if (!item.enabled) continue;
      const variants = item.variants && item.variants.length > 0 ? item.variants : [item.keyword];
      for (const variant of variants) {
        if (campaignContainsPhrase(campaignKeywords, variant)) continue;
        upsertListItem(appliedItems, {
          ...item,
          keyword: variant,
          campaign: campaign.campaignName,
          adGroup: '',
        });
      }
    }
  }

  return createList(list.name, Array.from(appliedItems.values()));
}

export function buildAppliedNegativeKeywordLists(input: {
  reviewLists: NegativeKeywordList[];
  campaigns: CampaignStructureV2[];
}): NegativeKeywordList[] {
  const orderedNames: NegativeKeywordListName[] = ['competitor', 'universal', 'brand'];
  const reviewListsByName = new Map(input.reviewLists.map((list) => [list.name, list]));
  const appliedLists: NegativeKeywordList[] = [];

  for (const listName of orderedNames) {
    const reviewList = reviewListsByName.get(listName) ?? createList(listName, []);
    appliedLists.push(applySharedListToCampaigns(reviewList, input.campaigns));
  }

  appliedLists.push(buildFunnelNegativeKeywordList(input.campaigns));
  return appliedLists;
}

export function flattenAppliedNegativeKeywordLists(lists: NegativeKeywordList[]): NegativeKeyword[] {
  const seen = new Set<string>();
  const flattened: NegativeKeyword[] = [];

  for (const list of lists) {
    for (const item of list.items) {
      if (!item.enabled) continue;

      const campaign = item.campaign ?? '';
      const adGroup = item.adGroup ?? '';
      const keyword = item.keyword.trim();
      const normalized = normalizeKeywordText(keyword);
      const dedupeKey = [campaign, adGroup, normalized, item.matchType].join('|||');

      if (!campaign || !normalized || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      flattened.push({
        campaign,
        adGroup,
        keyword,
        matchType: item.matchType,
        status: 'Negative',
        listName: list.name,
        source: item.source,
        reason: item.reasons.join('; '),
      });
    }
  }

  return flattened;
}
