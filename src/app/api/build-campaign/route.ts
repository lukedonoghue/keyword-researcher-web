import { NextRequest, NextResponse } from 'next/server';
import { CampaignBuilder } from '@/lib/logic/campaign-builder';
import type { ServiceContext } from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

type CampaignKeywordMetric = {
  text: string;
  volume: number;
  cpc: number;
  cpcLow?: number;
  cpcHigh?: number;
  competition?: string;
  competitionIndex?: number;
  themes?: string[];
  qualityScore?: number;
  qualityRating?: string;
  intent?: 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unknown';
};

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      services?: Array<ServiceContext | string>;
      keywords?: CampaignKeywordMetric[];
      options?: { minAdGroupKeywords?: number; maxAdGroupKeywords?: number };
    };
    const services = Array.isArray(payload.services) ? payload.services : [];
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    const options = payload.options ?? {};

    if (!services.length) {
      return NextResponse.json({ error: 'Services are required' }, { status: 400 });
    }
    if (!keywords.length) {
      return NextResponse.json({ error: 'Keywords are required' }, { status: 400 });
    }

    const campaigns = CampaignBuilder.build(services, keywords, options);
    return NextResponse.json({ campaigns });
  } catch (error: unknown) {
    console.error('Error building campaign:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to build campaign') },
      { status: 500 }
    );
  }
}
