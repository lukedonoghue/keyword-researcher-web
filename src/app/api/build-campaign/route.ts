import { NextRequest, NextResponse } from 'next/server';
import { CampaignBuilder } from '@/lib/logic/campaign-builder';
import {
  buildAppliedNegativeKeywordLists,
  buildReviewNegativeKeywordLists,
  flattenAppliedNegativeKeywordLists,
  getBrandIdentityTerms,
  isBrandCampaignName,
  isCompetitorCampaignName,
  mergeReviewNegativeKeywordLists,
} from '@/lib/logic/negative-keywords';
import { isCompetitorBrand } from '@/lib/logic/keyword-signals';
import { generateResponsiveSearchAds } from '@/lib/logic/rsa-generator';
import type {
  CampaignStrategy,
  CampaignStructureV2,
  NegativeKeywordList,
  ServiceContext,
  SuppressedKeyword,
  WebsiteMessagingProfile,
} from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

type CampaignKeywordMetric = {
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
};

function dedupeKeywords(keywords: CampaignKeywordMetric[]): CampaignKeywordMetric[] {
  const deduped = new Map<string, CampaignKeywordMetric>();

  for (const keyword of keywords) {
    const normalized = keyword.text.trim().toLowerCase();
    if (!normalized) continue;

    const existing = deduped.get(normalized);
    if (
      !existing ||
      keyword.volume > existing.volume ||
      (keyword.volume === existing.volume && keyword.cpc < existing.cpc)
    ) {
      deduped.set(normalized, keyword);
    }
  }

  return Array.from(deduped.values());
}

function resolveMatchTypes(strategy: CampaignStrategy | null): Array<'Exact' | 'Phrase'> {
  if (strategy?.matchTypeStrategy === 'exact_only') return ['Exact'];
  if (strategy?.matchTypeStrategy === 'phrase_only') return ['Phrase'];
  return ['Exact', 'Phrase'];
}

function buildStrategyKeywordRows(
  keywords: CampaignKeywordMetric[],
  strategy: CampaignStrategy | null,
) {
  const matchTypes = resolveMatchTypes(strategy);

  return keywords.flatMap((keyword) => matchTypes.map((matchType) => ({
    keyword: keyword.text,
    matchType,
    volume: keyword.volume,
    cpc: keyword.cpc,
    cpcLow: keyword.cpcLow,
    cpcHigh: keyword.cpcHigh,
    competitionIndex: keyword.competitionIndex,
    qualityScore: keyword.qualityScore,
    qualityRating: keyword.qualityRating,
    intent: keyword.intent,
  })));
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function resolveDefaultLandingPage(
  services: Array<ServiceContext | string>,
  targetDomain?: string,
): string | undefined {
  if (typeof services[0] !== 'string' && services[0]?.landingPage) {
    return services[0].landingPage;
  }
  if (!targetDomain) return undefined;
  return `https://${targetDomain}/`;
}

function buildCompetitorCampaign(
  services: Array<ServiceContext | string>,
  suppressedKeywords: SuppressedKeyword[],
  competitorNames: string[],
  strategy: CampaignStrategy | null,
  targetDomain?: string,
): CampaignStructureV2 | null {
  const competitorKeywords = dedupeKeywords(
    suppressedKeywords
      .filter((keyword) => Boolean(isCompetitorBrand(keyword.text, competitorNames)))
      .map((keyword) => ({
        text: keyword.text,
        volume: keyword.volume,
        cpc: keyword.cpc,
        cpcLow: keyword.cpcLow,
        cpcHigh: keyword.cpcHigh,
        competitionIndex: keyword.competitionIndex,
        qualityScore: keyword.qualityScore,
        qualityRating: keyword.qualityRating,
        intent: keyword.intent,
      }))
  );

  if (competitorKeywords.length === 0) return null;

  const groupedByBrand = new Map<string, CampaignKeywordMetric[]>();
  for (const keyword of competitorKeywords) {
    const brand = isCompetitorBrand(keyword.text, competitorNames) ?? 'Competitor';
    const existing = groupedByBrand.get(brand) ?? [];
    existing.push(keyword);
    groupedByBrand.set(brand, existing);
  }

  const baseAdGroups = Array.from(groupedByBrand.entries()).map(([brand, keywords]) => ({
    name: `Competitor - ${brand}`,
    subThemes: [
      {
        name: 'Competitor Keywords',
        keywords: buildStrategyKeywordRows(keywords, strategy),
      },
    ],
  }));
  const adGroups = baseAdGroups;

  if (adGroups.length === 0) return null;

  const primaryService =
    typeof services[0] === 'string'
      ? services[0]
      : services[0]?.name ?? 'Market';
  const landingPage =
    typeof services[0] === 'string'
      ? (targetDomain ? `https://${targetDomain}/` : undefined)
      : services[0]?.landingPage || (targetDomain ? `https://${targetDomain}/` : undefined);

  return {
    campaignName: `Competitor - ${primaryService}`,
    campaignTheme: 'Competitor Terms',
    landingPage,
    bidStrategy: 'Maximize conversions',
    adGroups,
  };
}

function buildBrandCampaign(
  services: Array<ServiceContext | string>,
  keywords: CampaignKeywordMetric[],
  strategy: CampaignStrategy | null,
  businessName?: string,
  targetDomain?: string,
): CampaignStructureV2 | null {
  const brandTerms = getBrandIdentityTerms({ businessName, targetDomain });
  if (brandTerms.length === 0) return null;

  const serviceNames = services
    .map((service) => (typeof service === 'string' ? service : service.name))
    .filter(Boolean);

  const avgCpc = keywords.filter((keyword) => keyword.cpc > 0).reduce((sum, keyword) => sum + keyword.cpc, 0)
    / Math.max(1, keywords.filter((keyword) => keyword.cpc > 0).length);
  const baseCpc = Number.isFinite(avgCpc) && avgCpc > 0 ? Math.max(0.75, Number((avgCpc * 0.6).toFixed(2))) : 1.5;

  const brandKeywordTexts = new Set<string>();
  for (const brandTerm of brandTerms) {
    brandKeywordTexts.add(brandTerm);
    brandKeywordTexts.add(`${brandTerm} reviews`);
    brandKeywordTexts.add(`${brandTerm} quote`);
    brandKeywordTexts.add(`${brandTerm} pricing`);
    for (const serviceName of serviceNames.slice(0, 6)) {
      const normalizedService = serviceName.trim().toLowerCase();
      if (!normalizedService) continue;
      brandKeywordTexts.add(`${brandTerm} ${normalizedService}`);
      brandKeywordTexts.add(`${normalizedService} ${brandTerm}`);
    }
  }

  const brandKeywords = dedupeKeywords(
    Array.from(brandKeywordTexts)
      .map((text) => text.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .map((text, index) => ({
        text,
        volume: index < brandTerms.length ? 20 : 10,
        cpc: baseCpc,
        cpcLow: Number(Math.max(0.3, baseCpc * 0.7).toFixed(2)),
        cpcHigh: Number((baseCpc * 1.3).toFixed(2)),
        competitionIndex: 50,
        qualityScore: 100,
        qualityRating: 'A',
        intent: text.includes('reviews') ? 'commercial' : 'navigational' as const,
      })),
  );

  if (brandKeywords.length === 0) return null;

  const brandLabel = businessName?.trim() || toTitleCase(brandTerms[0] ?? 'Brand');

  return {
    campaignName: `Brand - ${brandLabel}`,
    campaignTheme: `${brandLabel} Brand Search`,
    landingPage: resolveDefaultLandingPage(services, targetDomain),
    bidStrategy: 'Maximize conversions',
    adGroups: [
      {
        name: 'Brand Search',
        priority: 'core',
        subThemes: [
          {
            name: 'Brand Keywords',
            keywords: buildStrategyKeywordRows(brandKeywords, strategy),
          },
        ],
      },
    ],
    priority: 'high',
    priorityScore: 100,
  };
}

function sanitizeReviewLists(value: unknown): NegativeKeywordList[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NegativeKeywordList => {
    return Boolean(
      item &&
      typeof item === 'object' &&
      'name' in item &&
      'items' in item &&
      Array.isArray((item as NegativeKeywordList).items)
    );
  });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      services?: Array<ServiceContext | string>;
      keywords?: CampaignKeywordMetric[];
      allKeywords?: Array<{ text: string; volume: number; cpc: number }>;
      businessName?: string;
      businessDescription?: string;
      messagingProfile?: WebsiteMessagingProfile;
      contextTerms?: string[];
      competitorNames?: string[];
      suppressedKeywords?: SuppressedKeyword[];
      reviewNegativeKeywordLists?: NegativeKeywordList[];
      manualNegativeKeywords?: string[];
      strategy?: CampaignStrategy | null;
      options?: { minAdGroupKeywords?: number; maxAdGroupKeywords?: number };
      targetDomain?: string;
      openrouterApiKey?: string;
      openrouterModel?: string;
    };

    const services = Array.isArray(payload.services) ? payload.services : [];
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    const competitorNames = Array.isArray(payload.competitorNames) ? payload.competitorNames : [];
    const suppressedKeywords = Array.isArray(payload.suppressedKeywords) ? payload.suppressedKeywords : [];
    const reviewNegativeKeywordLists = sanitizeReviewLists(payload.reviewNegativeKeywordLists);
    const strategy = payload.strategy ?? null;
    const options = payload.options ?? {};

    if (!services.length) {
      return NextResponse.json({ error: 'Services are required' }, { status: 400 });
    }
    if (!keywords.length) {
      return NextResponse.json({ error: 'Keywords are required' }, { status: 400 });
    }

    let campaigns = CampaignBuilder.build(services, keywords, {
      ...options,
      matchTypeStrategy: strategy?.matchTypeStrategy,
      targetDomain: payload.targetDomain,
    });

    if (strategy?.competitorCampaignMode === 'separate') {
      const competitorCampaign = buildCompetitorCampaign(
        services,
        suppressedKeywords,
        competitorNames,
        strategy,
        payload.targetDomain,
      );
      if (competitorCampaign && !campaigns.some((campaign) => isCompetitorCampaignName(campaign.campaignName))) {
        campaigns = CampaignBuilder.assignPriority([...campaigns, competitorCampaign]);
      }
    }

    if (strategy?.brandCampaignMode === 'separate') {
      const brandCampaign = buildBrandCampaign(
        services,
        keywords,
        strategy,
        payload.businessName,
        payload.targetDomain,
      );
      if (brandCampaign && !campaigns.some((campaign) => isBrandCampaignName(campaign.campaignName))) {
        campaigns = CampaignBuilder.assignPriority([...campaigns, brandCampaign]);
      }
    }

    campaigns = await generateResponsiveSearchAds(campaigns, {
      apiKey: payload.openrouterApiKey,
      model: payload.openrouterModel,
      businessName: payload.businessName,
      businessDescription: payload.businessDescription,
      messagingProfile: payload.messagingProfile,
      contextTerms: Array.isArray(payload.contextTerms) ? payload.contextTerms : [],
    });

    const generatedReviewLists = buildReviewNegativeKeywordLists({
      suppressedKeywords,
      competitorNames,
      businessName: payload.businessName,
      targetDomain: payload.targetDomain,
      enableBrandList: strategy?.brandCampaignMode === 'separate',
    });
    const derivedReviewLists = mergeReviewNegativeKeywordLists(
      generatedReviewLists,
      reviewNegativeKeywordLists,
    );

    const negativeKeywordLists = buildAppliedNegativeKeywordLists({
      reviewLists: derivedReviewLists,
      campaigns,
    });
    const negativeKeywords = flattenAppliedNegativeKeywordLists(negativeKeywordLists);

    return NextResponse.json({ campaigns, negativeKeywords, negativeKeywordLists });
  } catch (error: unknown) {
    console.error('Error building campaign:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to build campaign') },
      { status: 500 }
    );
  }
}
