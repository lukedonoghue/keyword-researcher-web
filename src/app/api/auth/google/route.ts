import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/auth/google-oauth';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const url = getGoogleAuthUrl(appUrl);
    
    // Debug logging to file
    const logPath = path.join(process.cwd(), 'auth-debug.log');
    const logData = `${new Date().toISOString()} - AppURL: ${appUrl} - RedirectURI: ${new URL(url).searchParams.get('redirect_uri')}\n`;
    fs.appendFileSync(logPath, logData);

    return NextResponse.redirect(url);
  } catch (error) {
    console.error('OAuth config error:', error);
    return NextResponse.json(
      { error: 'Google OAuth is misconfigured. Missing required environment variables.' },
      { status: 500 }
    );
  }
}
