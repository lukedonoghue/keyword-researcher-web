import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/auth/google-oauth';

export async function GET(request: NextRequest) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const url = getGoogleAuthUrl(appUrl);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('OAuth config error:', error);
    return NextResponse.json(
      { error: 'Google OAuth is misconfigured. Missing required environment variables.' },
      { status: 500 }
    );
  }
}
