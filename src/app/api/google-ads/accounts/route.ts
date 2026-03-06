import { NextResponse } from 'next/server';
import { requireGoogleAuth, getGoogleAdsCredentials } from '@/lib/auth/middleware';
import { GoogleAdsService } from '@/lib/services/google-ads';
import type { GoogleAdsAccountSelection } from '@/lib/types/google-ads';
import { getErrorMessage } from '@/lib/utils';

export async function GET() {
  const auth = await requireGoogleAuth();
  if (auth.error) return auth.error;

  try {
    const credentials = getGoogleAdsCredentials(auth.session);
    // For listing accounts, we need a manager account or the user's own ID
    // Try with a placeholder - the API will return accessible accounts
    const service = new GoogleAdsService({
      ...credentials,
      customerId: credentials.customerId || '0',
    });
    const hierarchy = await service.listAccountHierarchy();
    const selection: GoogleAdsAccountSelection = {
      customerId: auth.session.customerId || null,
      loginCustomerId: auth.session.loginCustomerId || null,
      descriptiveName: auth.session.selectedAccountName || null,
    };
    return NextResponse.json({ hierarchy, selection });
  } catch (error: unknown) {
    console.error('Error listing accounts:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to list accounts') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireGoogleAuth();
  if (auth.error) return auth.error;

  const { customerId, loginCustomerId, descriptiveName } = await request.json() as {
    customerId?: string;
    loginCustomerId?: string | null;
    descriptiveName?: string | null;
  };
  const normalizedCustomerId = String(customerId || '').replace(/\D/g, '');
  const normalizedLoginCustomerId = String(loginCustomerId || '').replace(/\D/g, '');
  if (!normalizedCustomerId) {
    return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
  }

  auth.session.customerId = normalizedCustomerId;
  auth.session.loginCustomerId = normalizedLoginCustomerId || undefined;
  auth.session.selectedAccountName = typeof descriptiveName === 'string' && descriptiveName.trim()
    ? descriptiveName.trim()
    : undefined;
  await auth.session.save();

  return NextResponse.json({
    success: true,
    customerId: normalizedCustomerId,
    loginCustomerId: normalizedLoginCustomerId || null,
  });
}
