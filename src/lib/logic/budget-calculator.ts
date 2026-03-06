import type { SeedKeyword } from '../types/index';

export type BudgetRecommendation = {
  avgCpc: number;
  recommendedDaily: number;
  recommendedMonthly: number;
  totalMonthlyVolume: number;
};

export type BudgetTierName = 'conservative' | 'balanced' | 'aggressive';

export type BudgetTier = {
  name: BudgetTierName;
  label: string;
  targetClicksPerDay: number;
  dailyBudget: number;
  monthlyBudget: number;
  estimatedClicksPerDay: number;
  estimatedConversionsPerMonth: number;
  description: string;
};

export type BudgetTiersResult = {
  avgCpc: number;
  totalMonthlyVolume: number;
  tiers: BudgetTier[];
};

const TARGET_CLICKS_PER_DAY = 20;
const DAYS_PER_MONTH = 30.4;
const ASSUMED_CONVERSION_RATE = 0.05;

const TIER_DEFINITIONS: { name: BudgetTierName; label: string; targetClicksPerDay: number; description: string }[] = [
  { name: 'conservative', label: 'Conservative', targetClicksPerDay: 10, description: 'Slower data collection. Suitable for tight budgets or testing.' },
  { name: 'balanced', label: 'Balanced', targetClicksPerDay: 20, description: 'Recommended pace. Enough data for optimization in 2-4 weeks.' },
  { name: 'aggressive', label: 'Aggressive', targetClicksPerDay: 30, description: 'Fastest data collection. Get leads quickly and optimize sooner.' },
];

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

export function calculateBudgetTiers(keywords: SeedKeyword[]): BudgetTiersResult {
  const avgCpc = calculateAvgCpc(keywords);
  const totalMonthlyVolume = keywords.reduce((sum, kw) => sum + kw.volume, 0);

  const tiers: BudgetTier[] = TIER_DEFINITIONS.map((def) => {
    const dailyBudget = def.targetClicksPerDay * avgCpc;
    const monthlyBudget = dailyBudget * DAYS_PER_MONTH;
    const estimatedConversionsPerMonth = def.targetClicksPerDay * DAYS_PER_MONTH * ASSUMED_CONVERSION_RATE;
    return {
      name: def.name,
      label: def.label,
      targetClicksPerDay: def.targetClicksPerDay,
      dailyBudget,
      monthlyBudget,
      estimatedClicksPerDay: def.targetClicksPerDay,
      estimatedConversionsPerMonth,
      description: def.description,
    };
  });

  return { avgCpc, totalMonthlyVolume, tiers };
}

export function estimatedDailyClicks(budget: number, avgCpc: number): number {
  if (avgCpc <= 0) return 0;
  return budget / avgCpc;
}

export function estimatedMonthlyConversions(dailyBudget: number, avgCpc: number): number {
  const dailyClicks = estimatedDailyClicks(dailyBudget, avgCpc);
  return dailyClicks * DAYS_PER_MONTH * ASSUMED_CONVERSION_RATE;
}
