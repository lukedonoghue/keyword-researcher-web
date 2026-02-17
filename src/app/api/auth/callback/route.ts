import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/auth/google-oauth';
import { getSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${appUrl}?auth_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}?auth_error=no_code`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, appUrl);
    const session = await getSession();
    session.accessToken = tokens.access_token;
    if (tokens.refresh_token) {
      session.refreshToken = tokens.refresh_token;
    } else if (!session.refreshToken) {
      throw new Error('No refresh token returned from Google OAuth');
    }
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    await session.save();

    return NextResponse.redirect(`${appUrl}?auth=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      `${appUrl}?auth_error=token_exchange_failed`
    );
  }
}
