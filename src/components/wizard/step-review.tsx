'use client';

import { useState, useMemo } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Search, SearchX, X, ChevronUp, ChevronDown, ChevronRight, Hash, DollarSign, TrendingUp, Target } from 'lucide-react';
import { calculateBudgetTiers } from '@/lib/logic/budget-calculator';

const intentColors: Record<string, string> = {
  transactional: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  commercial: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  informational: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  navigational: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  unknown: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

const qualityColors: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  'A': 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  'B+': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  'B': 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'C': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  'D': 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

const qualityDotColors: Record<string, string> = {
  'A+': 'bg-emerald-500',
  'A': 'bg-green-500',
  'B+': 'bg-blue-500',
  'B': 'bg-sky-500',
  'C': 'bg-yellow-500',
  'D': 'bg-red-500',
};

type SortKey = 'text' | 'volume' | 'cpc' | 'intent' | 'quality';
type SortDir = 'asc' | 'desc';
type IntentFilter = 'all' | 'transactional' | 'commercial' | 'informational' | 'navigational';

const INTENT_FILTERS: { value: IntentFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'informational', label: 'Informational' },
  { value: 'navigational', label: 'Navigational' },
];

const qualityOrder: Record<string, number> = { 'A+': 6, 'A': 5, 'B+': 4, 'B': 3, 'C': 2, 'D': 1 };

export function StepReview() {
  const { state, dispatch } = useWorkflow();
  const keywords = state.enhancedKeywords.length > 0 ? state.enhancedKeywords : state.selectedKeywords;

  const [intentFilter, setIntentFilter] = useState<IntentFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [maxCpcFilter, setMaxCpcFilter] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(() => new Set());
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [excludedNegatives, setExcludedNegatives] = useState<Set<number>>(() => new Set());

  const suppressedKeywords = state.enhancedSuppressed.length > 0 ? state.enhancedSuppressed : state.suppressedKeywords;

  // Combine suppressed keywords + competitor brands as negative candidates
  const negativeCandidates = useMemo(() => {
    const items: { text: string; reasons: string[] }[] = [];
    for (const kw of suppressedKeywords) {
      items.push({ text: kw.text, reasons: kw.suppressionReasons });
    }
    // Add competitor names as negative candidates (from Perplexity scrape)
    for (const name of state.competitorNames) {
      // Avoid duplicating if already present as a suppressed keyword
      if (!items.some(item => item.text.toLowerCase() === name.toLowerCase())) {
        items.push({ text: name, reasons: ['Local competitor brand (from competitor research)'] });
      }
    }
    return items;
  }, [suppressedKeywords, state.competitorNames]);

  const selectedNegativeKeywords = useMemo(() => {
    const seen = new Set<string>();
    const selected: string[] = [];
    for (const [idx, item] of negativeCandidates.entries()) {
      if (excludedNegatives.has(idx)) continue;
      const keyword = item.text.trim();
      const key = keyword.toLowerCase();
      if (!keyword || seen.has(key)) continue;
      seen.add(key);
      selected.push(keyword);
    }
    return selected;
  }, [negativeCandidates, excludedNegatives]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'text' ? 'asc' : 'desc');
    }
  };

  const handleRemove = (originalIndex: number) => {
    setRemovedIndices(prev => {
      const next = new Set(prev);
      next.add(originalIndex);
      return next;
    });
  };

  // Keywords after removal (these are what get sent to the next step)
  const keptKeywords = useMemo(
    () => keywords.filter((_, idx) => !removedIndices.has(idx)),
    [keywords, removedIndices],
  );

  // Visible keywords after intent filter, search, and sorting
  const filteredKeywords = useMemo(() => {
    let result = keywords.map((kw, idx) => ({ kw, originalIndex: idx }));

    // Exclude removed
    result = result.filter(({ originalIndex }) => !removedIndices.has(originalIndex));

    // Intent filter
    if (intentFilter !== 'all') {
      result = result.filter(({ kw }) => (kw.intent || 'unknown') === intentFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(({ kw }) => kw.text.toLowerCase().includes(q));
    }

    // Max CPC filter
    if (maxCpcFilter !== null && maxCpcFilter > 0) {
      result = result.filter(({ kw }) => kw.cpc <= maxCpcFilter);
    }

    // Sorting
    result.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'text':
          return dir * a.kw.text.localeCompare(b.kw.text);
        case 'volume':
          return dir * (a.kw.volume - b.kw.volume);
        case 'cpc':
          return dir * (a.kw.cpc - b.kw.cpc);
        case 'intent':
          return dir * (a.kw.intent || 'unknown').localeCompare(b.kw.intent || 'unknown');
        case 'quality': {
          const aQ = qualityOrder[a.kw.qualityRating || ''] ?? 0;
          const bQ = qualityOrder[b.kw.qualityRating || ''] ?? 0;
          return dir * (aQ - bQ);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [keywords, removedIndices, intentFilter, searchQuery, maxCpcFilter, sortKey, sortDir]);

  // Keywords after CPC filter (for stats and campaign building)
  const cpcFilteredKeywords = useMemo(
    () => maxCpcFilter !== null && maxCpcFilter > 0
      ? keptKeywords.filter(kw => kw.cpc <= maxCpcFilter)
      : keptKeywords,
    [keptKeywords, maxCpcFilter],
  );

  const cpcHiddenCount = keptKeywords.length - cpcFilteredKeywords.length;

  // Stats computed from CPC-filtered keywords
  const stats = useMemo(() => {
    const list = cpcFilteredKeywords;
    const count = list.length;
    const budgetTiers = calculateBudgetTiers(list);
    const conservative = budgetTiers.tiers.find((t) => t.name === 'conservative');
    const balanced = budgetTiers.tiers.find((t) => t.name === 'balanced');
    const aggressive = budgetTiers.tiers.find((t) => t.name === 'aggressive');

    // Intent breakdown
    const intentCounts: Record<string, number> = {};
    for (const kw of list) {
      const intent = kw.intent || 'unknown';
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    }
    let dominantIntent = 'unknown';
    let dominantCount = 0;
    for (const [intent, cnt] of Object.entries(intentCounts)) {
      if (cnt > dominantCount) {
        dominantIntent = intent;
        dominantCount = cnt;
      }
    }
    const dominantPct = count > 0 ? Math.round((dominantCount / count) * 100) : 0;

    return {
      count,
      avgCpc: budgetTiers.avgCpc,
      conservativeDaily: conservative?.dailyBudget ?? 0,
      balancedDaily: balanced?.dailyBudget ?? 0,
      aggressiveDaily: aggressive?.dailyBudget ?? 0,
      dominantIntent,
      dominantPct,
    };
  }, [cpcFilteredKeywords]);

  const handleNext = () => {
    // Persist only the kept + CPC-filtered keywords before navigating
    if (state.enhancedKeywords.length > 0) {
      dispatch({
        type: 'SET_ENHANCED_KEYWORDS',
        keywords: cpcFilteredKeywords,
        suppressed: state.enhancedSuppressed,
      });
    } else {
      dispatch({
        type: 'SET_FILTERED_KEYWORDS',
        selected: cpcFilteredKeywords,
        suppressed: state.suppressedKeywords,
      });
    }
    dispatch({ type: 'SET_REVIEW_NEGATIVE_KEYWORDS', keywords: selectedNegativeKeywords });
    dispatch({ type: 'SET_STEP', step: 'campaign' });
  };

  const renderSortIndicator = (column: SortKey) => {
    if (sortKey !== column) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
      : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
  };

  const sortableHeaderClass = 'text-[11px] font-medium cursor-pointer select-none hover:text-foreground transition-colors';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Keyword Review</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {cpcFilteredKeywords.length} of {keywords.length} keywords selected for campaign building.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => dispatch({ type: 'SET_STEP', step: 'enhance' })}
          >
            Back
          </Button>
          <Button variant="brand" size="sm" className="h-8" onClick={handleNext}>
            Build Campaign
          </Button>
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-accent via-brand-accent/60 to-transparent" />
          <CardContent className="p-3.5 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Hash className="h-3.5 w-3.5 text-brand-accent" />
              Keywords
            </p>
            <p className="text-3xl font-semibold tabular-nums text-brand-accent">{stats.count.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Primary campaign inventory</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-accent/70 via-brand-accent/35 to-transparent" />
          <CardContent className="p-3.5 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5 text-brand-accent/80" />
              Avg CPC
            </p>
            <p className="text-3xl font-semibold tabular-nums">${stats.avgCpc.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">Per keyword click estimate</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-accent/70 via-brand-accent/35 to-transparent" />
          <CardContent className="p-3.5 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-brand-accent/80" />
              Recommended Budget
            </p>
            <p className="text-3xl font-semibold tabular-nums">${Math.round(stats.conservativeDaily)}&ndash;${Math.round(stats.aggressiveDaily)}/day</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">Recommended: ${Math.round(stats.balancedDaily)}/day (20 clicks)</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-accent/70 via-brand-accent/35 to-transparent" />
          <CardContent className="p-3.5 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Target className="h-3.5 w-3.5 text-brand-accent/80" />
              Top Intent
            </p>
            <p className="text-3xl font-semibold tabular-nums">
              <span className="text-sm">{stats.dominantPct}%</span>{' '}
              <span className="text-xs font-normal text-muted-foreground capitalize">{stats.dominantIntent}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">Dominant conversion profile</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter chips + search */}
      <div className="rounded-lg bg-muted/20 border border-border/70 p-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {INTENT_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setIntentFilter(f.value)}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                intentFilter === f.value
                  ? 'bg-brand-accent text-brand-accent-foreground border-brand-accent'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Max CPC</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder="—"
                value={maxCpcFilter ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setMaxCpcFilter(val === '' ? null : parseFloat(val) || null);
                }}
                className="h-7 w-20 pl-5 text-xs tabular-nums"
              />
            </div>
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search keywords..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-7 w-52 pl-7 text-xs"
            />
          </div>
        </div>
      </div>

      {/* CPC filter impact indicator */}
      {cpcHiddenCount > 0 && maxCpcFilter !== null && (
        <p className="text-[11px] text-muted-foreground">
          Hiding {cpcHiddenCount} keyword{cpcHiddenCount !== 1 ? 's' : ''} with CPC above ${maxCpcFilter.toFixed(2)}
        </p>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-400px)]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
                <TableRow className="border-b border-border/80">
                  <TableHead
                    className={`${sortableHeaderClass} w-[300px]`}
                    onClick={() => handleSort('text')}
                  >
                    Keyword {renderSortIndicator('text')}
                  </TableHead>
                  <TableHead
                    className={`${sortableHeaderClass} text-right w-[80px]`}
                    onClick={() => handleSort('volume')}
                  >
                    Volume {renderSortIndicator('volume')}
                  </TableHead>
                  <TableHead
                    className={`${sortableHeaderClass} text-right w-[70px]`}
                    onClick={() => handleSort('cpc')}
                  >
                    CPC {renderSortIndicator('cpc')}
                  </TableHead>
                  <TableHead
                    className={`${sortableHeaderClass} w-[100px]`}
                    onClick={() => handleSort('intent')}
                  >
                    Intent {renderSortIndicator('intent')}
                  </TableHead>
                  <TableHead
                    className={`${sortableHeaderClass} w-[60px]`}
                    onClick={() => handleSort('quality')}
                  >
                    Quality {renderSortIndicator('quality')}
                  </TableHead>
                  <TableHead className="text-[11px] font-medium w-[80px]">Source</TableHead>
                  <TableHead className="text-[11px] font-medium w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeywords.map(({ kw, originalIndex }) => (
                  <TableRow key={`${kw.text}-${originalIndex}`} className="h-9 group odd:bg-background even:bg-muted/25 hover:bg-muted/40">
                    <TableCell className="text-xs font-mono py-1.5">{kw.text}</TableCell>
                    <TableCell className="text-xs text-right py-1.5 tabular-nums">
                      {kw.volume.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-right py-1.5 tabular-nums">
                      {(kw.cpcLow || kw.cpcHigh) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/40">
                              ${kw.cpc.toFixed(2)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <div className="text-[11px] tabular-nums">
                              <div>Top of page (high): ${(kw.cpcHigh || kw.cpc).toFixed(2)}</div>
                              <div>Top of page (low): ${(kw.cpcLow || kw.cpc).toFixed(2)}</div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span>${kw.cpc.toFixed(2)}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Badge
                        className={`text-[10px] px-1.5 py-0 border-0 capitalize ${intentColors[kw.intent || 'unknown']}`}
                      >
                        {kw.intent || 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5">
                      {kw.qualityRating && (
                        <Badge
                          className={`text-[10px] px-1.5 py-0 border inline-flex items-center gap-1 ${qualityColors[kw.qualityRating] || ''}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${qualityDotColors[kw.qualityRating] || 'bg-muted-foreground'}`} />
                          {kw.qualityRating}
                        </Badge>
                      )}
                      {!kw.qualityRating && <span className="text-[10px] text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-[10px] text-muted-foreground">{kw.source}</span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <button
                        onClick={() => handleRemove(originalIndex)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove keyword "${kw.text}"`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredKeywords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <SearchX className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-xs text-muted-foreground">No keywords match the current filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Removed keywords count + restore option */}
      {removedIndices.size > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{removedIndices.size} keyword{removedIndices.size !== 1 ? 's' : ''} removed</span>
          <button
            onClick={() => setRemovedIndices(new Set())}
            className="text-xs underline hover:text-foreground transition-colors"
          >
            Restore all
          </button>
        </div>
      )}

      {/* Suppressed keywords + competitor brands as negative candidates (#8) */}
      {negativeCandidates.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setShowSuppressed(!showSuppressed)}
            >
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showSuppressed ? 'rotate-90' : ''}`} />
              <span className="text-xs font-medium">Suggested Negative Keywords</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {selectedNegativeKeywords.length} selected
              </Badge>
            </button>
            {showSuppressed && (
              <div className="border-t">
                <ScrollArea className="max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px] w-[30px]" />
                        <TableHead className="text-[11px]">Keyword</TableHead>
                        <TableHead className="text-[11px]">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {negativeCandidates.map((item, idx) => (
                        <TableRow key={`${item.text}-${idx}`} className="h-8">
                          <TableCell className="py-1">
                            <Checkbox
                              checked={!excludedNegatives.has(idx)}
                              onCheckedChange={(checked) => {
                                setExcludedNegatives((prev) => {
                                  const next = new Set(prev);
                                  if (checked) {
                                    next.delete(idx);
                                  } else {
                                    next.add(idx);
                                  }
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-xs font-mono py-1">{item.text}</TableCell>
                          <TableCell className="text-[11px] text-muted-foreground py-1">
                            {item.reasons.join('; ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
