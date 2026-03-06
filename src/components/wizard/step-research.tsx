'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { useWorkflowData } from '@/hooks/use-workflow-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { enrichSeedKeywordsWithSignals, applyStrategyFilter } from '@/lib/logic/strategy-filter';
import { mergeKeywordsWithGoogleAdsAuthority } from '@/lib/logic/keyword-merge';
import { calculateBudgetTiers } from '@/lib/logic/budget-calculator';
import { AlertCircle } from 'lucide-react';
import { PhaseRow } from './phase-row';

type CpcStageStats = { count: number; distinctCpcs: number; cpcRange: [number, number] };
type PipelineStats = {
  apiPerService: Array<{ service: string; total: number; distinctCpcs: number; cpcRange: [number, number]; samples: Array<{ text: string; cpc: number; vol: number }> }>;
  preMerge: CpcStageStats;
  postMerge: CpcStageStats;
  postFilter: CpcStageStats;
};

function cpcStats(keywords: { cpc: number }[]): CpcStageStats {
  const cpcs = keywords.map(kw => kw.cpc).filter(c => c > 0);
  return {
    count: keywords.length,
    distinctCpcs: new Set(cpcs.map(c => Math.round(c * 1_000_000))).size,
    cpcRange: cpcs.length > 0 ? [Math.min(...cpcs), Math.max(...cpcs)] : [0, 0],
  };
}

export function StepResearch() {
  const { state, dispatch } = useWorkflow();
  const { researchKeywords, isProcessing, error } = useWorkflowData();
  const [phase, setPhase] = useState<'competitors' | 'google' | 'merging' | 'filtering' | 'done'>('competitors');
  const [pipelineStats, setPipelineStats] = useState<PipelineStats | null>(null);
  const startedRef = useRef(false);

  const runResearch = useCallback(async (force: boolean = false) => {
    if (!force && startedRef.current) return;
    startedRef.current = true;
    try {
      setPhase('competitors');
      const { keywords: allKeywords, competitorNames, cpcDebug } = await researchKeywords((nextPhase) => setPhase(nextPhase));

      // Build per-service stats from API debug responses
      const apiPerService = cpcDebug.map(entry => ({
        service: entry.service,
        total: entry.debug.total,
        distinctCpcs: entry.debug.distinctCpcs,
        cpcRange: entry.debug.cpcRange,
        samples: entry.debug.samples.map(s => ({ text: s.text, cpc: s.cpc, vol: s.vol })),
      }));

      setPhase('merging');
      const preMerge = cpcStats(allKeywords);
      const merged = mergeKeywordsWithGoogleAdsAuthority([allKeywords]);
      const postMerge = cpcStats(merged);

      setPhase('filtering');
      const enriched = enrichSeedKeywordsWithSignals(merged);
      const { selected, suppressed } = applyStrategyFilter(enriched, state.strategy, competitorNames);
      const postFilter = cpcStats(selected);

      setPipelineStats({ apiPerService, preMerge, postMerge, postFilter });

      dispatch({ type: 'SET_SEED_KEYWORDS', keywords: merged });
      dispatch({ type: 'SET_FILTERED_KEYWORDS', selected, suppressed });
      setPhase('done');
    } catch {
      // Error handled by useWorkflowData
    }
  }, [dispatch, researchKeywords, state.strategy]);

  useEffect(() => {
    if (startedRef.current || state.seedKeywords.length > 0) {
      return;
    }
    const timer = setTimeout(() => {
      void runResearch();
    }, 0);
    return () => clearTimeout(timer);
  }, [runResearch, state.seedKeywords.length]);

  const progressPercent = { competitors: 25, google: 50, merging: 75, filtering: 90, done: 100 }[phase];

  const topKeywords = useMemo(() => {
    return state.selectedKeywords
      .slice()
      .sort((a, b) => {
        // Keywords with real CPC data first, then by volume
        const aHasCpc = a.cpc > 0 ? 1 : 0;
        const bHasCpc = b.cpc > 0 ? 1 : 0;
        if (bHasCpc !== aHasCpc) return bHasCpc - aHasCpc;
        return b.volume - a.volume;
      })
      .slice(0, 10);
  }, [state.selectedKeywords]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-base font-semibold">Keyword Research</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Researching keywords from multiple sources.
        </p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <Progress value={progressPercent} className="h-1.5" />
          <div className="space-y-2">
            <PhaseRow label="Competitor research (Perplexity)" active={phase === 'competitors'} done={phase !== 'competitors'} />
            <PhaseRow label="Google Ads keyword ideas" active={phase === 'google'} done={['merging', 'filtering', 'done'].includes(phase)} />
            <PhaseRow label="Merging & deduplication" active={phase === 'merging'} done={['filtering', 'done'].includes(phase)} />
            <PhaseRow label="Strategy filtering" active={phase === 'filtering'} done={phase === 'done'} />
          </div>

          {isProcessing && (
            <p className="text-[11px] text-muted-foreground">
              Running keyword pipeline...
            </p>
          )}

          {state.seedKeywords.length > 0 && phase !== 'done' && (
            <p className="text-xs text-muted-foreground">
              Found {state.seedKeywords.length} keywords, {state.selectedKeywords.length} passed filters.
            </p>
          )}
        </CardContent>
      </Card>

      {phase === 'done' && state.selectedKeywords.length > 0 && (() => {
        const budgetTiers = calculateBudgetTiers(state.selectedKeywords);
        const conservative = budgetTiers.tiers.find((t) => t.name === 'conservative')!;
        const balanced = budgetTiers.tiers.find((t) => t.name === 'balanced')!;
        const aggressive = budgetTiers.tiers.find((t) => t.name === 'aggressive')!;
        return (
          <Card className="border-green-200 bg-green-50 dark:border-green-800/60 dark:bg-green-950/40 dark:card-glow-success">
            <CardContent className="py-5 space-y-4">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Found {state.seedKeywords.length} keywords. {state.selectedKeywords.length} passed your strategy filters.
              </p>

              {topKeywords.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Top keywords by volume
                  </p>
                  <div className="rounded-md border border-green-200 dark:border-green-900 overflow-hidden">
                    <div className="md:hidden divide-y divide-green-200 dark:divide-green-900">
                      {topKeywords.map((kw) => (
                        <div key={kw.text} className="bg-white/70 dark:bg-transparent px-3 py-2.5 space-y-1.5">
                          <p className="text-xs font-medium">{kw.text}</p>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <p className="text-muted-foreground uppercase tracking-wide">Volume</p>
                              <p className="tabular-nums">{kw.volume.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground uppercase tracking-wide">CPC</p>
                              {kw.cpc > 0 ? (
                                <p className="tabular-nums">
                                  ${kw.cpc.toFixed(2)}
                                  {(kw.cpcLow || kw.cpcHigh) ? (
                                    <span className="block text-[10px] text-muted-foreground">
                                      ${(kw.cpcLow ?? 0).toFixed(2)}–${(kw.cpcHigh ?? 0).toFixed(2)}
                                    </span>
                                  ) : null}
                                </p>
                              ) : (
                                <p className="text-[10px] text-muted-foreground italic">Low data</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-green-100/50 dark:bg-green-900/30">
                            <TableHead className="text-[11px] h-7 py-0">Keyword</TableHead>
                            <TableHead className="text-[11px] h-7 py-0 text-right">Volume</TableHead>
                            <TableHead className="text-[11px] h-7 py-0 text-right">CPC</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topKeywords.map((kw) => (
                            <TableRow key={kw.text} className="bg-white/50 dark:bg-transparent">
                              <TableCell className="text-xs py-1.5">{kw.text}</TableCell>
                              <TableCell className="text-xs py-1.5 text-right tabular-nums">{kw.volume.toLocaleString()}</TableCell>
                              <TableCell className="text-xs py-1.5 text-right tabular-nums">
                                {kw.cpc > 0 ? (
                                  <>
                                    ${kw.cpc.toFixed(2)}
                                    {(kw.cpcLow || kw.cpcHigh) ? (
                                      <span className="text-[10px] text-muted-foreground block">
                                        ${(kw.cpcLow ?? 0).toFixed(2)}–${(kw.cpcHigh ?? 0).toFixed(2)}
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground italic">Low data</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="px-2 py-1 bg-green-100/30 dark:bg-green-900/20 border-t border-green-200 dark:border-green-900">
                      <p className="text-[10px] text-muted-foreground">
                        CPC = avg of top-of-page bid range from Google Keyword Planner for your selected location. Range shows low (page bottom) to high (page top) estimates.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {budgetTiers.avgCpc > 0 && (
                <div className="rounded-md border border-green-200 dark:border-green-900 bg-white/60 dark:bg-green-950/40 px-3 py-2.5 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Budget Insight</p>
                  <p className="text-xs text-green-800 dark:text-green-200">
                    Average CPC: <span className="font-semibold tabular-nums">${budgetTiers.avgCpc.toFixed(2)}</span>
                    <span className="text-[11px] text-muted-foreground ml-1">({budgetTiers.totalMonthlyVolume.toLocaleString()} monthly searches)</span>
                  </p>
                  <div className="space-y-0.5 mt-1">
                    <p className="text-xs text-green-800 dark:text-green-200">
                      Conservative (10 clicks/day): <span className="font-semibold tabular-nums">${Math.round(conservative.dailyBudget)}/day</span> <span className="tabular-nums text-[11px] text-muted-foreground">(${Math.round(conservative.monthlyBudget).toLocaleString()}/mo)</span>
                    </p>
                    <p className="text-xs text-green-800 dark:text-green-200">
                      Balanced (20 clicks/day): <span className="font-semibold tabular-nums">${Math.round(balanced.dailyBudget)}/day</span> <span className="tabular-nums text-[11px] text-muted-foreground">(${Math.round(balanced.monthlyBudget).toLocaleString()}/mo)</span>
                      <span className="text-[9px] px-1.5 py-0 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-medium ml-1">Recommended</span>
                    </p>
                    <p className="text-xs text-green-800 dark:text-green-200">
                      Aggressive (30 clicks/day): <span className="font-semibold tabular-nums">${Math.round(aggressive.dailyBudget)}/day</span> <span className="tabular-nums text-[11px] text-muted-foreground">(${Math.round(aggressive.monthlyBudget).toLocaleString()}/mo)</span>
                    </p>
                  </div>
                </div>
              )}

              {/* CPC Pipeline Debug — shows where CPC diversity exists or is lost */}
              {pipelineStats && (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    CPC pipeline diagnostics
                  </summary>
                  <div className="mt-2 space-y-2 rounded-md border border-green-200 dark:border-green-900 bg-white/60 dark:bg-green-950/40 px-3 py-2">
                    {pipelineStats.apiPerService.map((svc, i) => (
                      <div key={i}>
                        <p className="font-medium">API: &quot;{svc.service}&quot;</p>
                        <p className="text-muted-foreground">
                          {svc.total} keywords, {svc.distinctCpcs} distinct CPCs, range ${svc.cpcRange[0].toFixed(2)}–${svc.cpcRange[1].toFixed(2)}
                        </p>
                        <p className="text-muted-foreground">
                          Samples: {svc.samples.map(s => `${s.text}=$${s.cpc.toFixed(2)}`).join(', ')}
                        </p>
                      </div>
                    ))}
                    <div className="border-t border-green-200 dark:border-green-900 pt-1">
                      <p>Pre-merge: {pipelineStats.preMerge.count} kws, {pipelineStats.preMerge.distinctCpcs} distinct CPCs, ${pipelineStats.preMerge.cpcRange[0].toFixed(2)}–${pipelineStats.preMerge.cpcRange[1].toFixed(2)}</p>
                      <p>Post-merge: {pipelineStats.postMerge.count} kws, {pipelineStats.postMerge.distinctCpcs} distinct CPCs, ${pipelineStats.postMerge.cpcRange[0].toFixed(2)}–${pipelineStats.postMerge.cpcRange[1].toFixed(2)}</p>
                      <p>Post-filter: {pipelineStats.postFilter.count} kws, {pipelineStats.postFilter.distinctCpcs} distinct CPCs, ${pipelineStats.postFilter.cpcRange[0].toFixed(2)}–${pipelineStats.postFilter.cpcRange[1].toFixed(2)}</p>
                    </div>
                    <div className="border-t border-green-200 dark:border-green-900 pt-1">
                      <p className="font-medium">CPC data coverage</p>
                      <p className="text-muted-foreground">
                        With CPC data: {state.selectedKeywords.filter(kw => kw.cpc > 0).length} keywords
                        {' · '}$0.00 CPC (low data): {state.selectedKeywords.filter(kw => kw.cpc === 0).length} keywords
                      </p>
                      <p className="font-medium mt-1">Filter summary</p>
                      <p className="text-muted-foreground">
                        {state.seedKeywords.length} total → {state.selectedKeywords.length} passed, {state.suppressedKeywords.length} filtered out
                      </p>
                    </div>
                  </div>
                </details>
              )}

            </CardContent>
          </Card>
        );
      })()}

      {error && (
        <Card className="border-destructive/40 border-l-4 border-l-destructive bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => void runResearch(true)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => dispatch({ type: 'SET_STEP', step: 'strategy' })}
          disabled={isProcessing}
        >
          Back
        </Button>
        {phase === 'done' && (
          <Button
            variant="brand"
            size="sm"
            className="h-9 flex-1"
            onClick={() => dispatch({ type: 'SET_STEP', step: 'enhance' })}
          >
            Continue to AI Enhancement
          </Button>
        )}
      </div>
    </div>
  );
}
