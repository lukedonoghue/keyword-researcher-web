'use client';

import { useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, Target, Zap } from 'lucide-react';
import type { CampaignMatchTypeStrategy, CampaignStrategy } from '@/lib/types/index';

const presets: {
  label: string;
  description: string;
  dailyHint: string;
  tone: string;
  icon: typeof Shield;
  values: Partial<CampaignStrategy>;
}[] = [
  {
    label: 'Conservative',
    description: 'Lower spend, high-intent only',
    dailyHint: '~$33/day',
    tone: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300',
    icon: Shield,
    values: { monthlyBudget: 1000, minVolume: 50, maxCpc: null, focusHighIntent: true, includeInformational: false, competitorCampaignMode: 'exclude', brandCampaignMode: 'exclude' },
  },
  {
    label: 'Balanced',
    description: 'Recommended defaults',
    dailyHint: '~$66/day',
    tone: 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-300',
    icon: Target,
    values: { monthlyBudget: 2000, minVolume: 10, maxCpc: null, focusHighIntent: false, includeInformational: false, competitorCampaignMode: 'exclude', brandCampaignMode: 'exclude' },
  },
  {
    label: 'Aggressive',
    description: 'Max reach, all intents',
    dailyHint: '~$166/day',
    tone: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300',
    icon: Zap,
    values: { monthlyBudget: 5000, minVolume: 10, maxCpc: null, focusHighIntent: false, includeInformational: true, competitorCampaignMode: 'exclude', brandCampaignMode: 'exclude' },
  },
];

const matchTypeOptions: Array<{
  value: CampaignMatchTypeStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'exact_phrase',
    label: 'Exact + Phrase',
    description: 'Recommended default. Keeps coverage broad enough to learn while still preserving match-type visibility.',
  },
  {
    value: 'exact_only',
    label: 'Exact Only',
    description: 'Tightest control. Best when you want clean intent isolation and minimal query expansion.',
  },
  {
    value: 'phrase_only',
    label: 'Phrase Only',
    description: 'Wider reach with simpler account structure, but less precision than Exact-led builds.',
  },
];

function getMatchTypeSummary(strategy: CampaignMatchTypeStrategy): string {
  if (strategy === 'exact_only') {
    return 'Each keyword will be built once as Exact match only.';
  }
  if (strategy === 'phrase_only') {
    return 'Each keyword will be built once as Phrase match only.';
  }
  return 'Each keyword will be built in both Exact and Phrase match by default.';
}

export function StepStrategy() {
  const { state, dispatch } = useWorkflow();
  const [strategy, setStrategy] = useState<CampaignStrategy>(state.strategy);
  const [manualSeeds, setManualSeeds] = useState(state.manualSeedKeywords.join('\n'));

  const update = (partial: Partial<CampaignStrategy>) => {
    setStrategy((prev) => ({ ...prev, ...partial }));
  };

  const handleNext = () => {
    const seeds = manualSeeds
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    dispatch({ type: 'SET_MANUAL_SEEDS', keywords: seeds });
    dispatch({ type: 'SET_STRATEGY', strategy });
    dispatch({ type: 'SET_STEP', step: 'research' });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-base font-semibold">Campaign Strategy</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure how keywords are filtered and prioritized.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isMatch =
            strategy.monthlyBudget === preset.values.monthlyBudget &&
            strategy.focusHighIntent === preset.values.focusHighIntent &&
            strategy.includeInformational === preset.values.includeInformational;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => update(preset.values)}
              className={`flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-all duration-200 hover:scale-[1.02] ${
                isMatch
                  ? 'border-2 border-brand-accent bg-brand-accent/5 shadow-sm dark:bg-brand-accent/10'
                  : `border hover:border-muted-foreground/30 ${preset.tone}`
              }`}
            >
              <Icon className={`h-4 w-4 ${isMatch ? 'text-brand-accent' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium">{preset.label}</span>
              <span className="text-[11px] text-muted-foreground">{preset.description}</span>
              <span className="text-[10px] font-medium text-muted-foreground">{preset.dailyHint}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Goals & Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Campaign Goal</Label>
              <Select value={strategy.goal} onValueChange={(v) => update({ goal: v as CampaignStrategy['goal'] })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversions" className="text-xs">Conversions</SelectItem>
                  <SelectItem value="traffic" className="text-xs">Traffic</SelectItem>
                  <SelectItem value="awareness" className="text-xs">Awareness</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monthly Budget ($)</Label>
              <Input
                type="number"
                value={strategy.monthlyBudget}
                onChange={(e) => update({ monthlyBudget: Number(e.target.value) })}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Total monthly Google Ads spend</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Min Search Volume</Label>
            <Input
              type="number"
              value={strategy.minVolume}
              onChange={(e) => update({ minVolume: Number(e.target.value) })}
              className="h-8 text-xs w-1/2"
            />
            <p className="text-[11px] text-muted-foreground">Minimum monthly searches. Lower = more keywords.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={strategy.focusHighIntent} onCheckedChange={(c) => update({ focusHighIntent: !!c })} />
            <span className="text-xs">Focus on high-intent keywords</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={strategy.includeInformational} onCheckedChange={(c) => update({ includeInformational: !!c })} />
            <span className="text-xs">Include informational keywords</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={strategy.includeNegativeCandidates} onCheckedChange={(c) => update({ includeNegativeCandidates: !!c })} />
            <span className="text-xs">Include negative candidates</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Competitor Traffic Handling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => update({ competitorCampaignMode: 'exclude' })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                strategy.competitorCampaignMode === 'exclude'
                  ? 'border-brand-accent bg-brand-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-muted-foreground/30'
              }`}
            >
              <p className="text-xs font-medium">Exclude From Standard Campaigns</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Recommended. Competitor terms become negatives on normal campaigns.
              </p>
            </button>
            <button
              type="button"
              onClick={() => update({ competitorCampaignMode: 'separate' })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                strategy.competitorCampaignMode === 'separate'
                  ? 'border-brand-accent bg-brand-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-muted-foreground/30'
              }`}
            >
              <p className="text-xs font-medium">Build Competitor Campaign</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Keep competitor negatives on standard campaigns and build a separate competitor-only campaign when data exists.
              </p>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The review step will generate competitor, universal, brand, and routing negative lists based on this choice.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Brand Traffic Handling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => update({ brandCampaignMode: 'exclude' })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                strategy.brandCampaignMode === 'exclude'
                  ? 'border-brand-accent bg-brand-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-muted-foreground/30'
              }`}
            >
              <p className="text-xs font-medium">No Separate Brand Campaign</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Keep the build focused on non-brand service campaigns only.
              </p>
            </button>
            <button
              type="button"
              onClick={() => update({ brandCampaignMode: 'separate' })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                strategy.brandCampaignMode === 'separate'
                  ? 'border-brand-accent bg-brand-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-muted-foreground/30'
              }`}
            >
              <p className="text-xs font-medium">Build Separate Brand Campaign</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Generate a dedicated brand search campaign and apply brand negatives to all non-brand campaigns automatically.
              </p>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            When enabled, non-brand keywords are also added as exact-match negatives to the brand campaign to keep routing clean.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Match Type Strategy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {matchTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ matchTypeStrategy: option.value })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  strategy.matchTypeStrategy === option.value
                    ? 'border-brand-accent bg-brand-accent/5 shadow-sm'
                    : 'border-border bg-card hover:border-muted-foreground/30'
                }`}
              >
                <p className="text-xs font-medium">{option.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {getMatchTypeSummary(strategy.matchTypeStrategy)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Ad Group Size</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Min Keywords</Label>
              <Input
                type="number"
                value={strategy.minAdGroupKeywords}
                onChange={(e) => update({ minAdGroupKeywords: Number(e.target.value) })}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Keywords per ad group</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Keywords</Label>
              <Input
                type="number"
                value={strategy.maxAdGroupKeywords}
                onChange={(e) => update({ maxAdGroupKeywords: Number(e.target.value) })}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Keywords per ad group</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            5–10 keywords per ad group is recommended to start. {getMatchTypeSummary(strategy.matchTypeStrategy)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Seed Keywords (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Textarea
            value={manualSeeds}
            onChange={(e) => setManualSeeds(e.target.value)}
            placeholder={"Add your own seed terms, one per line\ne.g., emergency plumber\ne.g., blocked drain"}
            rows={3}
            className="text-xs resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            These terms will be sent to Google Keyword Planner as additional seed input alongside your services.
          </p>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Tip: Aim for ~20 clicks/day per campaign. After research, we&apos;ll recommend an optimal budget based on actual keyword CPCs.
      </p>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-8" onClick={() => dispatch({ type: 'SET_STEP', step: 'geo' })}>
          Back
        </Button>
        <Button variant="brand" size="sm" className="h-8" onClick={handleNext}>
          Start Research
        </Button>
      </div>
    </div>
  );
}
