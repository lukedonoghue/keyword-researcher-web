'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { useWorkflowData } from '@/hooks/use-workflow-data';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

export function StepEnhance() {
  const { state, dispatch } = useWorkflow();
  const { enhanceKeywords, isProcessing, error } = useWorkflowData();
  const [phase, setPhase] = useState<'intent' | 'themes' | 'quality' | 'done'>('intent');
  const startedRef = useRef(false);

  const runEnhance = useCallback(async (force: boolean = false) => {
    if (!force && startedRef.current) return;
    startedRef.current = true;
    try {
      setPhase('intent');
      await enhanceKeywords(state.selectedKeywords, state.suppressedKeywords);
      setPhase('done');
      dispatch({ type: 'SET_STEP', step: 'review' });
    } catch {
      // Error handled by useWorkflowData
    }
  }, [dispatch, enhanceKeywords, state.selectedKeywords, state.suppressedKeywords]);

  useEffect(() => {
    if (
      startedRef.current ||
      state.enhancedKeywords.length > 0 ||
      state.selectedKeywords.length === 0
    ) {
      return;
    }
    const timer = setTimeout(() => {
      void runEnhance();
    }, 0);
    return () => clearTimeout(timer);
  }, [runEnhance, state.enhancedKeywords.length, state.selectedKeywords.length]);

  const progressPercent = { intent: 33, themes: 66, quality: 85, done: 100 }[phase];

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-base font-semibold">AI Enhancement</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI is refining intent classification, themes, and quality scores.
        </p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <Progress value={progressPercent} className="h-1.5" />
          <div className="space-y-2">
            <PhaseRow label="Intent classification" active={phase === 'intent'} done={['themes', 'quality', 'done'].includes(phase)} />
            <PhaseRow label="Theme clustering" active={phase === 'themes'} done={['quality', 'done'].includes(phase)} />
            <PhaseRow label="Quality score adjustment" active={phase === 'quality'} done={phase === 'done'} />
          </div>
          {isProcessing && (
            <p className="text-[11px] text-muted-foreground">
              Applying AI adjustments...
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3">
            <p className="text-xs text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => void runEnhance(true)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => dispatch({ type: 'SET_STEP', step: 'research' })}
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
