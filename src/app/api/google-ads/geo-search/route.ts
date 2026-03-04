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
      query?: string;
      countryCode?: string;
    };
    const query = payload.query?.trim() || '';
    if (!query) {
      return NextResponse.json({ locations: [] });
    }
    const countryCode = payload.countryCode?.trim() || undefined;

    const credentials = getGoogleAdsCredentials(auth.session);
    const service = new GoogleAdsService(credentials);
    const locations = await service.suggestGeoLocations(query, countryCode);
    return NextResponse.json({ locations });
  } catch (error: unknown) {
    console.error('Error searching geo locations:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to search geo locations') },
      { status: 500 }
    );
  }
}
