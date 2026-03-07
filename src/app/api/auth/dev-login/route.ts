import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken || secret !== devToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: 'no refresh token configured' }, { status: 500 });
  }

  try {
    // Use the original OAuth client that issued the refresh token
    const origClientId = process.env.GOOGLE_ADS_ORIG_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID!;
    const origClientSecret = process.env.GOOGLE_ADS_ORIG_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET!;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: origClientId,
        client_secret: origClientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Token refresh failed: ${err}`);
    }

    const tokens = await response.json();
    const session = await getSession();
    session.accessToken = tokens.access_token;
    session.refreshToken = refreshToken;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    await session.save();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    return NextResponse.redirect(`${appUrl}?auth=success`);
  } catch (err) {
    console.error('Dev login error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
