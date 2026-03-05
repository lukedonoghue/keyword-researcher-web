import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';

export type SessionData = {
  accessToken?: string;
  refreshToken?: string;
  customerId?: string;
  expiresAt?: number;
};

const sessionOptions: SessionOptions = {
  password: (() => {
    const secret = process.env.SESSION_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (process.env.NODE_ENV === 'production') {
      const warningKey = '__kw_missing_session_secret_warned__';
      const globals = globalThis as typeof globalThis & { [warningKey]?: boolean };
      if (!globals[warningKey]) {
        globals[warningKey] = true;
        console.warn('SESSION_SECRET is missing or shorter than 32 chars. Using an ephemeral random secret.');
      }
    }
    return randomBytes(32).toString('hex');
  })(),
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
