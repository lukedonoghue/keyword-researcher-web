import { OpenRouterService } from '../services/openrouter';
import type { AdGroup, CampaignStructureV2, ResponsiveSearchAd, WebsiteMessagingProfile } from '../types/index';
import { normalizeKeywordText } from './keyword-signals';

const DEFAULT_RSA_MODEL =
  process.env.OPENROUTER_RSA_MODEL?.trim() ||
  process.env.OPENROUTER_ENHANCE_MODEL?.trim() ||
  process.env.OPENROUTER_MODEL?.trim() ||
  'google/gemini-3-flash-preview';

const RSA_TEMPERATURE = 0.2;
const RSA_BATCH_SIZE = 8;
const MAX_HEADLINES = 8;
const MAX_DESCRIPTIONS = 4;
const HEADLINE_LIMIT = 30;
const DESCRIPTION_LIMIT = 90;
const PATH_LIMIT = 15;

type RsaBatchRequest = {
  campaignName: string;
  campaignTheme: string;
  campaignType: 'service' | 'brand' | 'competitor';
  adGroupName: string;
  serviceName: string;
  competitorBrand?: string;
  landingPage?: string;
  keywords: string[];
};

type RsaBatchResult = {
  ads: Array<{
    campaignName: string;
    adGroupName: string;
    headlines: string[];
    descriptions: string[];
    path1?: string;
    path2?: string;
  }>;
};

type GenerateResponsiveSearchAdsOptions = {
  apiKey?: string;
  model?: string;
  businessName?: string;
  businessDescription?: string;
  messagingProfile?: WebsiteMessagingProfile;
  contextTerms?: string[];
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const normalized = normalizeKeywordText(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function trimToLimit(text: string, limit: number): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= limit) return normalized;

  const truncated = normalized.slice(0, limit).trim();
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace >= Math.floor(limit * 0.6)) {
    return truncated.slice(0, lastSpace).trim();
  }

  return truncated;
}

function sanitizeHeadlines(values: string[]): string[] {
  return dedupeStrings(values)
    .map((value) => trimToLimit(value, HEADLINE_LIMIT))
    .filter((value) => value.length >= 3)
    .slice(0, MAX_HEADLINES);
}

function sanitizeDescriptions(values: string[]): string[] {
  return dedupeStrings(values)
    .map((value) => trimToLimit(value, DESCRIPTION_LIMIT))
    .filter((value) => value.length >= 8)
    .slice(0, MAX_DESCRIPTIONS);
}

function sanitizePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9/-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\//g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, PATH_LIMIT)
    .replace(/^-|-$/g, '');
  return sanitized || undefined;
}

function pickMessagingSnippet(values: string[] | undefined): string {
  return values?.find((value) => value.trim().length > 0)?.trim() ?? '';
}

function isBrandCampaign(campaign: CampaignStructureV2): boolean {
  return /^brand\s*-/i.test(campaign.campaignName.trim());
}

function isCompetitorCampaign(campaign: CampaignStructureV2): boolean {
  return /^competitor\s*-/i.test(campaign.campaignName.trim());
}

function deriveServiceName(campaign: CampaignStructureV2, adGroup: AdGroup): string {
  if (isCompetitorCampaign(campaign)) {
    const fromCompetitorCampaign = campaign.campaignName.replace(/^Competitor\s*-\s*/i, '').trim();
    if (fromCompetitorCampaign) return fromCompetitorCampaign;
  }

  if (isBrandCampaign(campaign)) {
    const fromBrandCampaign = campaign.campaignName.replace(/^Brand\s*-\s*/i, '').trim();
    if (fromBrandCampaign) return fromBrandCampaign;
  }

  const fromCampaign = campaign.campaignName.replace(/^Service\s*-\s*/i, '').trim();
  if (fromCampaign) return fromCampaign;
  return adGroup.name.replace(/\s-\s(?:Action|Research)(?::.*)?$/i, '').trim();
}

function getCompetitorBrandName(adGroup: AdGroup): string {
  return adGroup.name.replace(/^Competitor\s*-\s*/i, '').trim();
}

function getDedupedAdGroupKeywords(adGroup: AdGroup): string[] {
  const rows = adGroup.subThemes
    .flatMap((subTheme) => subTheme.keywords)
    .sort((a, b) => {
      const qualityDiff = (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
      if (qualityDiff !== 0) return qualityDiff;
      return b.volume - a.volume;
    });

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const row of rows) {
    const normalized = normalizeKeywordText(row.keyword);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    keywords.push(row.keyword);
    if (keywords.length >= 8) break;
  }

  return keywords;
}

function buildFallbackRsa(
  campaign: CampaignStructureV2,
  adGroup: AdGroup,
  options: GenerateResponsiveSearchAdsOptions = {},
): ResponsiveSearchAd {
  const serviceName = deriveServiceName(campaign, adGroup);
  const keywords = getDedupedAdGroupKeywords(adGroup);
  const primaryKeyword = keywords[0] ?? serviceName;
  const secondaryKeyword = keywords[1] ?? serviceName;
  const adGroupTopic = adGroup.name.split(':').pop()?.trim() || 'Quote';
  const messaging = options.messagingProfile;
  const benefit = pickMessagingSnippet(messaging?.benefits);
  const differentiator = pickMessagingSnippet(messaging?.differentiators);
  const offer = pickMessagingSnippet(messaging?.offers);
  const proof = pickMessagingSnippet(messaging?.proofPoints);
  const cta = pickMessagingSnippet(messaging?.callsToAction);
  const contextTerm = pickMessagingSnippet(options.contextTerms);
  const businessName = options.businessName;
  const brandCampaign = isBrandCampaign(campaign);
  const competitorCampaign = isCompetitorCampaign(campaign);

  const headlines = sanitizeHeadlines([
    brandCampaign && businessName ? `${businessName} Official Site` : '',
    brandCampaign && businessName ? `Official ${businessName}` : serviceName,
    competitorCampaign ? `Trusted ${serviceName}` : primaryKeyword,
    competitorCampaign ? 'Why Customers Choose Us' : `Book ${serviceName}`,
    competitorCampaign ? `Compare ${serviceName}` : `${serviceName} Quotes`,
    competitorCampaign ? `Local ${serviceName} Experts` : `${serviceName} Near You`,
    offer,
    proof,
    competitorCampaign ? 'Get A Fast Quote' : secondaryKeyword,
    differentiator,
    benefit,
    competitorCampaign ? 'Better Service Options' : `Fast ${serviceName}`,
    businessName ?? '',
    `Trusted ${serviceName}`,
    cta,
  ]);

  const descriptions = sanitizeDescriptions([
    brandCampaign && businessName
      ? `Choose the official ${businessName} team for ${serviceName.toLowerCase()} and brand-specific searches.`
      : competitorCampaign
        ? `Compare your ${serviceName.toLowerCase()} options and see why customers choose us for stronger service and fast quotes.`
      : `Get expert ${serviceName.toLowerCase()} with clear pricing, strong coverage, and fast quote turnaround.`,
    competitorCampaign
      ? `${benefit || `See why customers prefer our team for ${serviceName.toLowerCase()} when they are comparing options`}. ${cta || `Request a quote today`}.`
      : `${benefit || `Get ${serviceName.toLowerCase()} help that fits your location and service goals`}. ${cta || `Request a quote today`}.`,
    competitorCampaign
      ? `${differentiator || proof || 'Local expertise, clear pricing, and direct support without the runaround'}.`
      : `${differentiator || proof || `Built around ${adGroupTopic.toLowerCase()} searches so traffic lands in the right ad group`}.`,
    businessName
      ? `${businessName} helps customers compare options, request pricing, and move forward with confidence${contextTerm ? ` for ${contextTerm}` : ''}.`
      : '',
    offer ? `Current offer: ${offer}. ${cta || 'Get pricing and next steps now'}.` : '',
  ]);

  return {
    headlines: headlines.length >= 3 ? headlines : sanitizeHeadlines([serviceName, `Book ${serviceName}`, `${serviceName} Quotes`]),
    descriptions: descriptions.length >= 2
      ? descriptions
      : sanitizeDescriptions([
        competitorCampaign
          ? `Get expert ${serviceName.toLowerCase()} with fast quotes and a better-fit alternative.`
          : `Get expert ${serviceName.toLowerCase()} with fast quotes and clear next steps.`,
        competitorCampaign
          ? `Talk to a specialist today and compare a stronger option for your location and budget.`
          : `Talk to a specialist today and start with a service that fits your location and budget.`,
      ]),
    path1: sanitizePath(serviceName),
    path2: sanitizePath(competitorCampaign ? 'compare' : adGroupTopic),
    source: 'fallback',
  };
}

function stripCompetitorMentions(values: string[], competitorBrand: string | undefined): string[] {
  if (!competitorBrand?.trim()) return values;
  const normalizedBrand = normalizeKeywordText(competitorBrand);
  if (!normalizedBrand) return values;
  return values.filter((value) => !normalizeKeywordText(value).includes(normalizedBrand));
}

function ensureBrandLeadingHeadline(headlines: string[], businessName: string | undefined): string[] {
  if (!businessName?.trim()) return headlines;
  const normalizedBusiness = normalizeKeywordText(businessName);
  const leadHeadline = trimToLimit(`${businessName.trim()} Official Site`, HEADLINE_LIMIT);
  const hasBrandMention = headlines.some((headline) => normalizeKeywordText(headline).includes(normalizedBusiness));
  const ordered = hasBrandMention ? headlines : [leadHeadline, ...headlines];
  const withoutDuplicateLead = ordered.filter((headline, index) => (
    index === 0 || normalizeKeywordText(headline) !== normalizeKeywordText(leadHeadline)
  ));
  return sanitizeHeadlines([leadHeadline, ...withoutDuplicateLead]);
}

function sanitizeGeneratedRsa(
  input: {
    headlines?: string[];
    descriptions?: string[];
    path1?: string;
    path2?: string;
  },
  fallback: ResponsiveSearchAd,
  context: {
    businessName?: string;
    brandCampaign: boolean;
    competitorBrand?: string;
  },
  model: string,
): ResponsiveSearchAd {
  const rawHeadlines = stripCompetitorMentions(input.headlines ?? [], context.competitorBrand);
  const rawDescriptions = stripCompetitorMentions(input.descriptions ?? [], context.competitorBrand);
  const headlines = context.brandCampaign
    ? ensureBrandLeadingHeadline(sanitizeHeadlines(rawHeadlines), context.businessName)
    : sanitizeHeadlines(rawHeadlines);
  const descriptions = sanitizeDescriptions(rawDescriptions);

  return {
    headlines: headlines.length >= 3 ? headlines : fallback.headlines,
    descriptions: descriptions.length >= 2 ? descriptions : fallback.descriptions,
    path1: sanitizePath(input.path1) ?? fallback.path1,
    path2: sanitizePath(input.path2) ?? fallback.path2,
    source: 'ai',
    model,
  };
}

function applyResponsiveSearchAds(
  campaigns: CampaignStructureV2[],
  generated: Map<string, ResponsiveSearchAd>,
  fallbacks: Map<string, ResponsiveSearchAd>,
): CampaignStructureV2[] {
  return campaigns.map((campaign) => ({
    ...campaign,
    adGroups: campaign.adGroups.map((adGroup) => {
      const key = `${campaign.campaignName}|||${adGroup.name}`;
      return {
        ...adGroup,
        responsiveSearchAd: generated.get(key) ?? fallbacks.get(key),
      };
    }),
  }));
}

export async function generateResponsiveSearchAds(
  campaigns: CampaignStructureV2[],
  options: GenerateResponsiveSearchAdsOptions = {},
): Promise<CampaignStructureV2[]> {
  const fallbacks = new Map<string, ResponsiveSearchAd>();
  const requests: RsaBatchRequest[] = [];

  for (const campaign of campaigns) {
    for (const adGroup of campaign.adGroups) {
      const key = `${campaign.campaignName}|||${adGroup.name}`;
      fallbacks.set(key, buildFallbackRsa(campaign, adGroup, options));
      requests.push({
        campaignName: campaign.campaignName,
        campaignTheme: campaign.campaignTheme,
        campaignType: isBrandCampaign(campaign) ? 'brand' : isCompetitorCampaign(campaign) ? 'competitor' : 'service',
        adGroupName: adGroup.name,
        serviceName: deriveServiceName(campaign, adGroup),
        competitorBrand: isCompetitorCampaign(campaign) ? getCompetitorBrandName(adGroup) : undefined,
        landingPage: campaign.landingPage,
        keywords: getDedupedAdGroupKeywords(adGroup),
      });
    }
  }

  if (!options.apiKey) {
    return applyResponsiveSearchAds(campaigns, new Map(), fallbacks);
  }

    const client = new OpenRouterService(options.apiKey, options.model?.trim() || DEFAULT_RSA_MODEL);
  if (!client.isAvailable()) {
    return applyResponsiveSearchAds(campaigns, new Map(), fallbacks);
  }

  const generated = new Map<string, ResponsiveSearchAd>();

  for (const batch of chunkArray(requests, RSA_BATCH_SIZE)) {
    try {
      const { data } = await client.jsonPrompt<RsaBatchResult>(
        `You write Google Ads responsive search ads for high-intent search campaigns.
Return strict JSON with one RSA per requested ad group.
Requirements:
- 6 to 8 unique headlines, each 30 characters or fewer
- 3 to 4 unique descriptions, each 90 characters or fewer
- Optional path1 and path2, each 15 characters or fewer
- Match the user's service intent and ad-group topic
	- Use direct-response search language that improves CTR and lead quality
	- Prefer concrete hooks supported by the business: quote, pricing, speed, local coverage, licensing, warranty, reviews, trust, official brand, financing, or availability when provided
	- Balance headline types across benefit, proof, offer, keyword relevance, and CTA
	- For brand campaigns, the first headline must include the exact business name and feel official/navigational
	- For competitor campaigns, do not mention competitor brand names in headlines or descriptions even if the ad group is based on competitor searches
	- For competitor campaigns, frame the copy as a stronger alternative with proof, pricing clarity, local expertise, or service advantages
	- For local service campaigns, make the ad feel action-oriented, specific, and conversion-focused
	- Avoid clickbait, unsupported claims, ALL CAPS, keyword stuffing, and excessive punctuation
	Return JSON only: { "ads": [{ "campaignName": string, "adGroupName": string, "headlines": string[], "descriptions": string[], "path1"?: string, "path2"?: string }] }`,
        JSON.stringify({
          businessName: options.businessName ?? '',
          businessDescription: options.businessDescription ?? '',
          contextTerms: options.contextTerms ?? [],
          messagingProfile: options.messagingProfile ?? {
            features: [],
            benefits: [],
            differentiators: [],
            offers: [],
            callsToAction: [],
            proofPoints: [],
            tone: '',
          },
          adGroups: batch,
        }),
        RSA_TEMPERATURE,
      );

      for (const ad of data.ads ?? []) {
        const key = `${ad.campaignName}|||${ad.adGroupName}`;
        const fallback = fallbacks.get(key);
        if (!fallback) continue;
        const request = batch.find((item) => item.campaignName === ad.campaignName && item.adGroupName === ad.adGroupName);
        generated.set(key, sanitizeGeneratedRsa(ad, fallback, {
          businessName: options.businessName,
          brandCampaign: request?.campaignType === 'brand',
          competitorBrand: request?.competitorBrand,
        }, client.getModel()));
      }
    } catch {
      // Fall back per ad group if generation fails for a batch.
    }
  }

  return applyResponsiveSearchAds(campaigns, generated, fallbacks);
}
