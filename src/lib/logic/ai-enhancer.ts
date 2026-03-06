import { OpenRouterService } from '../services/openrouter';
import type { SeedKeyword, SuppressedKeyword, KeywordIntent, CampaignStrategy } from '../types/index';
import { getKeywordQualityScore } from './quality-score';
import { dedupeSeedKeywords } from './keyword-merge';

const BATCH_SIZE = 80;
const MAX_CONCURRENT_BATCHES = 4;
const DEFAULT_ENHANCE_MODEL = process.env.OPENROUTER_ENHANCE_MODEL?.trim() || 'google/gemini-2.5-pro';

function createEnhanceClient(apiKey: string): OpenRouterService {
  return new OpenRouterService(apiKey, DEFAULT_ENHANCE_MODEL);
}

export type AiEnhanceProgress = {
  phase: 'intent' | 'themes' | 'quality' | 'merging' | 'done';
  status: 'starting' | 'running' | 'done' | 'error';
  message?: string;
};

export type AiEnhanceResult = {
  keywords: SeedKeyword[];
  suppressed: SuppressedKeyword[];
  stats: {
    model: string;
    intentChanges: number;
    themesReassigned: number;
    negativesReclassified: number;
    qualityAdjustments: number;
    totalTokens: number;
  };
};

export type PhaseResult = {
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

type IntentPassResult = { keywords: Array<{ text: string; intent: KeywordIntent; confidence: number; reason: string; isNegative: boolean }> };
type ThemeCluster = { clusterName: string; service: string; keywords: string[] };
type ThemePassResult = { clusters: ThemeCluster[] };
type QualityAdjustment = { text: string; adjustment: number; reason: string };
type QualityPassResult = { adjustments: QualityAdjustment[] };

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function runBatchesConcurrently<TBatch, TResult>(
  batches: TBatch[][],
  processBatch: (batch: TBatch[]) => Promise<TResult | null>,
): Promise<TResult[]> {
  const results: TResult[] = [];
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const concurrent = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
    const batchResults = await Promise.all(concurrent.map(processBatch));
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }
  return results;
}

function buildKeywordMap(keywords: SeedKeyword[]): Map<string, SeedKeyword> {
  const map = new Map<string, SeedKeyword>();
  for (const kw of keywords) {
    map.set(kw.text.toLowerCase(), { ...kw });
  }
  return map;
}

function extractKeywords(map: Map<string, SeedKeyword>): SeedKeyword[] {
  return Array.from(map.values());
}

// --- Phase 1: Intent Classification ---
export async function runIntentPhase(
  keywords: SeedKeyword[],
  services: string[],
  targetDomain: string,
  apiKey: string,
): Promise<PhaseResult> {
  const client = createEnhanceClient(apiKey);
  if (!client.isAvailable()) {
    return { keywords, stats: { model: '', intentChanges: 0, themesReassigned: 0, negativesReclassified: 0, qualityAdjustments: 0, totalTokens: 0 } };
  }

  const model = client.getModel();
  let totalTokens = 0;
  let intentChanges = 0;
  let negativesReclassified = 0;
  const keywordMap = buildKeywordMap(keywords);

  const intentItems = keywords.map((kw) => ({
    text: kw.text, currentIntent: kw.intent || 'unknown', isNegative: kw.isNegativeCandidate || false,
  }));

  await runBatchesConcurrently(chunkArray(intentItems, BATCH_SIZE), async (batch) => {
    try {
      const { data, usage } = await client.jsonPrompt<IntentPassResult>(
        `You are a PPC keyword intent classifier for a ${targetDomain} business offering these services: ${services.join(', ')}.
Classify each keyword's search intent and detect negative/irrelevant keywords.
Return JSON: { "keywords": [{ "text": string, "intent": "transactional"|"commercial"|"informational"|"navigational", "confidence": 0-1, "reason": string, "isNegative": boolean }] }`,
        JSON.stringify(batch),
      );
      totalTokens += usage.totalTokens;
      for (const item of data.keywords) {
        const key = item.text.toLowerCase();
        const kw = keywordMap.get(key);
        if (!kw) continue;
        if (kw.intent !== item.intent) intentChanges++;
        if ((kw.isNegativeCandidate || false) !== item.isNegative) negativesReclassified++;
        kw.intent = item.intent;
        kw.intentConfidence = item.confidence;
        kw.intentReason = item.reason;
        kw.isNegativeCandidate = item.isNegative;
        kw.aiEnhanced = true;
        kw.aiIntentOverride = item.intent;
        kw.aiConfidence = item.confidence;
        kw.aiReason = item.reason;
      }
      return data;
    } catch { return null; }
  });

  return {
    keywords: extractKeywords(keywordMap),
    stats: { model, intentChanges, themesReassigned: 0, negativesReclassified, qualityAdjustments: 0, totalTokens },
  };
}

// --- Phase 2: Theme Clustering ---
export async function runThemesPhase(
  keywords: SeedKeyword[],
  services: string[],
  apiKey: string,
): Promise<PhaseResult> {
  const client = createEnhanceClient(apiKey);
  if (!client.isAvailable()) {
    return { keywords, stats: { model: '', intentChanges: 0, themesReassigned: 0, negativesReclassified: 0, qualityAdjustments: 0, totalTokens: 0 } };
  }

  const model = client.getModel();
  let totalTokens = 0;
  let themesReassigned = 0;
  const keywordMap = buildKeywordMap(keywords);
  const keySet = new Set(keywords.map((kw) => kw.text.toLowerCase()));
  const themeItems = keywords.map((kw) => ({ text: kw.text, currentThemes: kw.themes || ['General'] }));

  await runBatchesConcurrently(chunkArray(themeItems, BATCH_SIZE), async (batch) => {
    try {
      const { data, usage } = await client.jsonPrompt<ThemePassResult>(
        `You are a PPC keyword theme organizer for a business offering: ${services.join(', ')}.
Group keywords into semantic clusters of 3-15 keywords each. Match each cluster to the most relevant service.
Return JSON: { "clusters": [{ "clusterName": string, "service": string, "keywords": string[] }] }
Every input keyword must appear in exactly one cluster.`,
        JSON.stringify(batch.map((item) => item.text)),
      );
      totalTokens += usage.totalTokens;
      for (const cluster of data.clusters) {
        for (const kwText of cluster.keywords) {
          const key = kwText.toLowerCase();
          if (!keySet.has(key)) continue;
          const kw = keywordMap.get(key);
          if (!kw) continue;
          const oldThemes = (kw.themes || []).join(',');
          kw.themes = [cluster.clusterName, cluster.service].filter(Boolean).slice(0, 3);
          if (oldThemes !== kw.themes.join(',')) themesReassigned++;
        }
      }
      return data;
    } catch { return null; }
  });

  return {
    keywords: extractKeywords(keywordMap),
    stats: { model, intentChanges: 0, themesReassigned, negativesReclassified: 0, qualityAdjustments: 0, totalTokens },
  };
}

// --- Phase 3: Quality Score Adjustment ---
export async function runQualityPhase(
  keywords: SeedKeyword[],
  services: string[],
  targetDomain: string,
  strategy: CampaignStrategy | null,
  apiKey: string,
): Promise<PhaseResult> {
  const client = createEnhanceClient(apiKey);
  if (!client.isAvailable()) {
    return { keywords, stats: { model: '', intentChanges: 0, themesReassigned: 0, negativesReclassified: 0, qualityAdjustments: 0, totalTokens: 0 } };
  }

  const model = client.getModel();
  let totalTokens = 0;
  let qualityAdjustments = 0;
  const keywordMap = buildKeywordMap(keywords);
  const qualityAdjustedKeys = new Set<string>();

  const strategyContext = strategy
    ? `Campaign goal: ${strategy.goal}, monthly budget: $${strategy.monthlyBudget}, max CPC: ${strategy.maxCpc ?? 'none'}`
    : 'No specific strategy context';

  const qualityItems = keywords.map((kw) => ({
    text: kw.text, volume: kw.volume, cpc: kw.cpc,
    currentScore: kw.qualityScore || 50,
    intent: kw.intent || 'unknown',
  }));

  await runBatchesConcurrently(chunkArray(qualityItems, BATCH_SIZE), async (batch) => {
    try {
      const { data, usage } = await client.jsonPrompt<QualityPassResult>(
        `You are a PPC quality scoring expert for ${targetDomain} (services: ${services.join(', ')}).
${strategyContext}
Review keywords where the heuristic quality score seems wrong. Only return adjustments for keywords that need them.
Return JSON: { "adjustments": [{ "text": string, "adjustment": number (-15 to +15), "reason": string }] }`,
        JSON.stringify(batch),
      );
      totalTokens += usage.totalTokens;
      for (const adj of data.adjustments) {
        const key = adj.text.toLowerCase();
        const kw = keywordMap.get(key);
        if (!kw) continue;
        const clamped = Math.max(-15, Math.min(15, adj.adjustment));
        if (clamped === 0) continue;
        const oldScore = kw.qualityScore || 50;
        kw.qualityScore = Math.max(0, Math.min(100, oldScore + clamped));
        const score = kw.qualityScore;
        if (score >= 86) kw.qualityRating = 'A+';
        else if (score >= 74) kw.qualityRating = 'A';
        else if (score >= 65) kw.qualityRating = 'B+';
        else if (score >= 55) kw.qualityRating = 'B';
        else if (score >= 45) kw.qualityRating = 'C';
        else kw.qualityRating = 'D';
        qualityAdjustedKeys.add(key);
        qualityAdjustments++;
      }
      return data;
    } catch { return null; }
  });

  // Apply heuristic quality scores to keywords not adjusted by AI
  for (const kw of keywordMap.values()) {
    if (!qualityAdjustedKeys.has(kw.text.toLowerCase())) {
      const quality = getKeywordQualityScore(kw);
      kw.qualityScore = quality.score;
      kw.qualityRating = quality.rating;
    }
  }

  return {
    keywords: extractKeywords(keywordMap),
    stats: { model, intentChanges: 0, themesReassigned: 0, negativesReclassified: 0, qualityAdjustments, totalTokens },
  };
}

// --- Merge: apply strategy filters and dedupe ---
export function mergeAndFilter(
  keywords: SeedKeyword[],
  strategy: CampaignStrategy | null,
): { selected: SeedKeyword[]; suppressed: SuppressedKeyword[] } {
  const newSelected: SeedKeyword[] = [];
  const newSuppressed: SuppressedKeyword[] = [];

  for (const kw of keywords) {
    const suppressionReasons: string[] = [];

    if (kw.isNegativeCandidate && strategy && !strategy.includeNegativeCandidates) {
      suppressionReasons.push('AI flagged as negative/irrelevant');
    }
    if (kw.intent === 'informational' && strategy && !strategy.includeInformational) {
      suppressionReasons.push('Informational intent filtered out by strategy');
    }
    if (strategy?.focusHighIntent && kw.intent !== 'transactional' && kw.intent !== 'commercial') {
      suppressionReasons.push('Low-intent keyword filtered for conversion-focused strategy');
    }
    if (strategy && kw.volume < strategy.minVolume) {
      suppressionReasons.push(`Volume ${kw.volume} below minimum ${strategy.minVolume}`);
    }
    if (strategy?.maxCpc !== null && strategy?.maxCpc !== undefined && strategy.maxCpc > 0 && kw.cpc > strategy.maxCpc) {
      suppressionReasons.push(`CPC $${kw.cpc} above max $${strategy.maxCpc}`);
    }

    if (suppressionReasons.length > 0) {
      newSuppressed.push({ ...kw, suppressionReasons });
    } else {
      newSelected.push({ ...kw, suppressionReasons: [] });
    }
  }

  const dedupedSelected = dedupeSeedKeywords(newSelected);
  dedupedSelected.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

  return { selected: dedupedSelected, suppressed: newSuppressed };
}

// --- Legacy single-call function (kept for backward compat) ---
export async function enhanceWithAi(
  selected: SeedKeyword[],
  suppressed: SuppressedKeyword[],
  services: string[],
  targetDomain: string,
  strategy: CampaignStrategy | null,
  apiKey: string,
  onProgress?: (progress: AiEnhanceProgress) => void,
): Promise<AiEnhanceResult> {
  const allKeywords = [...selected, ...suppressed];

  onProgress?.({ phase: 'intent', status: 'running', message: 'Classifying intent...' });
  const intentResult = await runIntentPhase(allKeywords, services, targetDomain, apiKey);

  onProgress?.({ phase: 'themes', status: 'running', message: 'Clustering themes...' });
  const themesResult = await runThemesPhase(intentResult.keywords, services, apiKey);

  onProgress?.({ phase: 'quality', status: 'running', message: 'Adjusting quality scores...' });
  const qualityResult = await runQualityPhase(themesResult.keywords, services, targetDomain, strategy, apiKey);

  onProgress?.({ phase: 'merging', status: 'running', message: 'Reclassifying keywords...' });
  const { selected: finalSelected, suppressed: finalSuppressed } = mergeAndFilter(qualityResult.keywords, strategy);

  onProgress?.({ phase: 'done', status: 'done', message: 'Enhancement complete' });

  return {
    keywords: finalSelected,
    suppressed: finalSuppressed,
    stats: {
      model: intentResult.stats.model || themesResult.stats.model || qualityResult.stats.model,
      intentChanges: intentResult.stats.intentChanges,
      themesReassigned: themesResult.stats.themesReassigned,
      negativesReclassified: intentResult.stats.negativesReclassified,
      qualityAdjustments: qualityResult.stats.qualityAdjustments,
      totalTokens: intentResult.stats.totalTokens + themesResult.stats.totalTokens + qualityResult.stats.totalTokens,
    },
  };
}
