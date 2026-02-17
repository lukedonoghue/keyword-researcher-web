import type { SeedKeyword } from '../types/index';

export type CpcRange = {
  bidLow: number;
  bidHigh: number;
  bidAvg: number;
  displayRange: string;
  bidRecommendation: number;
};

export function calculateCpcRange(keyword: SeedKeyword): CpcRange {
  const cpcLow = keyword.cpcLow ?? 0;
  const cpcHigh = keyword.cpcHigh ?? 0;
  const cpc = keyword.cpc ?? 0;

  const bidLow = cpcLow > 0 ? cpcLow : cpc > 0 ? cpc * 0.7 : 0;
  const bidHigh = cpcHigh > 0 ? cpcHigh : cpc > 0 ? cpc * 1.3 : 0;
  const bidAvg = cpc > 0 ? cpc : (bidLow + bidHigh) / 2;
  const bidRecommendation = cpcLow > 0 ? cpcLow : cpc > 0 ? cpc * 0.8 : 0;

  const fmt = (v: number) => `$${v.toFixed(2)}`;
  const displayRange = bidLow > 0 && bidHigh > 0
    ? `${fmt(bidLow)} - ${fmt(bidHigh)}`
    : bidAvg > 0
      ? fmt(bidAvg)
      : 'N/A';

  return { bidLow, bidHigh, bidAvg, displayRange, bidRecommendation };
}

export type CpcCapStatus = 'under' | 'near' | 'over';

export function getCpcCapStatus(cpc: number, maxCpc: number | null): CpcCapStatus {
  if (maxCpc === null || maxCpc <= 0) return 'under';
  if (cpc <= maxCpc * 0.7) return 'under';
  if (cpc <= maxCpc) return 'near';
  return 'over';
}
