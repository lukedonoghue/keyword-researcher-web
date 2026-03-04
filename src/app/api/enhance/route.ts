import { NextRequest, NextResponse } from 'next/server';
import { runIntentPhase, runThemesPhase, runQualityPhase, mergeAndFilter } from '@/lib/logic/ai-enhancer';
import type { CampaignStrategy, SeedKeyword } from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      phase: 'intent' | 'themes' | 'quality' | 'merge';
      keywords?: SeedKeyword[];
      services?: string[];
      targetDomain?: string;
      strategy?: CampaignStrategy | null;
      openrouterApiKey?: string;
    };

    const phase = payload.phase;
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    const services = Array.isArray(payload.services) ? payload.services : [];
    const targetDomain = payload.targetDomain?.trim() || '';
    const strategy = payload.strategy ?? null;
    const openrouterApiKey = payload.openrouterApiKey?.trim() || '';

    if (phase !== 'merge' && !openrouterApiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is required' }, { status: 400 });
    }

    switch (phase) {
      case 'intent': {
        const result = await runIntentPhase(keywords, services, targetDomain, openrouterApiKey);
        return NextResponse.json(result);
      }
      case 'themes': {
        const result = await runThemesPhase(keywords, services, openrouterApiKey);
        return NextResponse.json(result);
      }
      case 'quality': {
        const result = await runQualityPhase(keywords, services, targetDomain, strategy, openrouterApiKey);
        return NextResponse.json(result);
      }
      case 'merge': {
        const { selected, suppressed } = mergeAndFilter(keywords, strategy);
        return NextResponse.json({ keywords: selected, suppressed });
      }
      default:
        return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Error enhancing keywords:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to enhance keywords') },
      { status: 500 }
    );
  }
}
