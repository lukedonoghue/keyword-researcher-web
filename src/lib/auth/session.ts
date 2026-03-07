import { getIronSession, type SessionOptions } from 'iron-session';
import type { IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';

export type SessionData = {
  accessToken?: string;
  refreshToken?: string;
  customerId?: string;
  loginCustomerId?: string;
  selectedAccountName?: string;
  expiresAt?: number;
};

function getFallbackSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  const warningKey = '__kw_missing_session_secret_warned__';
  const secretKey = '__kw_fallback_session_secret__';
  const globals = globalThis as typeof globalThis & {
    [warningKey]?: boolean;
    [secretKey]?: string;
  };

  if (!globals[secretKey]) {
    const seed = [
      process.env.GOOGLE_ADS_ORIG_CLIENT_SECRET,
      process.env.GOOGLE_ADS_CLIENT_SECRET,
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      process.cwd(),
      'keyword-researcher-session-fallback',
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join('|');

    globals[secretKey] = createHash('sha256')
      .update(seed || 'keyword-researcher-session-fallback')
      .digest('hex');
  }

  if (!globals[warningKey]) {
    globals[warningKey] = true;
    console.warn('SESSION_SECRET is missing or shorter than 32 chars. Using a derived fallback secret. Set SESSION_SECRET to avoid auth inconsistencies.');
  }

  return globals[secretKey];
}

const sessionOptions: SessionOptions = {
  password: getFallbackSessionSecret(),
  cookieName: 'kw_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function ensureDevSession(session: IronSession<SessionData>) {
  if (process.env.NODE_ENV === 'production' || session.refreshToken) {
    return session;
  }

  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return session;
  }

  session.refreshToken = refreshToken;
  if (!session.expiresAt) {
    session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  }
  await session.save();

  return session;
}
