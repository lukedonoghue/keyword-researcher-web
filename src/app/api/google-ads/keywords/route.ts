import { NextRequest, NextResponse } from 'next/server';
import { requireGoogleAuth, getGoogleAdsCredentials } from '@/lib/auth/middleware';
import { GoogleAdsService } from '@/lib/services/google-ads';
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
      seedKeywords?: string[];
      targetUrl?: string;
      languageId?: string;
      geoTargetIds?: string[];
    };
    const seedKeywords = Array.isArray(payload.seedKeywords)
      ? payload.seedKeywords.filter((value): value is string => typeof value === 'string')
      : [];
    const targetUrl = payload.targetUrl?.trim() || '';
    const languageId = payload.languageId?.trim() || '1000';
    const geoTargetIds = Array.isArray(payload.geoTargetIds)
      ? payload.geoTargetIds.filter((value): value is string => typeof value === 'string')
      : ['2840'];

    const credentials = getGoogleAdsCredentials(auth.session);
    const service = new GoogleAdsService(credentials);
    const keywords = await service.generateKeywordIdeas(
      seedKeywords,
      targetUrl,
      languageId,
      geoTargetIds,
    );

    // Debug: log CPC distribution to verify API returns distinct values
    const cpcDistribution = new Map<string, number>();
    for (const kw of keywords) {
      const key = `${kw.cpc.toFixed(2)}|${kw.volume}`;
      cpcDistribution.set(key, (cpcDistribution.get(key) || 0) + 1);
    }
    console.log(`[keywords] ${keywords.length} results, ${cpcDistribution.size} distinct cpc|vol combos:`,
      [...cpcDistribution.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}(×${v})`).join(', '));

    return NextResponse.json({ keywords });
  } catch (error: unknown) {
    console.error('Error generating keywords:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to generate keyword ideas') },
      { status: 500 }
    );
  }
}
