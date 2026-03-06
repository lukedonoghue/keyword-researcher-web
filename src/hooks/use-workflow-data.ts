'use client';

import { useCallback } from 'react';
import { useWorkflow, type WizardStep } from '@/providers/workflow-provider';
import { useAuth } from '@/providers/auth-provider';
import type {
  CampaignStrategy,
  NegativeKeywordList,
  NegativeKeywordListName,
  NegativeKeywordSource,
  SeedKeyword,
  SuppressedKeyword,
  WebsiteMessagingProfile,
} from '@/lib/types/index';
import type { CampaignStructureV2 } from '@/lib/types/index';
import type { ServiceArea, GeoLocationSuggestion } from '@/lib/types/geo';
import { getErrorMessage } from '@/lib/utils';
import { downloadResponseFile } from '@/lib/utils';
import { mergeKeywordsWithGoogleAdsAuthority } from '@/lib/logic/keyword-merge';
import { enrichSeedKeywordsWithSignals, applyStrategyFilter } from '@/lib/logic/strategy-filter';
import { buildReviewNegativeKeywordLists, mergeReviewNegativeKeywordLists } from '@/lib/logic/negative-keywords';

type ErrorResponse = { error?: string };

type GeoOverride = {
  geoTargets: GeoLocationSuggestion[];
  geoTargetId: string;
  geoDisplayName: string;
};

type DiscoverServicesResponse = {
  businessName: string;
  businessDescription: string;
  businessType?: string;
  messagingProfile?: WebsiteMessagingProfile;
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
  competitors?: Array<{ name?: string; domain?: string; description?: string }>;
};

type ServiceCpcDebug = { service: string; debug: CpcDebugInfo };

type ResearchKeywordsResult = {
  keywords: SeedKeyword[];
  competitorNames: string[];
  cpcDebug: ServiceCpcDebug[];
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

type CpcDebugInfo = {
  total: number;
  distinctCpcs: number;
  distinctCpcs2dp?: number;
  distinctVolumes: number;
  cpcRange: [number, number];
  volumeRange: [number, number];
  samples: Array<{ i: number; text: string; cpc: number; vol: number }>;
};

type GoogleKeywordsResponse = {
  keywords?: GoogleKeywordApi[];
  _cpcDebug?: CpcDebugInfo;
};

type EnhancePhaseResponse = {
  keywords: SeedKeyword[];
  stats: {
    model: string;
    intentChanges: number;
    themesReassigned: number;
    negativesReclassified: number;
    qualityAdjustments: number;
    totalTokens: number;
  };
};

type EnhanceMergeResponse = {
  keywords: SeedKeyword[];
  suppressed: SuppressedKeyword[];
};

type EnhanceNegativesResponse = {
  items?: NegativeKeywordList['items'];
  stats?: {
    model?: string;
    totalTokens?: number;
  };
};

type NegativeKeywordApi = {
  campaign: string;
  adGroup: string;
  keyword: string;
  matchType: 'Phrase' | 'Exact';
  status: 'Negative';
  listName?: NegativeKeywordListName;
  source?: NegativeKeywordSource;
  reason?: string;
};

type BuildCampaignResponse = {
  campaigns: CampaignStructureV2[];
  negativeKeywords: NegativeKeywordApi[];
  negativeKeywordLists: NegativeKeywordList[];
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
  const { openrouterApiKey, openrouterModel } = useAuth();

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
        messagingProfile: data.messagingProfile ?? {
          features: [],
          benefits: [],
          differentiators: [],
          offers: [],
          callsToAction: [],
          proofPoints: [],
          tone: '',
        },
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

  const researchKeywords = useCallback(async (onPhase?: (phase: 'competitors' | 'google') => void, geoOverrides?: GeoOverride): Promise<ResearchKeywordsResult> => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      // Step 1: Research competitors via Perplexity — used as seed input only
      onPhase?.('competitors');
      let perplexitySeedTexts: string[] = [];
      let competitorNames: string[] = [];
      const competitorRes = await fetch('/api/research-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: state.targetUrl,
          services: state.selectedServices,
          location: geoOverrides?.geoDisplayName ?? state.geoDisplayName,
          openrouterApiKey,
        }),
      });
      if (competitorRes.ok) {
        const competitorData = await competitorRes.json() as ResearchCompetitorsResponse;
        const competitorKeywords = Array.isArray(competitorData.keywords) ? competitorData.keywords : [];
        perplexitySeedTexts = competitorKeywords
          .filter((kw): kw is Required<Pick<CompetitorKeywordApi, 'text'>> & CompetitorKeywordApi => typeof kw.text === 'string' && kw.text.trim().length > 0)
          .map((kw) => kw.text.trim());
        const competitors = Array.isArray(competitorData.competitors) ? competitorData.competitors : [];
        competitorNames = competitors
          .map((c) => c.name?.trim())
          .filter((n): n is string => !!n);
      }
      dispatch({ type: 'SET_COMPETITOR_NAMES', names: competitorNames });

      // Step 2: Generate keywords via Google Ads — one call per service
      // Perplexity keywords are used as additional seed input only (no AI-estimated data in results)
      onPhase?.('google');
      const perplexityByService = new Map<string, string[]>();
      for (const kwText of perplexitySeedTexts) {
        for (const svc of state.selectedServices) {
          const svcLower = svc.toLowerCase();
          if (kwText.toLowerCase().includes(svcLower) || svcLower.split(' ').some(w => kwText.toLowerCase().includes(w))) {
            const existing = perplexityByService.get(svc) ?? [];
            existing.push(kwText);
            perplexityByService.set(svc, existing);
            break;
          }
        }
      }

      // Find relevant discovery seed keywords for each service
      const discoveredSvcMap = new Map<string, string[]>();
      for (const svc of state.discoveredServices) {
        discoveredSvcMap.set(svc.name, svc.seedKeywords || []);
      }

      // Build location-specific seeds (replaces fabricated location variants)
      const cities = state.detectedServiceArea?.cities ?? [];
      const topCities = cities.slice(0, 3);

      const googleKeywords: SeedKeyword[] = [];
      const cpcDebugEntries: ServiceCpcDebug[] = [];
      for (const service of state.selectedServices) {
        const discoverySeeds = discoveredSvcMap.get(service) ?? [];
        const perplexityForService = (perplexityByService.get(service) ?? []).slice(0, 5);
        const manualSeeds = state.manualSeedKeywords;

        // Add context terms from discovery that are relevant to this service
        const contextSeeds = (state.contextTerms ?? []).filter(term => {
          const termLower = term.toLowerCase();
          const serviceLower = service.toLowerCase();
          return termLower.split(' ').some(w =>
            w.length > 4 && (serviceLower.includes(w) || termLower.includes(serviceLower.split(' ')[0] ?? ''))
          );
        });

        // Build seed list: manual seeds first, then service name, discovery seeds, perplexity seeds, context terms, location combos
        const seedTexts = [
          ...manualSeeds,
          service,
          ...discoverySeeds,
          ...perplexityForService,
          ...contextSeeds,
          ...topCities.map(city => `${service} ${city}`),
        ].filter(Boolean);

        const effectiveGeoTargets = geoOverrides?.geoTargets ?? state.geoTargets;
        const effectiveGeoTargetId = geoOverrides?.geoTargetId ?? state.geoTargetId;
        const geoTargetIds = effectiveGeoTargets.length > 0
          ? effectiveGeoTargets.map(t => t.id)
          : [effectiveGeoTargetId];

        try {
          const googleRes = await fetch('/api/google-ads/keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              seedKeywords: seedTexts.slice(0, 20),
              targetUrl: state.targetUrl,
              languageId: state.languageId,
              geoTargetIds,
            }),
          });
          if (googleRes.ok) {
            const googleData = await googleRes.json() as GoogleKeywordsResponse;
            const keywordRows = Array.isArray(googleData.keywords) ? googleData.keywords : [];
            const parsed = keywordRows
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

            if (googleData._cpcDebug) {
              cpcDebugEntries.push({ service, debug: googleData._cpcDebug });
            }

            googleKeywords.push(...parsed);
          }
        } catch (err) {
          console.warn(`[research] GKP call error for "${service}":`, err);
        }
      }

      // Only Google Ads data in the final results — no Perplexity or fabricated location variants
      const allKeywords = [...googleKeywords];
      dispatch({ type: 'SET_SEED_KEYWORDS', keywords: allKeywords });
      return { keywords: allKeywords, competitorNames, cpcDebug: cpcDebugEntries };
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: getErrorMessage(err, 'Failed to research keywords') });
      throw err;
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [dispatch, state, openrouterApiKey]);

  const enhanceKeywords = useCallback(async (
    selected: SeedKeyword[],
    suppressed: SuppressedKeyword[],
    onPhase?: (phase: 'intent' | 'themes' | 'quality' | 'merge') => void,
  ) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });

    // Split keywords into chunks to keep each HTTP request under browser timeout (~45s).
    // Each chunk is processed by the server which itself batches + parallelizes internally.
    const CHUNK_SIZE = 200;
    function chunkKeywords(kws: SeedKeyword[]): SeedKeyword[][] {
      const chunks: SeedKeyword[][] = [];
      for (let i = 0; i < kws.length; i += CHUNK_SIZE) {
        chunks.push(kws.slice(i, i + CHUNK_SIZE));
      }
      return chunks.length > 0 ? chunks : [[]];
    }

    async function runPhase(
      phase: string,
      keywords: SeedKeyword[],
      extra?: Record<string, unknown>,
    ): Promise<SeedKeyword[]> {
      const chunks = chunkKeywords(keywords);
      const results: SeedKeyword[] = [];
      for (const chunk of chunks) {
        const payload: Record<string, unknown> = {
          phase,
          keywords: chunk,
          services: state.selectedServices,
          targetDomain: state.targetDomain,
          openrouterApiKey,
          openrouterModel,
          ...extra,
        };
        const res = await fetch('/api/enhance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await getApiErrorMessage(res, `Failed at ${phase} phase`));
        const data = await res.json() as EnhancePhaseResponse;
        results.push(...data.keywords);
      }
      return results;
    }

    try {
      const allKeywords = [...selected, ...suppressed];

      // Phase 1: Intent classification
      onPhase?.('intent');
      const intentKeywords = await runPhase('intent', allKeywords);

      // Phase 2: Theme clustering
      onPhase?.('themes');
      const themesKeywords = await runPhase('themes', intentKeywords);

      // Phase 3: Quality scoring
      onPhase?.('quality');
      const qualityKeywords = await runPhase('quality', themesKeywords, { strategy: state.strategy });

      // Phase 4: Merge & filter (fast, no AI)
      onPhase?.('merge');
      const mergeRes = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'merge', keywords: qualityKeywords, strategy: state.strategy }),
      });
      if (!mergeRes.ok) throw new Error(await getApiErrorMessage(mergeRes, 'Failed to merge keywords'));
      const mergeData = await mergeRes.json() as EnhanceMergeResponse;

      dispatch({ type: 'SET_ENHANCED_KEYWORDS', keywords: mergeData.keywords, suppressed: mergeData.suppressed });

      const generatedReviewLists = buildReviewNegativeKeywordLists({
        suppressedKeywords: mergeData.suppressed,
        competitorNames: state.competitorNames,
        businessName: state.businessName,
        targetDomain: state.targetDomain,
        enableBrandList: state.strategy.brandCampaignMode === 'separate',
      });

      let reviewLists = generatedReviewLists;
      if (openrouterApiKey && mergeData.suppressed.length > 0) {
        try {
          const negativesRes = await fetch('/api/enhance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phase: 'negatives',
              keywords: mergeData.suppressed,
              services: state.selectedServices,
              targetDomain: state.targetDomain,
              businessName: state.businessName,
              businessDescription: state.businessDescription,
              openrouterApiKey,
              openrouterModel,
            }),
          });

          if (negativesRes.ok) {
            const negativesData = await negativesRes.json() as EnhanceNegativesResponse;
            const universalList = generatedReviewLists.find((list) => list.name === 'universal');
            if (universalList && Array.isArray(negativesData.items) && negativesData.items.length > 0) {
              reviewLists = mergeReviewNegativeKeywordLists(generatedReviewLists, [
                { ...universalList, items: negativesData.items },
              ]);
            }
          }
        } catch (error) {
          console.warn('[enhance] AI negative review failed:', error);
        }
      }

      dispatch({ type: 'SET_REVIEW_NEGATIVE_KEYWORD_LISTS', lists: reviewLists });
      return mergeData;
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: getErrorMessage(err, 'Failed to enhance keywords') });
      throw err;
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [dispatch, state, openrouterApiKey, openrouterModel]);

  const buildCampaign = useCallback(async (keywords: SeedKeyword[], overrides?: { allSeedKeywords?: SeedKeyword[]; competitorNames?: string[] }) => {
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
      // Include all seed keywords so the API can compute negative keywords
      const allKeywordMetrics = (overrides?.allSeedKeywords ?? state.seedKeywords).map((kw) => ({
        text: kw.text,
        volume: kw.volume,
        cpc: kw.cpc,
      }));
      const res = await fetch('/api/build-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services,
          keywords: keywordMetrics,
          allKeywords: allKeywordMetrics,
          businessName: state.businessName,
          businessDescription: state.businessDescription,
          messagingProfile: state.messagingProfile,
          contextTerms: state.contextTerms,
          competitorNames: overrides?.competitorNames ?? state.competitorNames,
          suppressedKeywords: (state.enhancedSuppressed.length > 0 ? state.enhancedSuppressed : state.suppressedKeywords).map((kw) => ({
            ...kw,
            suppressionReasons: kw.suppressionReasons,
          })),
          reviewNegativeKeywordLists: state.reviewNegativeKeywordLists,
          strategy: state.strategy as CampaignStrategy,
          options: {
            minAdGroupKeywords: state.strategy.minAdGroupKeywords,
            maxAdGroupKeywords: state.strategy.maxAdGroupKeywords,
          },
          manualNegativeKeywords: state.reviewNegativeKeywords,
          targetDomain: state.targetDomain,
          openrouterApiKey,
          openrouterModel,
        }),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to build campaign'));
      }
      const data = await res.json() as BuildCampaignResponse;
      dispatch({ type: 'SET_CAMPAIGNS', campaigns: data.campaigns });
      if (Array.isArray(data.negativeKeywords)) {
        dispatch({ type: 'SET_NEGATIVE_KEYWORDS', negativeKeywords: data.negativeKeywords });
      }
      if (Array.isArray(data.negativeKeywordLists)) {
        dispatch({ type: 'SET_NEGATIVE_KEYWORD_LISTS', lists: data.negativeKeywordLists });
      }
      return data.campaigns;
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: getErrorMessage(err, 'Failed to build campaign') });
      throw err;
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [dispatch, openrouterApiKey, openrouterModel, state]);

  const exportCsv = useCallback(async () => {
    const res = await fetch('/api/export-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaigns: state.campaigns,
        defaultUrl: state.targetUrl,
        negativeKeywords: state.negativeKeywords,
      }),
    });
    if (!res.ok) throw new Error('Failed to export CSV');
    await downloadResponseFile(res, 'campaign_structure.csv');
  }, [state.campaigns, state.targetUrl, state.negativeKeywords]);

  type RerunPhase = 'competitors' | 'google' | 'merging' | 'filtering' | 'enhancing' | 'building';

  const rerunPipeline = useCallback(async (
    onPhase?: (phase: RerunPhase) => void,
    geoOverrides?: GeoOverride,
  ) => {
    // Phase 1-2: Research keywords (Perplexity + Google Ads)
    const { keywords, competitorNames } = await researchKeywords(onPhase, geoOverrides);

    // Phase 3: Merge
    onPhase?.('merging');
    const merged = mergeKeywordsWithGoogleAdsAuthority([keywords]);
    dispatch({ type: 'SET_SEED_KEYWORDS', keywords: merged });

    // Phase 4: Filter
    onPhase?.('filtering');
    const enriched = enrichSeedKeywordsWithSignals(merged);
    const { selected, suppressed } = applyStrategyFilter(enriched, state.strategy, competitorNames);
    dispatch({ type: 'SET_FILTERED_KEYWORDS', selected, suppressed });

    // Phase 5: Enhance (skip if no OpenRouter API key)
    let keywordsForBuild = selected;
    if (openrouterApiKey) {
      onPhase?.('enhancing');
      const enhanced = await enhanceKeywords(selected, suppressed);
      if (enhanced && enhanced.keywords.length > 0) {
        keywordsForBuild = enhanced.keywords;
      }
    }

    // Phase 6: Build campaign — pass fresh keywords + competitor names to avoid stale state
    onPhase?.('building');
    await buildCampaign(keywordsForBuild, { allSeedKeywords: merged, competitorNames });
  }, [researchKeywords, enhanceKeywords, buildCampaign, dispatch, state.strategy, openrouterApiKey]);

  return {
    ...state,
    goToStep,
    discoverServices,
    researchKeywords,
    enhanceKeywords,
    buildCampaign,
    exportCsv,
    rerunPipeline,
    dispatch,
  };
}
