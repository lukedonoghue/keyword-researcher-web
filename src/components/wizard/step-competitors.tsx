'use client';

import { useMemo, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { applyStrategyFilter, enrichSeedKeywordsWithSignals } from '@/lib/logic/strategy-filter';
import { isCompetitorBrand, normalizeKeywordText } from '@/lib/logic/keyword-signals';
import { filterOutSelfCompetitorNames, isSelfBrandName } from '@/lib/logic/brand-identity';
import { X } from 'lucide-react';

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const name of names) {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const normalized = normalizeKeywordText(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(trimmed);
  }

  return ordered.sort((left, right) => left.localeCompare(right));
}

export function StepCompetitors() {
  const { state, dispatch } = useWorkflow();
  const identity = useMemo(() => ({
    businessName: state.businessName,
    targetDomain: state.targetDomain,
    targetUrl: state.targetUrl,
  }), [state.businessName, state.targetDomain, state.targetUrl]);
  const [draftCompetitors, setDraftCompetitors] = useState<string[]>(() => dedupeNames(state.competitorNames));
  const [manualCompetitor, setManualCompetitor] = useState('');
  const [competitorMode, setCompetitorMode] = useState(state.strategy.competitorCampaignMode);

  const sanitizedCompetitors = useMemo(
    () => dedupeNames(filterOutSelfCompetitorNames(draftCompetitors, identity)),
    [draftCompetitors, identity],
  );

  const competitorKeywordRows = useMemo(() => {
    return state.seedKeywords
      .filter((keyword) => Boolean(isCompetitorBrand(keyword.text, sanitizedCompetitors)))
      .slice()
      .sort((left, right) => {
        if (right.volume !== left.volume) return right.volume - left.volume;
        return right.cpc - left.cpc;
      })
      .slice(0, 20)
      .map((keyword) => ({
        ...keyword,
        competitor: isCompetitorBrand(keyword.text, sanitizedCompetitors) ?? 'Competitor',
      }));
  }, [sanitizedCompetitors, state.seedKeywords]);

  const competitorCoverage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const keyword of state.seedKeywords) {
      const competitor = isCompetitorBrand(keyword.text, sanitizedCompetitors);
      if (!competitor) continue;
      counts.set(competitor, (counts.get(competitor) ?? 0) + 1);
    }
    return sanitizedCompetitors.map((name) => ({
      name,
      keywordCount: counts.get(name) ?? 0,
    }));
  }, [sanitizedCompetitors, state.seedKeywords]);

  const handleAddCompetitor = () => {
    const trimmed = manualCompetitor.trim();
    if (!trimmed) return;
    if (isSelfBrandName(trimmed, identity)) {
      setManualCompetitor('');
      return;
    }
    setDraftCompetitors((prev) => dedupeNames([...prev, trimmed]));
    setManualCompetitor('');
  };

  const handleRemoveCompetitor = (name: string) => {
    setDraftCompetitors((prev) => prev.filter((competitor) => competitor !== name));
  };

  const handleContinue = () => {
    const nextCompetitors = sanitizedCompetitors;
    const enriched = enrichSeedKeywordsWithSignals(state.seedKeywords);
    const { selected, suppressed } = applyStrategyFilter(enriched, state.strategy, nextCompetitors);
    const nextStrategy = {
      ...state.strategy,
      competitorCampaignMode: competitorMode,
    };

    dispatch({ type: 'SET_COMPETITOR_NAMES', names: nextCompetitors });
    dispatch({ type: 'SET_STRATEGY', strategy: nextStrategy });
    dispatch({ type: 'SET_FILTERED_KEYWORDS', selected, suppressed });
    dispatch({ type: 'SET_STEP', step: 'enhance' });
  };

  const modeLabel =
    competitorMode === 'separate'
      ? 'Separate competitor campaign'
      : 'Exclude from standard campaigns';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-base font-semibold">Competitor Review</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Audit the discovered competitors before they become exclusions or feed a competitor campaign.
        </p>
      </div>

      <Card>
        <CardContent className="py-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Mode</Badge>
            <Badge variant="secondary">{draftCompetitors.length} competitors</Badge>
            <Badge variant="secondary">{competitorKeywordRows.length} matched search terms</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCompetitorMode('exclude')}
              className={`rounded-lg border p-3 text-left transition-colors ${
                competitorMode === 'exclude'
                  ? 'border-brand-accent bg-brand-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-muted-foreground/30'
              }`}
            >
              <p className="text-xs font-medium">Exclude From Standard Campaigns</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Recommended default. Competitor terms become negatives so they do not leak into standard service campaigns.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setCompetitorMode('separate')}
              className={`rounded-lg border p-3 text-left transition-colors ${
                competitorMode === 'separate'
                  ? 'border-brand-accent bg-brand-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-muted-foreground/30'
              }`}
            >
              <p className="text-xs font-medium">Build Competitor Campaign</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Standard campaigns still keep competitor negatives, and the build will create a separate competitor-only campaign when search data exists.
              </p>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Current selection: <span className="font-medium text-foreground/90">{modeLabel}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            If competitor search terms are thin, exclusions will still be applied cleanly. A separate competitor campaign only becomes substantial when Google Ads research returns usable competitor-branded queries.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Discovered Competitors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={manualCompetitor}
              onChange={(event) => setManualCompetitor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddCompetitor();
                }
              }}
              placeholder="Add competitor brand manually"
              className="h-8 text-xs"
            />
            <Button variant="outline" size="sm" className="h-8" onClick={handleAddCompetitor}>
              Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {competitorCoverage.map((competitor) => (
              <div
                key={competitor.name}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs"
              >
                <span className="font-medium">{competitor.name}</span>
                <span className="text-muted-foreground">{competitor.keywordCount} kws</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCompetitor(competitor.name)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Remove ${competitor.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {competitorCoverage.length === 0 && (
              <p className="text-xs text-muted-foreground">No competitors are currently selected.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Competitor-Branded Search Terms</CardTitle>
        </CardHeader>
        <CardContent>
          {competitorKeywordRows.length > 0 ? (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Competitor</TableHead>
                    <TableHead className="text-[11px]">Keyword</TableHead>
                    <TableHead className="text-[11px] text-right">Volume</TableHead>
                    <TableHead className="text-[11px] text-right">CPC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitorKeywordRows.map((keyword) => (
                    <TableRow key={keyword.text}>
                      <TableCell className="text-xs">{keyword.competitor}</TableCell>
                      <TableCell className="text-xs font-medium">{keyword.text}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{keyword.volume.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {keyword.cpc > 0 ? `$${keyword.cpc.toFixed(2)}` : 'Low data'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-3 py-5 text-xs text-muted-foreground">
              No competitor-branded search terms are matched yet. You can still use the competitor names as negatives, but a separate competitor campaign will only be useful once branded terms are present in research.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => dispatch({ type: 'SET_STEP', step: 'research' })}
        >
          Back
        </Button>
        <Button variant="brand" size="sm" className="h-9 flex-1" onClick={handleContinue}>
          Continue to AI Enhancement
        </Button>
      </div>
    </div>
  );
}
