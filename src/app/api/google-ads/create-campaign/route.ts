import { NextRequest, NextResponse } from 'next/server';
import { requireGoogleAuth, getGoogleAdsCredentials } from '@/lib/auth/middleware';
import { GoogleAdsService } from '@/lib/services/google-ads';
import type { CampaignStructureV2, NegativeKeyword } from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  const auth = await requireGoogleAuth();
  if (auth.error) return auth.error;

  if (!auth.session.customerId) {
    return NextResponse.json(
      { error: 'No Google Ads account selected. Please select an account first.' },
      { status: 400 }
    );
  }

  try {
    const payload = await request.json() as {
      campaigns?: CampaignStructureV2[];
      dailyBudgetMicros?: number;
      biddingStrategy?: string;
      geoTargetIds?: string[];
      negativeKeywords?: NegativeKeyword[];
      defaultFinalUrl?: string;
    };

    const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
    if (campaigns.length === 0) {
      return NextResponse.json({ error: 'No campaigns provided' }, { status: 400 });
    }

    const dailyBudgetMicros = typeof payload.dailyBudgetMicros === 'number' && payload.dailyBudgetMicros > 0
      ? payload.dailyBudgetMicros
      : 50_000_000; // Default $50/day
    const biddingStrategy = payload.biddingStrategy || 'MAXIMIZE_CONVERSIONS';
    const geoTargetIds = Array.isArray(payload.geoTargetIds)
      ? payload.geoTargetIds.filter((v): v is string => typeof v === 'string')
      : ['2840'];
    const negativeKeywords = Array.isArray(payload.negativeKeywords) ? payload.negativeKeywords : [];

    const credentials = getGoogleAdsCredentials(auth.session);
    const service = new GoogleAdsService(credentials);

    const result = await service.createCampaignStructure(campaigns, {
      dailyBudgetMicros,
      biddingStrategy,
      geoTargetIds,
      negativeKeywords,
      defaultFinalUrl: payload.defaultFinalUrl?.trim() || '',
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error creating campaigns:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to create campaigns in Google Ads') },
      { status: 500 }
    );
  }
}
