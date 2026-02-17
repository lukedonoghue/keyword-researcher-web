'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { useWorkflowData } from '@/hooks/use-workflow-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { enrichSeedKeywordsWithSignals, applyStrategyFilter } from '@/lib/logic/strategy-filter';
import { mergeKeywordsWithGoogleAdsAuthority } from '@/lib/logic/keyword-merge';
import type { SeedKeyword } from '@/lib/types/index';

export function StepResearch() {
  const { state, dispatch } = useWorkflow();
  const { researchKeywords, isProcessing, error } = useWorkflowData();
  const [phase, setPhase] = useState<'competitors' | 'google' | 'merging' | 'filtering' | 'done'>('competitors');
  const startedRef = useRef(false);

  const runResearch = useCallback(async (force: boolean = false) => {
    if (!force && startedRef.current) return;
    startedRef.current = true;
    try {
      setPhase('competitors');
      const allKeywords = await researchKeywords((nextPhase) => setPhase(nextPhase));

      setPhase('merging');
      const perplexityKws = allKeywords.filter((kw: SeedKeyword) => kw.source === 'perplexity');
      const googleKws = allKeywords.filter((kw: SeedKeyword) => kw.source === 'google_ads');
      const merged = mergeKeywordsWithGoogleAdsAuthority([perplexityKws, googleKws]);

      setPhase('filtering');
      const enriched = enrichSeedKeywordsWithSignals(merged);
      const { selected, suppressed } = applyStrategyFilter(enriched, state.strategy);

      dispatch({ type: 'SET_SEED_KEYWORDS', keywords: merged });
      dispatch({ type: 'SET_FILTERED_KEYWORDS', selected, suppressed });
      setPhase('done');

      // Auto-advance
      dispatch({ type: 'SET_STEP', step: 'enhance' });
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

  return (
    <div className="space-y-4 max-w-xl">
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

          {state.seedKeywords.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Found {state.seedKeywords.length} keywords, {state.selectedKeywords.length} passed filters.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3">
            <p className="text-xs text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => void runResearch(true)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => dispatch({ type: 'SET_STEP', step: 'strategy' })}
        disabled={isProcessing}
      >
        Back
      </Button>
    </div>
  );
}

function PhaseRow({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-green-500">
          <path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      ) : active ? (
        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
      ) : (
        <div className="h-3 w-3 rounded-full border border-border" />
      )}
      <span className={`text-xs ${active ? 'text-foreground font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
        {label}
      </span>
    </div>
  );
}
