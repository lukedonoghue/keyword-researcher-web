import { NextResponse } from 'next/server';
import { requireGoogleAuth } from '@/lib/auth/middleware';
import { GoogleAdsService } from '@/lib/services/google-ads';
import type { GoogleAdsAccountSelection } from '@/lib/types/google-ads';
import type { GoogleAdsAccountNode } from '@/lib/types/google-ads';
import { getErrorMessage } from '@/lib/utils';

function findNodeById(nodes: GoogleAdsAccountNode[], customerId: string): GoogleAdsAccountNode | null {
  for (const node of nodes) {
    if (node.customerId === customerId) return node;
    const nested = findNodeById(node.children, customerId);
    if (nested) return nested;
  }
  return null;
}

function isSelectableLeafAccount(node: GoogleAdsAccountNode | null): node is GoogleAdsAccountNode {
  if (!node || node.isManager) return false;
  if (!node.status) return true;
  return node.status === '2' || node.status.toUpperCase() === 'ENABLED';
}

export async function GET() {
  const auth = await requireGoogleAuth();
  if (auth.error) return auth.error;

  try {
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const clientId = process.env.GOOGLE_ADS_ORIG_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_ORIG_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET;
    if (!developerToken || !clientId || !clientSecret || !auth.session.refreshToken) {
      throw new Error('Google Ads credentials are not configured');
    }

    const service = new GoogleAdsService({
      developerToken,
      clientId,
      clientSecret,
      refreshToken: auth.session.refreshToken,
      customerId: auth.session.customerId || '0',
      loginCustomerId: auth.session.loginCustomerId || undefined,
    });
    const hierarchy = await service.listAccountHierarchy();
    const selectedNode = auth.session.customerId ? findNodeById(hierarchy, auth.session.customerId) : null;
    const selectionIsValid = isSelectableLeafAccount(selectedNode);

    if (auth.session.customerId && !selectionIsValid) {
      auth.session.customerId = undefined;
      auth.session.loginCustomerId = undefined;
      auth.session.selectedAccountName = undefined;
      await auth.session.save();
    }

    const selection: GoogleAdsAccountSelection = {
      customerId: selectionIsValid ? auth.session.customerId || null : null,
      loginCustomerId: selectionIsValid ? auth.session.loginCustomerId || null : null,
      descriptiveName: selectionIsValid ? auth.session.selectedAccountName || null : null,
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

  try {
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const clientId = process.env.GOOGLE_ADS_ORIG_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_ORIG_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET;
    if (!developerToken || !clientId || !clientSecret || !auth.session.refreshToken) {
      throw new Error('Google Ads credentials are not configured');
    }

    const service = new GoogleAdsService({
      developerToken,
      clientId,
      clientSecret,
      refreshToken: auth.session.refreshToken,
      customerId: normalizedLoginCustomerId || normalizedCustomerId,
      loginCustomerId: normalizedLoginCustomerId || undefined,
    });
    const hierarchy = await service.listAccountHierarchy();
    const selectedNode = findNodeById(hierarchy, normalizedCustomerId);

    if (!isSelectableLeafAccount(selectedNode)) {
      return NextResponse.json(
        { error: 'Select an active direct Google Ads account. Manager or deactivated accounts cannot be used for keyword research or import.' },
        { status: 400 },
      );
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to validate selected Google Ads account') },
      { status: 500 },
    );
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
