import { NextResponse } from 'next/server';
import { ensureDevSession, getSession, type SessionData } from './session';
import type { IronSession } from 'iron-session';

export async function requireGoogleAuth(): Promise<
  { session: IronSession<SessionData>; error?: never } | { session?: never; error: NextResponse }
> {
  const session = await ensureDevSession(await getSession());

  if (!session.refreshToken) {
    return {
      error: NextResponse.json(
        { error: 'Not authenticated. Please sign in with Google.' },
        { status: 401 }
      ),
    };
  }

  return { session };
}

export function getGoogleAdsCredentials(session: SessionData) {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_ORIG_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_ORIG_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: session.refreshToken!,
    customerId: session.customerId!,
    loginCustomerId: session.loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  };
}
