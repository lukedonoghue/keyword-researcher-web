'use client';

import { useCallback } from 'react';
import { useWorkflow, type WizardStep } from '@/providers/workflow-provider';
import { useAuth } from '@/providers/auth-provider';
import type { CampaignStructure, SeedKeyword, SuppressedKeyword } from '@/lib/types/index';
import type { ServiceArea } from '@/lib/types/geo';
import { getErrorMessage } from '@/lib/utils';

type ErrorResponse = { error?: string };

type DiscoverServicesResponse = {
  businessName: string;
  businessDescription: string;
  businessType?: string;
  services?: Array<{ name: string; description: string; seedKeywords: string[]; landingPage?: string }>;
  serviceArea?: ServiceArea | null;
  detectedCountryCode?: string | null;
  contextTerms?: string[];
};

type CompetitorKeywordApi = {
  text?: string;
  estimatedVolume?: number;
  estimatedCpc?: number;
};

type ResearchCompetitorsResponse = {
  keywords?: CompetitorKeywordApi[];
};

type GoogleKeywordApi = {
  text?: string;
  volume?: number;
  cpc?: number;
  cpcLow?: number;
  cpcHigh?: number;
  competition?: string;
  competitionIndex?: number;
};

type GoogleKeywordsResponse = {
  keywords?: GoogleKeywordApi[];
};

type EnhanceKeywordsResponse = {
  keywords: SeedKeyword[];
  suppressed: SuppressedKeyword[];
};

type BuildCampaignResponse = {
  campaigns: CampaignStructure[];
};

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as ErrorResponse;
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function useWorkflowData() {
  const { state, dispatch } = useWorkflow();
  const { openrouterApiKey } = useAuth();

  const goToStep = useCallback((step: WizardStep) => {
    dispatch({ type: 'SET_STEP', step });
  }, [dispatch]);

  const discoverServices = useCallback(async (targetUrl: string) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const res = await fetch('/api/discover-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, openrouterApiKey }),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to discover services'));
      }
      const data = await res.json() as DiscoverServicesResponse;
      dispatch({
        type: 'SET_DISCOVERY',
        businessName: data.businessName,
        businessDescription: data.businessDescription,
        businessType: data.businessType || '',
        services: Array.isArray(data.services) ? data.services : [],
        serviceArea: data.serviceArea || null,
        detectedCountryCode: data.detectedCountryCode || null,
        contextTerms: Array.isArray(data.contextTerms) ? data.contextTerms : [],
      });
      return data;
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: getErrorMessage(err, 'Failed to discover services') });
      throw err;
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [dispatch, openrouterApiKey]);

  const researchKeywords = useCallback(async (onPhase?: (phase: 'competitors' | 'google') => void) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      // Step 1: Research competitors via Perplexity
      onPhase?.('competitors');
      const competitorRes = await fetch('/api/research-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: state.targetUrl,
          services: state.selectedServices,
          location: state.geoDisplayName,
          openrouterApiKey,
        }),
      });
      let perplexityKeywords: SeedKeyword[] = [];
      if (competitorRes.ok) {
        const competitorData = await competitorRes.json() as ResearchCompetitorsResponse;
        const competitorKeywords = Array.isArray(competitorData.keywords) ? competitorData.keywords : [];
        perplexityKeywords = competitorKeywords
          .filter((kw): kw is Required<Pick<CompetitorKeywordApi, 'text'>> & CompetitorKeywordApi => typeof kw.text === 'string' && kw.text.trim().length > 0)
          .map((kw) => ({
            text: kw.text.trim(),
            volume: typeof kw.estimatedVolume === 'number' ? kw.estimatedVolume : 0,
            cpc: typeof kw.estimatedCpc === 'number' ? kw.estimatedCpc : 0,
            source: 'perplexity' as const,
          }));
      }

      // Step 2: Generate keywords via Google Ads
      onPhase?.('google');
      const seedTexts = [
        ...state.selectedServices,
        ...perplexityKeywords.slice(0, 10).map((kw: SeedKeyword) => kw.text),
      ];
      const googleRes = await fetch('/api/google-ads/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedKeywords: seedTexts,
          targetUrl: state.targetUrl,
          languageId: state.languageId,
          geoTargetIds: [state.geoTargetId],
        }),
      });
      let googleKeywords: SeedKeyword[] = [];
      if (googleRes.ok) {
        const googleData = await googleRes.json() as GoogleKeywordsResponse;
        const keywordRows = Array.isArray(googleData.keywords) ? googleData.keywords : [];
        googleKeywords = keywordRows
          .filter((kw): kw is Required<Pick<GoogleKeywordApi, 'text'>> & GoogleKeywordApi => typeof kw.text === 'string' && kw.text.trim().length > 0)
          .map((kw) => ({
            text: kw.text.trim(),
            volume: typeof kw.volume === 'number' ? kw.volume : 0,
            cpc: typeof kw.cpc === 'number' ? kw.cpc : 0,
            cpcLow: typeof kw.cpcLow === 'number' ? kw.cpcLow : 0,
            cpcHigh: typeof kw.cpcHigh === 'number' ? kw.cpcHigh : 0,
            competition: typeof kw.competition === 'string' ? kw.competition : '',
            competitionIndex: typeof kw.competitionIndex === 'number' ? kw.competitionIndex : 0,
            source: 'google_ads' as const,
          }));
      }

      const allKeywords = [...perplexityKeywords, ...googleKeywords];
      dispatch({ type: 'SET_SEED_KEYWORDS', keywords: allKeywords });
      return allKeywords;
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: getErrorMessage(err, 'Failed to research keywords') });
      throw err;
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [dispatch, state, openrouterApiKey]);

  const enhanceKeywords = useCallback(async (selected: SeedKeyword[], suppressed: SuppressedKeyword[]) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected,
          suppressed,
          services: state.selectedServices,
          targetDomain: state.targetDomain,
          strategy: state.strategy,
          openrouterApiKey,
        }),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to enhance keywords'));
      }
      const data = await res.json() as EnhanceKeywordsResponse;
      dispatch({ type: 'SET_ENHANCED_KEYWORDS', keywords: data.keywords, suppressed: data.suppressed });
      return data;
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: getErrorMessage(err, 'Failed to enhance keywords') });
      throw err;
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [dispatch, state, openrouterApiKey]);

  const buildCampaign = useCallback(async (keywords: SeedKeyword[]) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const services = state.selectedServiceContexts.length > 0
        ? state.selectedServiceContexts
        : state.selectedServices.map((s) => ({ name: s, landingPage: state.targetUrl }));
      const keywordMetrics = keywords.map((kw) => ({
        text: kw.text,
        volume: kw.volume,
        cpc: kw.cpc,
        cpcLow: kw.cpcLow || 0,
        cpcHigh: kw.cpcHigh || 0,
        competitionIndex: kw.competitionIndex || 0,
        themes: kw.themes,
        qualityScore: kw.qualityScore,
        qualityRating: kw.qualityRating,
        intent: kw.intent,
      }));
      const res = await fetch('/api/build-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services,
          keywords: keywordMetrics,
          options: {
            minAdGroupKeywords: state.strategy.minAdGroupKeywords,
            maxAdGroupKeywords: state.strategy.maxAdGroupKeywords,
          },
        }),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to build campaign'));
      }
      const data = await res.json() as BuildCampaignResponse;
      dispatch({ type: 'SET_CAMPAIGNS', campaigns: data.campaigns });
      return data.campaigns;
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: getErrorMessage(err, 'Failed to build campaign') });
      throw err;
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [dispatch, state]);

  const exportCsv = useCallback(async () => {
    const res = await fetch('/api/export-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaigns: state.campaigns, defaultUrl: state.targetUrl }),
    });
    if (!res.ok) throw new Error('Failed to export CSV');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign_structure.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [state.campaigns, state.targetUrl]);

  return {
    ...state,
    goToStep,
    discoverServices,
    researchKeywords,
    enhanceKeywords,
    buildCampaign,
    exportCsv,
    dispatch,
  };
}
