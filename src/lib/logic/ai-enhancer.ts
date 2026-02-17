import { OpenRouterService } from '../services/openrouter';
import type { SeedKeyword, SuppressedKeyword, KeywordIntent, CampaignStrategy } from '../types/index';
import { getKeywordQualityScore } from './quality-score';

const BATCH_SIZE = 80;

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

type IntentPassItem = { text: string; currentIntent: string; isNegative: boolean };
type IntentPassResult = { keywords: Array<{ text: string; intent: KeywordIntent; confidence: number; reason: string; isNegative: boolean }> };
type ThemePassItem = { text: string; currentThemes: string[] };
type ThemeCluster = { clusterName: string; service: string; keywords: string[] };
type ThemePassResult = { clusters: ThemeCluster[] };
type QualityPassItem = { text: string; volume: number; cpc: number; currentScore: number; intent: string };
type QualityAdjustment = { text: string; adjustment: number; reason: string };
type QualityPassResult = { adjustments: QualityAdjustment[] };

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function enhanceWithAi(
  selected: SeedKeyword[],
  suppressed: SuppressedKeyword[],
  services: string[],
  targetDomain: string,
  strategy: CampaignStrategy | null,
  apiKey: string,
  onProgress?: (progress: AiEnhanceProgress) => void,
): Promise<AiEnhanceResult> {
  const client = new OpenRouterService(apiKey);

  if (!client.isAvailable()) {
    return {
      keywords: selected,
      suppressed,
      stats: { model: '', intentChanges: 0, themesReassigned: 0, negativesReclassified: 0, qualityAdjustments: 0, totalTokens: 0 },
    };
  }

  const model = client.getModel();
  let totalTokens = 0;
  let intentChanges = 0;
  let themesReassigned = 0;
  let negativesReclassified = 0;
  let qualityAdjustments = 0;
  const qualityAdjustedKeys = new Set<string>();

  const allKeywords = [...selected, ...suppressed];
  const keywordMap = new Map<string, SeedKeyword>();
  for (const kw of allKeywords) {
    keywordMap.set(kw.text.toLowerCase(), { ...kw });
  }

  // --- Pass 1: Intent Classification ---
  onProgress?.({ phase: 'intent', status: 'starting', message: 'Classifying intent...' });
  const intentItems: IntentPassItem[] = allKeywords.map((kw) => ({
    text: kw.text, currentIntent: kw.intent || 'unknown', isNegative: kw.isNegativeCandidate || false,
  }));

  for (const batch of chunkArray(intentItems, BATCH_SIZE)) {
    onProgress?.({ phase: 'intent', status: 'running', message: `Processing ${batch.length} keywords...` });
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
    } catch { /* graceful degradation */ }
  }
  onProgress?.({ phase: 'intent', status: 'done', message: `${intentChanges} intent changes` });

  // --- Pass 2: Theme Clustering ---
  onProgress?.({ phase: 'themes', status: 'starting', message: 'Clustering themes...' });
  const selectedKeys = new Set(selected.map((kw) => kw.text.toLowerCase()));
  const themeItems: ThemePassItem[] = selected.map((kw) => ({ text: kw.text, currentThemes: kw.themes || ['General'] }));

  for (const batch of chunkArray(themeItems, BATCH_SIZE)) {
    onProgress?.({ phase: 'themes', status: 'running', message: `Clustering ${batch.length} keywords...` });
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
          if (!selectedKeys.has(key)) continue;
          const kw = keywordMap.get(key);
          if (!kw) continue;
          const oldThemes = (kw.themes || []).join(',');
          kw.themes = [cluster.clusterName, cluster.service].filter(Boolean).slice(0, 3);
          if (oldThemes !== kw.themes.join(',')) themesReassigned++;
        }
      }
    } catch { /* graceful degradation */ }
  }
  onProgress?.({ phase: 'themes', status: 'done', message: `${themesReassigned} themes reassigned` });

  // --- Pass 3: Quality Score Adjustment ---
  onProgress?.({ phase: 'quality', status: 'starting', message: 'Adjusting quality scores...' });
  const qualityItems: QualityPassItem[] = selected.map((kw) => ({
    text: kw.text, volume: kw.volume, cpc: kw.cpc,
    currentScore: kw.qualityScore || 50,
    intent: keywordMap.get(kw.text.toLowerCase())?.intent || kw.intent || 'unknown',
  }));

  const strategyContext = strategy
    ? `Campaign goal: ${strategy.goal}, monthly budget: $${strategy.monthlyBudget}, max CPC: ${strategy.maxCpc ?? 'none'}`
    : 'No specific strategy context';

  for (const batch of chunkArray(qualityItems, BATCH_SIZE)) {
    onProgress?.({ phase: 'quality', status: 'running', message: `Scoring ${batch.length} keywords...` });
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
    } catch { /* graceful degradation */ }
  }
  onProgress?.({ phase: 'quality', status: 'done', message: `${qualityAdjustments} adjustments` });

  // --- Merge ---
  onProgress?.({ phase: 'merging', status: 'running', message: 'Reclassifying keywords...' });
  const newSelected: SeedKeyword[] = [];
  const newSuppressed: SuppressedKeyword[] = [];

  for (const kw of allKeywords) {
    const key = kw.text.toLowerCase();
    const updated = keywordMap.get(key) || kw;
    const suppressionReasons: string[] = [];

    if (updated.isNegativeCandidate && strategy && !strategy.includeNegativeCandidates) {
      suppressionReasons.push('AI flagged as negative/irrelevant');
    }
    if (updated.intent === 'navigational' && strategy?.focusHighIntent) {
      suppressionReasons.push('Navigational intent filtered for conversion focus');
    }
    if (updated.intent === 'informational' && strategy && !strategy.includeInformational && strategy.focusHighIntent) {
      suppressionReasons.push('Informational intent filtered out by strategy');
    }
    if (strategy && updated.volume < strategy.minVolume) {
      suppressionReasons.push(`Volume ${updated.volume} below minimum ${strategy.minVolume}`);
    }
    if (strategy?.maxCpc !== null && strategy?.maxCpc !== undefined && strategy.maxCpc > 0 && updated.cpc > strategy.maxCpc) {
      suppressionReasons.push(`CPC $${updated.cpc} above max $${strategy.maxCpc}`);
    }

    if (suppressionReasons.length > 0) {
      newSuppressed.push({ ...updated, suppressionReasons });
    } else {
      if (!qualityAdjustedKeys.has(key)) {
        const quality = getKeywordQualityScore(updated);
        updated.qualityScore = quality.score;
        updated.qualityRating = quality.rating;
      }
      newSelected.push({ ...updated, suppressionReasons: [] });
    }
  }

  newSelected.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
  onProgress?.({ phase: 'done', status: 'done', message: 'Enhancement complete' });

  return {
    keywords: newSelected,
    suppressed: newSuppressed,
    stats: { model, intentChanges, themesReassigned, negativesReclassified, qualityAdjustments, totalTokens },
  };
}
