import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/auth/google-oauth';
import { getSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: 'no refresh token configured' }, { status: 500 });
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    const session = await getSession();
    session.accessToken = tokens.access_token;
    session.refreshToken = refreshToken;
    session.customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || '';
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    await session.save();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    return NextResponse.redirect(`${appUrl}?auth=success`);
  } catch (err) {
    console.error('Dev login error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
