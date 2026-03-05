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
import type { CampaignStrategy } from '@/lib/types/index';

const presets: {
  label: string;
  description: string;
  icon: typeof Shield;
  values: Partial<CampaignStrategy>;
}[] = [
  {
    label: 'Conservative',
    description: 'Lower spend, high-intent only',
    icon: Shield,
    values: { monthlyBudget: 1000, minVolume: 100, maxCpc: 8, focusHighIntent: true, includeInformational: false },
  },
  {
    label: 'Balanced',
    description: 'Recommended defaults',
    icon: Target,
    values: { monthlyBudget: 2000, minVolume: 50, maxCpc: 12, focusHighIntent: true, includeInformational: false },
  },
  {
    label: 'Aggressive',
    description: 'Max reach, all intents',
    icon: Zap,
    values: { monthlyBudget: 5000, minVolume: 20, maxCpc: null, focusHighIntent: false, includeInformational: true },
  },
];

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
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-base font-semibold">Campaign Strategy</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure how keywords are filtered and prioritized.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {presets.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => update(preset.values)}
              className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">{preset.label}</span>
              <span className="text-[11px] text-muted-foreground">{preset.description}</span>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Max CPC ($)</Label>
              <Input
                type="number"
                value={strategy.maxCpc ?? ''}
                onChange={(e) => update({ maxCpc: e.target.value ? Number(e.target.value) : null })}
                placeholder="No limit"
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Maximum you&apos;ll pay per click. Leave empty for no limit.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min Search Volume</Label>
              <Input
                type="number"
                value={strategy.minVolume}
                onChange={(e) => update({ minVolume: Number(e.target.value) })}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Minimum monthly searches. Lower = more keywords.</p>
            </div>
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
        <Button size="sm" className="h-8" onClick={handleNext}>
          Start Research
        </Button>
      </div>
    </div>
  );
}
