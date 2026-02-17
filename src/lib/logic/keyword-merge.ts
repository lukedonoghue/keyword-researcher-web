import type { SeedKeyword } from '../types/index';
import { normalizeItems } from './url-utils';

export function mergeKeywordsWithGoogleAdsAuthority(keywordLists: SeedKeyword[][]): SeedKeyword[] {
  const merged = new Map<string, SeedKeyword>();

  for (const list of keywordLists) {
    for (const keyword of list) {
      const key = keyword.text.toLowerCase();
      if (!key) continue;
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, keyword);
        continue;
      }

      // Google Ads data is authoritative for metrics
      if (keyword.source === 'google_ads' && existing.source !== 'google_ads') {
        const positiveRanks = [existing.rank, keyword.rank].filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank) && rank > 0);
        // Google Ads wins for volume/CPC/competition, but preserve SpyFu rank context
        merged.set(key, {
          ...keyword,
          rank: positiveRanks.length > 0 ? Math.min(...positiveRanks) : undefined,
        });
      } else if (existing.source === 'google_ads' && keyword.source !== 'google_ads') {
        const positiveRanks = [existing.rank, keyword.rank].filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank) && rank > 0);
        // Existing is Google Ads -- keep it, but supplement rank from SpyFu
        merged.set(key, {
          ...existing,
          rank: positiveRanks.length > 0 ? Math.min(...positiveRanks) : undefined,
        });
      } else {
        // Same source or neither is Google Ads -- prefer lower CPC (better for advertiser)
        const incomingCpc = keyword.cpc > 0 ? keyword.cpc : null;
        const existingCpc = existing.cpc > 0 ? existing.cpc : null;

        const better =
          incomingCpc !== null && existingCpc !== null && incomingCpc !== existingCpc ? (incomingCpc < existingCpc ? keyword : existing) :
          incomingCpc !== null && existingCpc === null ? keyword :
          existingCpc !== null && incomingCpc === null ? existing :
          keyword.volume > existing.volume ? keyword :
          existing.volume > keyword.volume ? existing :
          keyword;

        const positiveRanks = [existing.rank, keyword.rank].filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank) && rank > 0);
        merged.set(key, {
          ...better,
          rank: positiveRanks.length > 0 ? Math.min(...positiveRanks) : undefined,
        });
      }
    }
  }

  return Array.from(merged.values());
}

export function dedupeSeedKeywords(keywords: SeedKeyword[]): SeedKeyword[] {
  const seen = new Set<string>();
  const out: SeedKeyword[] = [];
  for (const keyword of keywords) {
    const key = keyword.text.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out;
}

export function normalizeSpyfuKeyword(item: unknown): SeedKeyword | null {
  const data = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const rawText =
    typeof data.keyword === 'string'
      ? data.keyword
      : typeof data.text === 'string'
        ? data.text
        : '';
  const text = rawText.trim();
  if (!text) return null;

  return {
    text,
    volume: toNumber(data.searchVolume ?? data.volume),
    cpc: toNumber(data.cpc ?? data.costPerClick ?? data.avgCpc),
    rank: toNumber(data.rank ?? data.position ?? data.keyword_rank),
    source: 'spyfu',
  };
}

export function toNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (raw && typeof raw === 'object' && 'value' in raw) {
    return toNumber((raw as { value?: unknown }).value);
  }
  return 0;
}

export function parseKeywordsFromInput(input: string, source: SeedKeyword['source'] = 'manual'): SeedKeyword[] {
  return normalizeItems(input.split(',')).map((keyword) => ({
    text: keyword,
    volume: 0,
    cpc: 0,
    source,
  }));
}
