import { NextRequest, NextResponse } from 'next/server';
import { requireGoogleAuth, getGoogleAdsCredentials } from '@/lib/auth/middleware';
import { GoogleAdsService } from '@/lib/services/google-ads';
import { getErrorMessage } from '@/lib/utils';

/**
 * Debug endpoint: returns raw GKP response alongside normalized keywords.
 * GET /api/google-ads/keywords-debug?seeds=gutter+guards,gutter+guard+installation&geo=2036&lang=1000
 */
export async function GET(request: NextRequest) {
  const auth = await requireGoogleAuth();
  if (auth.error) return auth.error;

  if (!auth.session.customerId) {
    return NextResponse.json({ error: 'No Google Ads account selected.' }, { status: 400 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const seeds = params.get('seeds')?.split(',').map(s => s.trim()).filter(Boolean) ?? ['gutter guards'];
    const geo = params.get('geo') ?? '2036'; // default: Australia
    const lang = params.get('lang') ?? '1000';
    const url = params.get('url') ?? '';

    const credentials = getGoogleAdsCredentials(auth.session);
    const service = new GoogleAdsService(credentials);
    const result = await service.generateKeywordIdeasDebug(seeds, url, lang, [geo]);

    // Build CPC distribution summary
    const cpcValues = new Map<string, string[]>();
    for (const kw of result.normalized) {
      const key = `$${kw.cpc.toFixed(2)} (low:$${kw.cpcLow.toFixed(2)} high:$${kw.cpcHigh.toFixed(2)}) vol:${kw.volume}`;
      const existing = cpcValues.get(key) ?? [];
      existing.push(kw.text);
      cpcValues.set(key, existing);
    }
    const cpcSummary = [...cpcValues.entries()].map(([range, kws]) => ({
      range,
      count: kws.length,
      examples: kws.slice(0, 3),
    }));

    return NextResponse.json({
      request: { seeds, geo, lang, url: url || '(none)' },
      responseType: result.responseType,
      rawRowCount: result.rawRowCount,
      normalizedCount: result.normalized.length,
      rawSample: result.rawSample,
      cpcSummary,
      normalized: result.normalized,
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('Debug keyword error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Debug keyword request failed') },
      { status: 500 }
    );
  }
}
