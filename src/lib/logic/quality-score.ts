import type { SeedKeyword, KeywordIntent } from '../types/index';
import { isOwnerStyleQuery } from './keyword-signals';

export function getKeywordQualityScore(keyword: SeedKeyword): { score: number; rating: string } {
  const volumeFactor = Math.min(Math.log10(keyword.volume + 1) / Math.log10(15000), 1);
  const cpc = keyword.cpc || 0;
  // Zero CPC from providers often means unavailable estimate, not "free clicks".
  const cpcFactor = cpc > 0 ? Math.max(1 - cpc / 20, 0) : 0.55;
  const rankFactor = keyword.rank ? Math.max(1 - (keyword.rank / 100), 0) : 0.25;
  // Competition opportunity: lower competition = better opportunity
  const compIndex = keyword.competitionIndex ?? 50;
  const competitionFactor = 1 - (compIndex / 100);
  const intentScoreByIntent: Record<KeywordIntent | 'unknown', number> = {
    transactional: 1,
    commercial: 0.84,
    informational: 0.5,
    navigational: 0.25,
    unknown: 0.35,
  };
  const intent = keyword.intent ?? 'unknown';
  const intentFactor = intentScoreByIntent[intent] ?? 0.35;
  const ownerStylePenalty = isOwnerStyleQuery(keyword.text) ? 18 : 0;

  // Weights: Intent 35%, CPC efficiency 30%, Volume 20%, Competition opportunity 10%, Rank 5%
  const score = Math.round(intentFactor * 35 + cpcFactor * 30 + volumeFactor * 20 + competitionFactor * 10 + rankFactor * 5 - ownerStylePenalty);

  let rating = 'D';
  if (score >= 86) rating = 'A+';
  else if (score >= 74) rating = 'A';
  else if (score >= 65) rating = 'B+';
  else if (score >= 55) rating = 'B';
  else if (score >= 45) rating = 'C';

  return { score: Math.min(score, 100), rating };
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrency(value: number): string {
  return `$${formatNumber(value, 2)}`;
}
