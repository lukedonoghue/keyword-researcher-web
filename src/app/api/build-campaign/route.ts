import { NextRequest, NextResponse } from 'next/server';
import { CampaignBuilder } from '@/lib/logic/campaign-builder';
import type { ServiceContext } from '@/lib/types/index';
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

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      services?: Array<ServiceContext | string>;
      keywords?: CampaignKeywordMetric[];
      allKeywords?: Array<{ text: string; volume: number; cpc: number }>;
      competitorNames?: string[];
      options?: { minAdGroupKeywords?: number; maxAdGroupKeywords?: number };
      targetDomain?: string;
    };
    const services = Array.isArray(payload.services) ? payload.services : [];
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    const allKeywords = Array.isArray(payload.allKeywords) ? payload.allKeywords : [];
    const competitorNames = Array.isArray(payload.competitorNames) ? payload.competitorNames : [];
    const options = payload.options ?? {};

    if (!services.length) {
      return NextResponse.json({ error: 'Services are required' }, { status: 400 });
    }
    if (!keywords.length) {
      return NextResponse.json({ error: 'Keywords are required' }, { status: 400 });
    }

    const campaigns = CampaignBuilder.build(services, keywords, {
      ...options,
      targetDomain: payload.targetDomain,
    });

    // Build per-campaign negatives + cross-campaign negatives
    const negativeKeywords: Array<{
      campaign: string;
      adGroup: string;
      keyword: string;
      matchType: 'Phrase' | 'Exact';
      status: 'Negative';
    }> = [];

    // Build a set of keywords used in each campaign
    const campaignKeywordSets = new Map<string, Set<string>>();
    for (const campaign of campaigns) {
      const kwSet = new Set<string>();
      for (const ag of campaign.adGroups) {
        for (const st of ag.subThemes) {
          for (const kw of st.keywords) {
            kwSet.add(kw.keyword.toLowerCase().trim());
          }
        }
      }
      campaignKeywordSets.set(campaign.campaignName, kwSet);
    }

    // For each campaign, generate shared negatives + cross-campaign negatives
    for (const campaign of campaigns) {
      const thisKws = campaignKeywordSets.get(campaign.campaignName)!;

      // Shared negatives (competitor brands + navigational terms)
      const sharedNegs = CampaignBuilder.buildNegativeKeywords(
        allKeywords.length > 0 ? allKeywords : keywords,
        keywords,
        campaign.campaignName,
        competitorNames,
      );
      negativeKeywords.push(...sharedNegs);

      // Cross-campaign negatives (other campaigns' keywords as negatives)
      // Use Exact match to prevent accidentally excluding valid phrase variations
      for (const [otherName, otherKws] of campaignKeywordSets.entries()) {
        if (otherName === campaign.campaignName) continue;
        for (const kw of otherKws) {
          if (thisKws.has(kw)) continue; // don't negative your own keywords
          negativeKeywords.push({
            campaign: campaign.campaignName,
            adGroup: '',
            keyword: kw,
            matchType: 'Exact' as const,
            status: 'Negative' as const,
          });
        }
      }
    }

    return NextResponse.json({ campaigns, negativeKeywords });
  } catch (error: unknown) {
    console.error('Error building campaign:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to build campaign') },
      { status: 500 }
    );
  }
}
