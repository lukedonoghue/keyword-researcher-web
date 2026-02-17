import { NextRequest, NextResponse } from 'next/server';
import { PerplexityService } from '@/lib/services/perplexity';
import { enhanceWithAI } from '@/lib/services/geo-detector';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      targetUrl?: string;
      openrouterApiKey?: string;
    };
    const targetUrl = payload.targetUrl?.trim() || '';
    const openrouterApiKey = payload.openrouterApiKey?.trim() || '';

    if (!targetUrl) {
      return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });
    }
    if (!openrouterApiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is required' }, { status: 400 });
    }

    const service = new PerplexityService(openrouterApiKey);
    const result = await service.discoverServices(targetUrl);

    // Enhance geo detection with AI-derived service area
    const geoResult = enhanceWithAI(result.serviceArea);
    const hasServiceAreaData =
      Boolean(result.serviceArea.country) ||
      result.serviceArea.states.length > 0 ||
      result.serviceArea.cities.length > 0;
    const hasDetectedCountry = Boolean(result.serviceArea.country);

    return NextResponse.json({
      businessName: result.businessName,
      businessDescription: result.businessDescription,
      businessType: result.businessType,
      services: result.services,
      serviceArea: hasServiceAreaData ? result.serviceArea : null,
      contextTerms: result.contextTerms,
      detectedCountryCode: hasDetectedCountry ? geoResult.countryCode : null,
      geoConfidence: geoResult.confidence,
      usage: result.usage,
    });
  } catch (error: unknown) {
    console.error('Error discovering services:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to discover services') },
      { status: 500 }
    );
  }
}
