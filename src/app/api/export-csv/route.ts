import { NextRequest, NextResponse } from 'next/server';
import { generateCampaignCsv, type CsvFormat } from '@/lib/csv/generate';
import type { CampaignStructureV2, NegativeKeyword } from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      campaigns?: CampaignStructureV2[];
      defaultUrl?: string;
      format?: CsvFormat;
      negativeKeywords?: NegativeKeyword[];
    };
    const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
    const defaultUrl = payload.defaultUrl?.trim() || '';
    const format = payload.format === 'analysis' ? 'analysis' : 'google-ads-editor';
    const negativeKeywords = Array.isArray(payload.negativeKeywords) ? payload.negativeKeywords : [];

    if (!campaigns.length) {
      return NextResponse.json({ error: 'Campaign data is required' }, { status: 400 });
    }

    const csv = generateCampaignCsv(campaigns, defaultUrl, format, negativeKeywords);
    const filename = format === 'analysis' ? 'campaign_analysis.csv' : 'google_ads_editor_import.csv';

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
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
