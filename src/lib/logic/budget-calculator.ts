import type { SeedKeyword } from '../types/index';

export type BudgetRecommendation = {
  avgCpc: number;
  recommendedDaily: number;
  recommendedMonthly: number;
  totalMonthlyVolume: number;
};

const TARGET_CLICKS_PER_DAY = 20;
const DAYS_PER_MONTH = 30.4;
const ASSUMED_CONVERSION_RATE = 0.05;

export function calculateAvgCpc(keywords: SeedKeyword[]): number {
  if (keywords.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (const kw of keywords) {
    const low = kw.cpcLow ?? 0;
    const high = kw.cpcHigh ?? 0;
    const midpoint = low > 0 && high > 0 ? (low + high) / 2 : kw.cpc;
    if (midpoint > 0) {
      total += midpoint;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

export function calculateRecommendedBudget(keywords: SeedKeyword[]): BudgetRecommendation {
  const avgCpc = calculateAvgCpc(keywords);
  const recommendedDaily = TARGET_CLICKS_PER_DAY * avgCpc;
  const recommendedMonthly = recommendedDaily * DAYS_PER_MONTH;
  const totalMonthlyVolume = keywords.reduce((sum, kw) => sum + kw.volume, 0);

  return { avgCpc, recommendedDaily, recommendedMonthly, totalMonthlyVolume };
}

export function estimatedDailyClicks(budget: number, avgCpc: number): number {
  if (avgCpc <= 0) return 0;
  return budget / avgCpc;
}

export function estimatedMonthlyConversions(dailyBudget: number, avgCpc: number): number {
  const dailyClicks = estimatedDailyClicks(dailyBudget, avgCpc);
  return dailyClicks * DAYS_PER_MONTH * ASSUMED_CONVERSION_RATE;
}
