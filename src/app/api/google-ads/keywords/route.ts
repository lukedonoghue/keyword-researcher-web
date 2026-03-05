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

    // CPC diversity stats (visible in Network tab response)
    const cpcs = keywords.map(kw => kw.cpc).filter(c => c > 0);
    const distinctCpcs = new Set(cpcs.map(c => c.toFixed(2)));
    const volumes = keywords.map(kw => kw.volume);
    const distinctVolumes = new Set(volumes);
    // Sample keywords at different positions
    const sampleAt = [0, Math.floor(keywords.length / 4), Math.floor(keywords.length / 2), Math.floor(keywords.length * 3 / 4), keywords.length - 1]
      .filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < keywords.length);
    const samples = sampleAt.map(i => ({ i, text: keywords[i].text.slice(0, 30), cpc: keywords[i].cpc, vol: keywords[i].volume }));

    return NextResponse.json({
      keywords,
      _cpcDebug: {
        total: keywords.length,
        distinctCpcs: distinctCpcs.size,
        distinctVolumes: distinctVolumes.size,
        cpcRange: cpcs.length > 0 ? [Math.min(...cpcs), Math.max(...cpcs)] : [0, 0],
        volumeRange: volumes.length > 0 ? [Math.min(...volumes), Math.max(...volumes)] : [0, 0],
        samples,
      },
    });
  } catch (error: unknown) {
    console.error('Error generating keywords:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to generate keyword ideas') },
      { status: 500 }
    );
  }
}
