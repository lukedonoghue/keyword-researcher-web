import { NextResponse } from 'next/server';
import { ensureDevSession, getSession } from '@/lib/auth/session';

export async function GET() {
  const session = await ensureDevSession(await getSession());

  return NextResponse.json({
    authenticated: Boolean(session.refreshToken),
    hasCustomerId: Boolean(session.customerId),
    customerId: session.customerId || null,
    loginCustomerId: session.loginCustomerId || null,
    selectedAccountName: session.selectedAccountName || null,
  });
}
