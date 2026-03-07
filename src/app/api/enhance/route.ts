import { NextRequest, NextResponse } from 'next/server';
import { runIntentPhase, runThemesPhase, runQualityPhase, runNegativeKeywordPhase, mergeAndFilter } from '@/lib/logic/ai-enhancer';
import type { CampaignStrategy, SeedKeyword, SuppressedKeyword } from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

const PHASE_TIMEOUT_MS = {
  intent: 18000,
  themes: 18000,
  quality: 18000,
  merge: 12000,
  negatives: 18000,
} as const;

async function withPhaseTimeout<T>(phase: keyof typeof PHASE_TIMEOUT_MS, run: () => Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${phase} phase exceeded ${PHASE_TIMEOUT_MS[phase] / 1000}s`));
        }, PHASE_TIMEOUT_MS[phase]);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      phase: 'intent' | 'themes' | 'quality' | 'merge' | 'negatives';
      keywords?: SeedKeyword[];
      services?: string[];
      targetDomain?: string;
      businessName?: string;
      businessDescription?: string;
      strategy?: CampaignStrategy | null;
      openrouterApiKey?: string;
      openrouterModel?: string;
    };

    const phase = payload.phase;
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    const services = Array.isArray(payload.services) ? payload.services : [];
    const targetDomain = payload.targetDomain?.trim() || '';
    const businessName = payload.businessName?.trim() || '';
    const businessDescription = payload.businessDescription?.trim() || '';
    const strategy = payload.strategy ?? null;
    const openrouterApiKey = payload.openrouterApiKey?.trim() || '';
    const openrouterModel = payload.openrouterModel?.trim() || '';

    if (phase !== 'merge' && !openrouterApiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is required' }, { status: 400 });
    }

    switch (phase) {
      case 'intent': {
        const result = await withPhaseTimeout('intent', () => (
          runIntentPhase(keywords, services, targetDomain, openrouterApiKey, openrouterModel)
        ));
        return NextResponse.json(result);
      }
      case 'themes': {
        const result = await withPhaseTimeout('themes', () => (
          runThemesPhase(keywords, services, openrouterApiKey, openrouterModel)
        ));
        return NextResponse.json(result);
      }
      case 'quality': {
        const result = await withPhaseTimeout('quality', () => (
          runQualityPhase(keywords, services, targetDomain, strategy, openrouterApiKey, openrouterModel)
        ));
        return NextResponse.json(result);
      }
      case 'merge': {
        const { selected, suppressed } = await withPhaseTimeout('merge', async () => (
          mergeAndFilter(keywords, strategy)
        ));
        return NextResponse.json({ keywords: selected, suppressed });
      }
      case 'negatives': {
        const result = await withPhaseTimeout('negatives', () => (
          runNegativeKeywordPhase(
            keywords as SuppressedKeyword[],
            services,
            targetDomain,
            businessName,
            businessDescription,
            openrouterApiKey,
            openrouterModel,
          )
        ));
        return NextResponse.json(result);
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
