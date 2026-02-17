import { NextRequest, NextResponse } from 'next/server';
import { generateCampaignCsv } from '@/lib/csv/generate';
import type { CampaignStructure } from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      campaigns?: CampaignStructure[];
      defaultUrl?: string;
    };
    const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
    const defaultUrl = payload.defaultUrl?.trim() || '';

    if (!campaigns.length) {
      return NextResponse.json({ error: 'Campaign data is required' }, { status: 400 });
    }

    const csv = generateCampaignCsv(campaigns, defaultUrl);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="campaign_structure.csv"',
      },
    });
  } catch (error: unknown) {
    console.error('Error generating CSV:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to generate CSV') },
      { status: 500 }
    );
  }
}
