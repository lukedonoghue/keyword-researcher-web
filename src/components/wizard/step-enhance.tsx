'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { useWorkflowData } from '@/hooks/use-workflow-data';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle } from 'lucide-react';
import type { KeywordIntent } from '@/lib/types/index';
import { PhaseRow } from './phase-row';

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
      await enhanceKeywords(state.selectedKeywords, state.suppressedKeywords, (p) => {
        if (p === 'themes') setPhase('themes');
        else if (p === 'quality') setPhase('quality');
        else if (p === 'merge') setPhase('quality');
      });
      setPhase('done');
    } catch {
      // Error handled by useWorkflowData
    }
  }, [enhanceKeywords, state.selectedKeywords, state.suppressedKeywords]);

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

  const intentBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const kw of state.enhancedKeywords) {
      const intent = kw.intent || 'unknown';
      counts[intent] = (counts[intent] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [state.enhancedKeywords]);

  const topEnhanced = useMemo(() => {
    return state.enhancedKeywords
      .slice()
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 5);
  }, [state.enhancedKeywords]);

  const intentBadgeVariant = (intent: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (intent as KeywordIntent) {
      case 'transactional': return 'default';
      case 'commercial': return 'secondary';
      case 'informational': return 'outline';
      case 'navigational': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
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

      {phase === 'done' && state.enhancedKeywords.length > 0 && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800/60 dark:bg-green-950/40 dark:card-glow-success">
          <CardContent className="py-5 space-y-4">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              AI classified {state.enhancedKeywords.length} keywords by intent, scored quality, and clustered themes.
            </p>

            {intentBreakdown.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {intentBreakdown.map(([intent, count]) => (
                  <Badge key={intent} variant={intentBadgeVariant(intent)} className="text-[11px]">
                    {count} {intent}
                  </Badge>
                ))}
              </div>
            )}

            {topEnhanced.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Top keywords by quality</p>
                <div className="rounded-md border border-green-200 dark:border-green-900 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-green-100/50 dark:bg-green-900/30">
                        <TableHead className="text-[11px] h-7 py-0">Keyword</TableHead>
                        <TableHead className="text-[11px] h-7 py-0 text-right">Intent</TableHead>
                        <TableHead className="text-[11px] h-7 py-0 text-right">Quality</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topEnhanced.map((kw) => (
                        <TableRow key={kw.text} className="bg-white/50 dark:bg-transparent">
                          <TableCell className="text-xs py-1.5">{kw.text}</TableCell>
                          <TableCell className="text-xs py-1.5 text-right">
                            <Badge variant={intentBadgeVariant(kw.intent || 'unknown')} className="text-[10px] px-1.5 py-0">
                              {kw.intent || 'unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5 text-right tabular-nums">{kw.qualityRating ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Button
              variant="brand"
              size="sm"
              className="w-full h-9"
              onClick={() => dispatch({ type: 'SET_STEP', step: 'review' })}
            >
              Review Keywords
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40 border-l-4 border-l-destructive bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => void runEnhance(true)}>
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
          onClick={() => dispatch({ type: 'SET_STEP', step: 'research' })}
          disabled={isProcessing}
        >
          Back
        </Button>
        {phase !== 'done' && !isProcessing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => dispatch({ type: 'SET_STEP', step: 'review' })}
          >
            Skip &mdash; Go directly to Review
          </Button>
        )}
        {phase === 'done' && (
          <Button
            variant="brand"
            size="sm"
            className="h-8"
            onClick={() => dispatch({ type: 'SET_STEP', step: 'review' })}
          >
            Review Keywords
          </Button>
        )}
      </div>
    </div>
  );
}
