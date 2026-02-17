'use client';

import { useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { CampaignStrategy } from '@/lib/types/index';

export function StepStrategy() {
  const { state, dispatch } = useWorkflow();
  const [strategy, setStrategy] = useState<CampaignStrategy>(state.strategy);

  const update = (partial: Partial<CampaignStrategy>) => {
    setStrategy((prev) => ({ ...prev, ...partial }));
  };

  const handleNext = () => {
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min Search Volume</Label>
              <Input
                type="number"
                value={strategy.minVolume}
                onChange={(e) => update({ minVolume: Number(e.target.value) })}
                className="h-8 text-xs"
              />
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Keywords</Label>
              <Input
                type="number"
                value={strategy.maxAdGroupKeywords}
                onChange={(e) => update({ maxAdGroupKeywords: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
