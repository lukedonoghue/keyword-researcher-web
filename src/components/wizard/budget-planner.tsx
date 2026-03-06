'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Shield, Target, Zap } from 'lucide-react';

const DAYS_PER_MONTH = 30.4;
const CONVERSION_RATE = 0.05;

const TIER_PRESETS = [
  { clicks: 10, label: 'Conservative', icon: Shield, color: 'blue', description: 'Slower data collection. Suitable for tight budgets or testing.' },
  { clicks: 20, label: 'Balanced', icon: Target, color: 'green', description: 'Recommended pace. Enough data for optimization in 2-4 weeks.' },
  { clicks: 30, label: 'Aggressive', icon: Zap, color: 'amber', description: 'Fastest data collection. Get leads quickly and optimize sooner.' },
] as const;

const TICK_CLICKS = [10, 15, 20, 30, 50] as const;
const MIN_CLICKS = 5;
const MAX_CLICKS = 50;

const colorClasses = {
  blue: {
    border: 'border-blue-400 dark:border-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    icon: 'text-blue-500',
  },
  green: {
    border: 'border-green-400 dark:border-green-500',
    bg: 'bg-green-50 dark:bg-green-950/40',
    icon: 'text-green-500',
  },
  amber: {
    border: 'border-amber-400 dark:border-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    icon: 'text-amber-500',
  },
} as const;

type BudgetPlannerProps = {
  avgCpc: number;
  initialDailyBudget: number;
  onBudgetChange: (daily: number) => void;
};

export function BudgetPlanner({ avgCpc, initialDailyBudget, onBudgetChange }: BudgetPlannerProps) {
  const [dailyBudget, setDailyBudget] = useState(initialDailyBudget);

  const sliderMin = MIN_CLICKS * avgCpc;
  const sliderMax = MAX_CLICKS * avgCpc;

  const clicksPerDay = avgCpc > 0 ? dailyBudget / avgCpc : 0;
  const monthlyBudget = dailyBudget * DAYS_PER_MONTH;
  const conversionsPerDay = clicksPerDay * CONVERSION_RATE;
  const conversionsPerMonth = clicksPerDay * DAYS_PER_MONTH * CONVERSION_RATE;

  const handleSliderChange = useCallback((values: number[]) => {
    let val = values[0];
    // Snap to tier presets when within 2 clicks
    const clicks = avgCpc > 0 ? val / avgCpc : 0;
    for (const preset of TIER_PRESETS) {
      if (Math.abs(clicks - preset.clicks) < 2) {
        val = preset.clicks * avgCpc;
        break;
      }
    }
    setDailyBudget(val);
    onBudgetChange(val);
  }, [avgCpc, onBudgetChange]);

  const snapTo = useCallback((clicks: number) => {
    const val = clicks * avgCpc;
    setDailyBudget(val);
    onBudgetChange(val);
  }, [avgCpc, onBudgetChange]);

  // Determine which tier is currently selected (within 2 clicks tolerance)
  const selectedTierClicks = useMemo(() => {
    for (const preset of TIER_PRESETS) {
      if (Math.abs(clicksPerDay - preset.clicks) < 2) return preset.clicks;
    }
    return null;
  }, [clicksPerDay]);

  // Tick positions as percentage
  const tickPositions = useMemo(() => {
    return TICK_CLICKS.map((clicks) => ({
      clicks,
      pct: ((clicks * avgCpc - sliderMin) / (sliderMax - sliderMin)) * 100,
    }));
  }, [avgCpc, sliderMin, sliderMax]);

  return (
    <Card>
      <CardContent className="py-5 px-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Budget Planner</p>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
            Avg CPC ${avgCpc.toFixed(2)}
          </span>
        </div>

        {/* Hero budget display */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">${Math.round(dailyBudget)}/day</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            ${monthlyBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
          </span>
        </div>

        {/* Slider with tick marks */}
        <div className="space-y-4">
          <div className="relative pt-1 pb-6">
            <Slider
              value={[dailyBudget]}
              min={sliderMin}
              max={sliderMax}
              step={avgCpc * 0.5}
              onValueChange={handleSliderChange}
              className="[&_[data-slot=slider-range]]:bg-[var(--brand-accent)] [&_[data-slot=slider-thumb]]:border-[var(--brand-accent)] [&_[data-slot=slider-thumb]]:shadow-[0_0_12px_rgba(252,185,0,0.25)]"
            />
            {/* Tick marks */}
            <div className="absolute inset-x-0 top-0 h-full pointer-events-none" aria-hidden>
              {tickPositions.map(({ clicks, pct }) => (
                <button
                  key={clicks}
                  type="button"
                  className="absolute top-[10px] -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-1"
                  style={{ left: `${pct}%` }}
                  onClick={() => snapTo(clicks)}
                >
                  <span className="block h-2 w-2 rounded-full bg-muted-foreground/30" />
                  <span className="text-[9px] text-muted-foreground tabular-nums mt-0.5">{clicks}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-3 gap-2">
          {TIER_PRESETS.map((preset) => {
            const daily = preset.clicks * avgCpc;
            const convMo = preset.clicks * DAYS_PER_MONTH * CONVERSION_RATE;
            const isSelected = selectedTierClicks === preset.clicks;
            const colors = colorClasses[preset.color];
            const Icon = preset.icon;

            return (
              <button
                key={preset.clicks}
                type="button"
                className={`rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm ${
                  isSelected ? `${colors.border} ${colors.bg}` : 'border-border hover:border-muted-foreground/30'
                }`}
                onClick={() => snapTo(preset.clicks)}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className={`h-3.5 w-3.5 ${colors.icon}`} />
                  <span className="text-[11px] font-medium">{preset.label}</span>
                  {preset.label === 'Balanced' && (
                    <span className="text-[9px] px-1.5 py-0 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-medium ml-auto">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold tabular-nums">${Math.round(daily)}/day</p>
                <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                  {preset.clicks} clicks/day
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ~{convMo.toFixed(1)} conv/mo
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Live metrics — prominent stat boxes */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/60 dark:bg-muted/30 px-3 py-2.5 text-center">
            <p className="text-lg font-bold tabular-nums">{Math.round(clicksPerDay)}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">clicks/day</p>
          </div>
          <div className="rounded-lg bg-brand-accent/10 dark:bg-brand-accent/15 border border-brand-accent/20 px-3 py-2.5 text-center">
            <p className="text-lg font-bold tabular-nums text-brand-accent">{conversionsPerDay.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">conv/day</p>
          </div>
          <div className="rounded-lg bg-brand-accent/10 dark:bg-brand-accent/15 border border-brand-accent/20 px-3 py-2.5 text-center">
            <p className="text-lg font-bold tabular-nums text-brand-accent">{Math.round(conversionsPerMonth)}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">conv/month</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
