'use client';

import { useMemo, useState } from 'react';
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
import {
  buildReviewNegativeKeywordLists,
  flattenReviewNegativeKeywords,
  mergeReviewNegativeKeywordLists,
} from '@/lib/logic/negative-keywords';

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
  const [openNegativeLists, setOpenNegativeLists] = useState<Record<string, boolean>>({
    competitor: true,
    universal: true,
    brand: false,
    funnel: false,
  });

  const suppressedKeywords = state.enhancedSuppressed.length > 0 ? state.enhancedSuppressed : state.suppressedKeywords;

  const generatedNegativeLists = useMemo(
    () => buildReviewNegativeKeywordLists({
      suppressedKeywords,
      competitorNames: state.competitorNames,
      businessName: state.businessName,
      targetDomain: state.targetDomain,
      enableBrandList: state.strategy.brandCampaignMode === 'separate',
    }),
    [suppressedKeywords, state.businessName, state.competitorNames, state.strategy.brandCampaignMode, state.targetDomain]
  );

  const reviewNegativeLists = useMemo(
    () => mergeReviewNegativeKeywordLists(generatedNegativeLists, state.reviewNegativeKeywordLists),
    [generatedNegativeLists, state.reviewNegativeKeywordLists]
  );

  const selectedNegativeKeywords = useMemo(
    () => flattenReviewNegativeKeywords(reviewNegativeLists),
    [reviewNegativeLists]
  );

  const enabledNegativeCounts = useMemo(
    () =>
      Object.fromEntries(
        reviewNegativeLists.map((list) => [
          list.name,
          list.items.filter((item) => item.enabled).length,
        ])
      ) as Record<string, number>,
    [reviewNegativeLists]
  );

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

  const setNegativeItemEnabled = (listName: string, itemIndex: number, enabled: boolean) => {
    dispatch({
      type: 'SET_REVIEW_NEGATIVE_KEYWORD_LISTS',
      lists: reviewNegativeLists.map((list) =>
        list.name === listName
          ? {
            ...list,
            items: list.items.map((item, index) =>
              index === itemIndex ? { ...item, enabled } : item
            ),
          }
          : list
      ),
    });
  };

  const setAllNegativeItemsEnabled = (listName: string, enabled: boolean) => {
    dispatch({
      type: 'SET_REVIEW_NEGATIVE_KEYWORD_LISTS',
      lists: reviewNegativeLists.map((list) =>
        list.name === listName
          ? {
            ...list,
            items: list.items.map((item) => ({ ...item, enabled })),
          }
          : list
      ),
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
    dispatch({ type: 'SET_REVIEW_NEGATIVE_KEYWORD_LISTS', lists: reviewNegativeLists });
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
      <Card className="md:hidden">
        <CardContent className="p-0">
          {filteredKeywords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <SearchX className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No keywords match the current filters.</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-360px)]">
              <div className="divide-y divide-border/70">
                {filteredKeywords.map(({ kw, originalIndex }) => (
                  <div key={`${kw.text}-${originalIndex}`} className="px-3 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-mono leading-5">{kw.text}</p>
                      <button
                        onClick={() => handleRemove(originalIndex)}
                        className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove keyword "${kw.text}"`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={`text-[10px] px-1.5 py-0 border-0 capitalize ${intentColors[kw.intent || 'unknown']}`}>
                        {kw.intent || 'unknown'}
                      </Badge>
                      {kw.qualityRating ? (
                        <Badge className={`text-[10px] px-1.5 py-0 border inline-flex items-center gap-1 ${qualityColors[kw.qualityRating] || ''}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${qualityDotColors[kw.qualityRating] || 'bg-muted-foreground'}`} />
                          {kw.qualityRating}
                        </Badge>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground">{kw.source}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <p className="text-muted-foreground uppercase tracking-wide">Volume</p>
                        <p className="tabular-nums">{kw.volume.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground uppercase tracking-wide">CPC</p>
                        <p className="tabular-nums">
                          ${kw.cpc.toFixed(2)}
                          {(kw.cpcLow || kw.cpcHigh) ? (
                            <span className="block text-[10px] text-muted-foreground">
                              ${(kw.cpcLow || kw.cpc).toFixed(2)}–${(kw.cpcHigh || kw.cpc).toFixed(2)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="hidden md:block">
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

      {/* Structured negative keyword review */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Negative Keyword Lists</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Review shared exclusions before build. Routing negatives are generated after the campaign structure is built, and brand exclusions stay off unless you explicitly enable them.
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {selectedNegativeKeywords.length} selected
          </Badge>
        </div>

        {state.strategy.competitorCampaignMode === 'separate' && (
          <Card className="border-brand-accent/30 bg-brand-accent/5">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                Competitor handling is set to <span className="font-medium text-foreground">Build Competitor Campaign</span>.
                Competitor negatives will still be applied to standard campaigns, and a separate competitor campaign will be created when matching terms exist.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {reviewNegativeLists.map((list) => (
            <Card key={`${list.name}-summary`} className="border-border/70">
              <CardContent className="px-3 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">{list.label}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {enabledNegativeCounts[list.name] ?? 0}
                    {list.name !== 'funnel' && list.items.length > 0 ? ` / ${list.items.length}` : ''}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{list.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {reviewNegativeLists.map((list) => {
          const isOpen = openNegativeLists[list.name] ?? false;
          const enabledCount = enabledNegativeCounts[list.name] ?? 0;
          const isPlaceholder = list.name === 'funnel' && list.items.length === 0;

          return (
            <Card key={list.name}>
              <CardContent className="p-0">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setOpenNegativeLists((prev) => ({ ...prev, [list.name]: !isOpen }))}
                >
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="text-xs font-medium">{list.label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {enabledCount} enabled
                  </Badge>
                </button>
                {isOpen && (
                  <div className="border-t">
                    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">{list.description}</p>
                      {!isPlaceholder && list.items.length > 0 && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                            onClick={() => setAllNegativeItemsEnabled(list.name, true)}
                          >
                            Enable all
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                            onClick={() => setAllNegativeItemsEnabled(list.name, false)}
                          >
                            Clear all
                          </button>
                        </div>
                      )}
                    </div>

                    {isPlaceholder ? (
                      <div className="px-4 py-3">
                        <p className="text-[11px] text-muted-foreground">
                          Funnel negatives are generated from the final campaign structure so catch-all ad groups can hand off specific queries to more focused ad groups and campaigns.
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-[300px] overflow-auto">
                        <Table className="min-w-[760px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[11px] w-[30px]" />
                              <TableHead className="text-[11px]">Keyword</TableHead>
                              <TableHead className="text-[11px]">Match</TableHead>
                              <TableHead className="text-[11px]">Source</TableHead>
                              <TableHead className="text-[11px]">Reason</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {list.items.map((item, index) => (
                              <TableRow key={`${list.name}-${item.keyword}-${index}`} className="h-8">
                                <TableCell className="py-1">
                                  <Checkbox
                                    checked={item.enabled}
                                    onCheckedChange={(checked) => setNegativeItemEnabled(list.name, index, !!checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-xs font-mono py-1">
                                  {item.keyword}
                                  {item.variants && item.variants.length > 1 && (
                                    <span className="ml-2 text-[10px] text-muted-foreground">
                                      +{item.variants.length - 1} variant{item.variants.length - 1 === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-[11px] py-1">{item.matchType}</TableCell>
                                <TableCell className="text-[11px] py-1 capitalize text-muted-foreground">
                                  {item.source.replace(/_/g, ' ')}
                                </TableCell>
                                <TableCell className="text-[11px] text-muted-foreground py-1">
                                  {item.reasons.join('; ')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
