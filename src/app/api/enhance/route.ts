import { NextRequest, NextResponse } from 'next/server';
import { enhanceWithAi } from '@/lib/logic/ai-enhancer';
import type { CampaignStrategy, SeedKeyword, SuppressedKeyword } from '@/lib/types/index';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      selected?: SeedKeyword[];
      suppressed?: SuppressedKeyword[];
      services?: string[];
      targetDomain?: string;
      strategy?: CampaignStrategy | null;
      openrouterApiKey?: string;
    };
    const selected = Array.isArray(payload.selected) ? payload.selected : [];
    const suppressed = Array.isArray(payload.suppressed) ? payload.suppressed : [];
    const services = Array.isArray(payload.services) ? payload.services : [];
    const targetDomain = payload.targetDomain?.trim() || '';
    const strategy = payload.strategy ?? null;
    const openrouterApiKey = payload.openrouterApiKey?.trim() || '';

    if (!openrouterApiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is required' }, { status: 400 });
    }

    const result = await enhanceWithAi(
      selected,
      suppressed,
      services,
      targetDomain,
      strategy,
      openrouterApiKey,
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error enhancing keywords:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to enhance keywords') },
      { status: 500 }
    );
  }
}
