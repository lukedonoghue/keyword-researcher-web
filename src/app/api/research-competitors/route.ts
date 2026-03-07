import { NextRequest, NextResponse } from 'next/server';
import { PerplexityService } from '@/lib/services/perplexity';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      targetUrl?: string;
      targetDomain?: string;
      businessName?: string;
      services?: string[];
      location?: string;
      openrouterApiKey?: string;
    };
    const targetUrl = payload.targetUrl?.trim() || '';
    const targetDomain = payload.targetDomain?.trim() || '';
    const businessName = payload.businessName?.trim() || '';
    const services = Array.isArray(payload.services) ? payload.services : [];
    const location = payload.location?.trim();
    const openrouterApiKey = payload.openrouterApiKey?.trim() || '';

    if (!targetUrl) {
      return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });
    }
    if (!openrouterApiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is required' }, { status: 400 });
    }

    const service = new PerplexityService(openrouterApiKey);
    const result = await service.researchCompetitors(targetUrl, services, location, businessName, targetDomain);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error researching competitors:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to research competitors') },
      { status: 500 }
    );
  }
}
