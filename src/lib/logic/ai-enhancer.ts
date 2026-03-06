import { OpenRouterService } from '../services/openrouter';
import type {
  SeedKeyword,
  SuppressedKeyword,
  KeywordIntent,
  CampaignStrategy,
  NegativeKeywordListItem,
} from '../types/index';
import { getKeywordQualityScore } from './quality-score';
import { dedupeSeedKeywords } from './keyword-merge';
import { analyzeKeywordSignals, isOwnerStyleQuery, normalizeKeywordText } from './keyword-signals';

const BATCH_SIZE = 40;
const MAX_CONCURRENT_BATCHES = 4;
const DEFAULT_ENHANCE_MODEL = process.env.OPENROUTER_ENHANCE_MODEL?.trim() || 'google/gemini-3-flash-preview';
const AI_REVIEW_TEMPERATURE = 0.1;
const ENHANCE_TIMEOUT_MS = 30000;

function createEnhanceClient(apiKey: string, model?: string): OpenRouterService {
  return new OpenRouterService(apiKey, model?.trim() || DEFAULT_ENHANCE_MODEL, ENHANCE_TIMEOUT_MS);
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
type NegativeSuggestionCategory = 'employment' | 'support' | 'diy' | 'forum' | 'low_quality' | 'irrelevant_adjacent';
type NegativeSuggestion = {
  keyword: string;
  matchType: 'Phrase' | 'Exact';
  category: NegativeSuggestionCategory;
  reason: string;
};
type NegativePassResult = { items: NegativeSuggestion[] };

export type NegativeKeywordPhaseResult = {
  items: NegativeKeywordListItem[];
  stats: {
    model: string;
    totalTokens: number;
  };
};

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

function normalizeNegativeSuggestion(
  suggestion: NegativeSuggestion,
  services: string[],
): NegativeKeywordListItem | null {
  const keyword = normalizeKeywordText(suggestion.keyword);
  if (!keyword) return null;

  const overlapsCoreService = services.some((service) => {
    const normalizedService = normalizeKeywordText(service);
    if (!normalizedService) return false;
    return keyword === normalizedService || keyword.includes(normalizedService);
  });

  if (
    overlapsCoreService &&
    !/\b(job|jobs|career|careers|salary|login|support|account|free|cheap|cheapest|used|forum|reddit|youtube|diy|how to|tutorial)\b/i.test(keyword)
  ) {
    return null;
  }

  const matchType =
    suggestion.matchType === 'Exact' || /\b(license|licence)\b/i.test(keyword)
      ? 'Exact'
      : 'Phrase';

  return {
    keyword,
    matchType,
    enabled: true,
    reasons: [suggestion.reason.trim() || `AI review: ${suggestion.category}`],
    source: 'ai_review',
    occurrences: 1,
  };
}

function applyIntentGuardrails(
  keyword: SeedKeyword,
  aiResult: { intent: KeywordIntent; confidence: number; reason: string; isNegative: boolean },
): { intent: KeywordIntent; confidence: number; reason: string; isNegative: boolean } {
  const normalized = normalizeKeywordText(keyword.text);
  const signalIntent = analyzeKeywordSignals(keyword.text);

  if (isOwnerStyleQuery(normalized)) {
    return {
      intent: 'informational',
      confidence: Math.max(aiResult.confidence, 0.76),
      reason: 'Owner/support-style query override',
      isNegative: true,
    };
  }

  if (
    aiResult.intent === 'navigational' &&
    signalIntent.intent !== 'navigational' &&
    signalIntent.intent !== 'unknown' &&
    signalIntent.intentConfidence >= 0.3
  ) {
    return {
      intent: signalIntent.intent,
      confidence: Math.max(aiResult.confidence, signalIntent.intentConfidence),
      reason: `Rule-based override: ${signalIntent.intentReason}`,
      isNegative: aiResult.isNegative || keyword.isNegativeCandidate || false,
    };
  }

  return aiResult;
}

// --- Phase 1: Intent Classification ---
export async function runIntentPhase(
  keywords: SeedKeyword[],
  services: string[],
  targetDomain: string,
  apiKey: string,
  selectedModel?: string,
): Promise<PhaseResult> {
  const client = createEnhanceClient(apiKey, selectedModel);
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
Classify each keyword's search intent and detect truly negative/irrelevant keywords for Google Ads.
Set isNegative=true only for clear exclusion intent such as competitor brand queries, jobs/careers, DIY/research-only terms, support/login/account terms, used/free terms, or obviously unrelated topics.
Queries written like existing-owner/support lookups such as "my [product/service]" are not navigational demand. Treat them as informational or low-value support intent, and mark them negative when they are unlikely to convert.
Do NOT mark a keyword negative only because it is informational, comparison, review-oriented, pricing-related, or early-funnel if it is still relevant to the service.
Preserve service-adjacent category terms that could belong in a catch-all or specialist ad group. Those terms should be routed later, not suppressed here.
Return JSON: { "keywords": [{ "text": string, "intent": "transactional"|"commercial"|"informational"|"navigational", "confidence": 0-1, "reason": string, "isNegative": boolean }] }`,
        JSON.stringify(batch),
        AI_REVIEW_TEMPERATURE,
      );
      totalTokens += usage.totalTokens;
      for (const item of data.keywords) {
        const key = item.text.toLowerCase();
        const kw = keywordMap.get(key);
        if (!kw) continue;
        const guarded = applyIntentGuardrails(kw, item);
        if (kw.intent !== guarded.intent) intentChanges++;
        if ((kw.isNegativeCandidate || false) !== guarded.isNegative) negativesReclassified++;
        kw.intent = guarded.intent;
        kw.intentConfidence = guarded.confidence;
        kw.intentReason = guarded.reason;
        kw.isNegativeCandidate = guarded.isNegative;
        kw.aiEnhanced = true;
        kw.aiIntentOverride = guarded.intent;
        kw.aiConfidence = guarded.confidence;
        kw.aiReason = guarded.reason;
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
  selectedModel?: string,
): Promise<PhaseResult> {
  const client = createEnhanceClient(apiKey, selectedModel);
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
        AI_REVIEW_TEMPERATURE,
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
  selectedModel?: string,
): Promise<PhaseResult> {
  const client = createEnhanceClient(apiKey, selectedModel);
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
        AI_REVIEW_TEMPERATURE,
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

export async function runNegativeKeywordPhase(
  suppressedKeywords: SuppressedKeyword[],
  services: string[],
  targetDomain: string,
  businessName: string | undefined,
  businessDescription: string | undefined,
  apiKey: string,
  selectedModel?: string,
): Promise<NegativeKeywordPhaseResult> {
  const client = createEnhanceClient(apiKey, selectedModel);
  if (!client.isAvailable() || suppressedKeywords.length === 0) {
    return { items: [], stats: { model: '', totalTokens: 0 } };
  }

  const model = client.getModel();
  const candidateKeywords = suppressedKeywords
    .slice()
    .sort((a, b) => b.volume - a.volume || a.cpc - b.cpc)
    .slice(0, 80)
    .map((kw) => ({
      text: kw.text,
      intent: kw.intent || 'unknown',
      reasons: kw.suppressionReasons,
      volume: kw.volume,
      cpc: kw.cpc,
    }));

  try {
    const { data, usage } = await client.jsonPrompt<NegativePassResult>(
      `You are a Google Ads negative keyword strategist for ${businessName || targetDomain || 'this business'}.
Business domain: ${targetDomain || 'unknown'}
Business description: ${businessDescription || 'not provided'}
Primary services: ${services.join(', ') || 'not provided'}

Review suppressed keywords and return ONLY safe campaign-level negatives for junk, low-quality, non-buying, or clearly irrelevant adjacent intent.
Valid categories:
- employment: jobs, careers, salary, internship
- support: login, support, account, FAQ, contact/support intent
- diy: how to, tutorial, DIY, guide
- forum: reddit, youtube, wiki, forum
- low_quality: cheap, free, used, second hand
- irrelevant_adjacent: adjacent products/software/content that are clearly not the offered service

Do NOT return:
- core service queries
- pricing/comparison queries that still indicate buying intent
- routing/funneling terms that belong in another ad group
- category terms that should stay targetable

Return JSON:
{ "items": [{ "keyword": string, "matchType": "Phrase" | "Exact", "category": "employment" | "support" | "diy" | "forum" | "low_quality" | "irrelevant_adjacent", "reason": string }] }

Keep the list short and high-confidence. Prefer Phrase. Use Exact only for ambiguous single words.`,
      JSON.stringify(candidateKeywords),
      AI_REVIEW_TEMPERATURE,
    );

    const deduped = new Map<string, NegativeKeywordListItem>();
    for (const suggestion of data.items ?? []) {
      const normalized = normalizeNegativeSuggestion(suggestion, services);
      if (!normalized) continue;
      const key = `${normalized.keyword}|||${normalized.matchType}`;
      if (!deduped.has(key)) {
        deduped.set(key, normalized);
      }
    }

    return {
      items: Array.from(deduped.values()),
      stats: { model, totalTokens: usage.totalTokens },
    };
  } catch {
    return { items: [], stats: { model, totalTokens: 0 } };
  }
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
