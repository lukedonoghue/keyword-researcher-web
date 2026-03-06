'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { useWorkflowData } from '@/hooks/use-workflow-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Upload, Pencil, FileSpreadsheet, ArrowRight, ChevronRight, Settings2, TableIcon, List, MapPin } from 'lucide-react';
import { calculateRecommendedBudget, estimatedDailyClicks, estimatedMonthlyConversions } from '@/lib/logic/budget-calculator';
import { CampaignDataTable } from '@/components/wizard/campaign-data-table';
import type { CampaignStructureV2, AdGroupPriority } from '@/lib/types/index';

const priorityColors = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
} as const;

const priorityBarColors = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
} as const;

const intentBarColors = {
  transactional: 'bg-green-500',
  commercial: 'bg-blue-500',
  informational: 'bg-amber-400',
  navigational: 'bg-gray-400',
  unknown: 'bg-gray-300',
} as const;

const adGroupPriorityColors: Record<AdGroupPriority, string> = {
  core: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  recommended: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  additional: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const adGroupPriorityLabels: Record<AdGroupPriority, string> = {
  core: 'Core',
  recommended: 'Recommended',
  additional: 'Additional',
};

function getCampaignStats(campaigns: CampaignStructureV2[]) {
  let totalAdGroups = 0;
  let totalKeywords = 0;
  let totalCpcSum = 0;
  let totalVolumeSum = 0;
  let kwCount = 0;

  for (const campaign of campaigns) {
    totalAdGroups += campaign.adGroups.length;
    for (const ag of campaign.adGroups) {
      for (const st of ag.subThemes) {
        totalKeywords += st.keywords.length;
        for (const kw of st.keywords) {
          totalCpcSum += kw.cpc;
          totalVolumeSum += kw.volume;
          kwCount++;
        }
      }
    }
  }

  const avgCpc = kwCount > 0 ? totalCpcSum / kwCount : 0;
  const estMonthlySpend = avgCpc * 30 * 30;

  return { totalAdGroups, totalKeywords, avgCpc, estMonthlySpend, totalVolumeSum };
}

function getCampaignKeywordCount(campaign: CampaignStructureV2) {
  return campaign.adGroups.reduce(
    (sum, ag) => sum + ag.subThemes.reduce((s, st) => s + st.keywords.length, 0), 0
  );
}

function getCampaignTotalVolume(campaign: CampaignStructureV2) {
  return campaign.adGroups.reduce(
    (sum, ag) => sum + ag.subThemes.reduce(
      (s, st) => s + st.keywords.reduce((v, kw) => v + kw.volume, 0), 0
    ), 0
  );
}

function getCampaignAvgCpc(campaign: CampaignStructureV2, kwCount: number) {
  if (kwCount === 0) return 0;
  return campaign.adGroups.reduce(
    (sum, ag) => sum + ag.subThemes.reduce(
      (s, st) => s + st.keywords.reduce((k, kw) => k + kw.cpc, 0), 0
    ), 0
  ) / kwCount;
}

export function StepCampaign() {
  const { state, dispatch } = useWorkflow();
  const { buildCampaign, isProcessing, error } = useWorkflowData();
  const startedRef = useRef(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [editingCampaignIdx, setEditingCampaignIdx] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showNegatives, setShowNegatives] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [showAdditional, setShowAdditional] = useState(false);

  const keywordsForBudget = useMemo(
    () => (state.enhancedKeywords.length > 0 ? state.enhancedKeywords : state.selectedKeywords),
    [state.enhancedKeywords, state.selectedKeywords]
  );
  const budgetRec = useMemo(() => calculateRecommendedBudget(keywordsForBudget), [keywordsForBudget]);
  const [dailyBudget, setDailyBudget] = useState(() =>
    budgetRec.recommendedDaily > 0 ? budgetRec.recommendedDaily.toFixed(0) : '50'
  );

  const keywordsToBuild = useMemo(
    () => (state.enhancedKeywords.length > 0 ? state.enhancedKeywords : state.selectedKeywords),
    [state.enhancedKeywords, state.selectedKeywords]
  );

  const runBuild = useCallback(async (force: boolean = false) => {
    if (!force && startedRef.current) return;
    startedRef.current = true;
    try {
      await buildCampaign(keywordsToBuild);
    } catch {
      // Error handled by useWorkflowData
    }
  }, [buildCampaign, keywordsToBuild]);

  useEffect(() => {
    if (!startedRef.current && state.campaigns.length === 0) {
      void runBuild();
    }
  }, [runBuild, state.campaigns.length]);

  const stats = useMemo(() => getCampaignStats(state.campaigns), [state.campaigns]);
  const servicesCovered = useMemo(() => {
    const covered = new Set(state.campaigns.map((c) => c.campaignName.replace('Service - ', '')));
    return covered.size;
  }, [state.campaigns]);

  const campaignKwCounts = useMemo(
    () => state.campaigns.map((c) => getCampaignKeywordCount(c)),
    [state.campaigns]
  );
  const maxKwCount = useMemo(
    () => Math.max(...campaignKwCounts, 1),
    [campaignKwCounts]
  );

  // Split ad groups by priority for display
  const adGroupPriorityCounts = useMemo(() => {
    let core = 0, recommended = 0, additional = 0;
    for (const campaign of state.campaigns) {
      for (const ag of campaign.adGroups) {
        if (ag.priority === 'core') core++;
        else if (ag.priority === 'recommended') recommended++;
        else additional++;
      }
    }
    return { core, recommended, additional };
  }, [state.campaigns]);

  // For tree view: split each campaign's ad groups into main vs additional
  const campaignsWithSplit = useMemo(() => {
    return state.campaigns.map((campaign) => {
      const mainGroups = campaign.adGroups.filter((ag) => ag.priority !== 'additional');
      const additionalGroups = campaign.adGroups.filter((ag) => ag.priority === 'additional');
      return { campaign, mainGroups, additionalGroups };
    });
  }, [state.campaigns]);

  const handleExportGoogleAds = useCallback(async () => {
    const res = await fetch('/api/export-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaigns: state.campaigns,
        defaultUrl: state.targetUrl,
        format: 'google-ads-editor',
        negativeKeywords: state.negativeKeywords,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'google_ads_editor_import.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [state.campaigns, state.targetUrl, state.negativeKeywords]);

  const handleExportAnalysis = useCallback(async () => {
    const res = await fetch('/api/export-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaigns: state.campaigns, defaultUrl: state.targetUrl, format: 'analysis' }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign_analysis.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [state.campaigns, state.targetUrl]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/google-ads/create-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaigns: state.campaigns,
          dailyBudgetMicros: Math.round(parseFloat(dailyBudget) * 1_000_000),
          biddingStrategy: 'MAXIMIZE_CONVERSIONS',
          geoTargetIds: state.geoTargets.length > 0
            ? state.geoTargets.map((target) => target.id)
            : [state.geoTargetId],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Import failed' }));
        setImportResult({ success: false, message: (data as { error?: string }).error || 'Import failed' });
        return;
      }
      const data = await res.json() as { created: { campaigns: number; adGroups: number; keywords: number }; errors: string[] };
      const msg = `Created ${data.created.campaigns} campaigns, ${data.created.adGroups} ad groups, and ${data.created.keywords} keywords.${data.errors.length > 0 ? ` ${data.errors.length} errors occurred.` : ''}`;
      setImportResult({ success: true, message: msg });
    } catch (err) {
      setImportResult({ success: false, message: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setImporting(false);
    }
  }, [state.campaigns, state.geoTargetId, state.geoTargets, dailyBudget]);

  const handleStartEditing = useCallback((idx: number) => {
    setEditingCampaignIdx(idx);
    setEditingName(state.campaigns[idx].campaignName);
  }, [state.campaigns]);

  const handleFinishEditing = useCallback(() => {
    if (editingCampaignIdx === null) return;
    const trimmed = editingName.trim();
    const currentName = state.campaigns[editingCampaignIdx].campaignName;
    if (trimmed && trimmed !== currentName) {
      const updatedCampaigns = state.campaigns.map((c, i) =>
        i === editingCampaignIdx ? { ...c, campaignName: trimmed } : c
      );
      const updatedNegativeKeywords = state.negativeKeywords.map((nk) =>
        nk.campaign === currentName ? { ...nk, campaign: trimmed } : nk
      );
      dispatch({ type: 'SET_CAMPAIGNS', campaigns: updatedCampaigns });
      dispatch({ type: 'SET_NEGATIVE_KEYWORDS', negativeKeywords: updatedNegativeKeywords });
    }
    setEditingCampaignIdx(null);
    setEditingName('');
  }, [editingCampaignIdx, editingName, state.campaigns, state.negativeKeywords, dispatch]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFinishEditing();
    } else if (e.key === 'Escape') {
      setEditingCampaignIdx(null);
      setEditingName('');
    }
  }, [handleFinishEditing]);

  // Spend estimates
  const estSpendLow = stats.avgCpc * stats.totalVolumeSum * 0.02;
  const estSpendHigh = stats.avgCpc * stats.totalVolumeSum * 0.05;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Campaign Structure</h2>
            {state.geoDisplayName && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-medium">
                <MapPin className="h-2.5 w-2.5" />
                {state.geoDisplayName}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {state.campaigns.length} campaign{state.campaigns.length !== 1 ? 's' : ''}, {stats.totalKeywords} keyword rows
            {(adGroupPriorityCounts.core > 0 || adGroupPriorityCounts.recommended > 0) && (
              <span className="ml-1">
                &middot; {adGroupPriorityCounts.core} core &middot; {adGroupPriorityCounts.recommended} recommended
                {adGroupPriorityCounts.additional > 0 && <> &middot; {adGroupPriorityCounts.additional} additional</>}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={() => dispatch({ type: 'SET_STEP', step: 'review' })}>
          Back
        </Button>
      </div>

      {/* Settings Summary */}
      <Card>
        <CardContent className="p-0">
          <button
            type="button"
            className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Campaign Settings</span>
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ml-auto ${showSettings ? 'rotate-90' : ''}`} />
          </button>
          {showSettings && (
            <div className="border-t px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Target</p>
                <p className="font-medium truncate">{state.targetUrl || state.targetDomain || '—'}</p>
                {state.businessName && <p className="text-muted-foreground">{state.businessName}</p>}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Location</p>
                <p className="font-medium">{state.geoDisplayName || '—'}</p>
                <p className="text-muted-foreground">Language ID: {state.languageId}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Services ({state.selectedServices.length})</p>
                <p className="font-medium leading-snug">{state.selectedServices.join(', ') || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Strategy</p>
                <p className="font-medium capitalize">{state.strategy.goal}</p>
                <p className="text-muted-foreground">
                  Budget: ${state.strategy.monthlyBudget}/mo &bull; Min vol: {state.strategy.minVolume}
                  {state.strategy.maxCpc ? ` • Max CPC: $${state.strategy.maxCpc}` : ''}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Ad Group Size</p>
                <p className="font-medium">{state.strategy.minAdGroupKeywords}–{state.strategy.maxAdGroupKeywords} keywords</p>
                <p className="text-muted-foreground">
                  {state.strategy.focusHighIntent ? 'High-intent focus' : 'All intents'}
                  {state.strategy.includeInformational ? ' + informational' : ''}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Keywords</p>
                <p className="font-medium">
                  {state.seedKeywords.length} discovered &rarr; {state.selectedKeywords.length} selected
                  {state.enhancedKeywords.length > 0 ? ` → ${state.enhancedKeywords.length} enhanced` : ''}
                </p>
                {state.suppressedKeywords.length > 0 && (
                  <p className="text-muted-foreground">{state.suppressedKeywords.length} suppressed</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Summary Dashboard */}
      {state.campaigns.length > 0 && (
        <Card>
          <CardContent className="py-5 px-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Key metrics */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Campaigns</p>
                    <p className="text-2xl font-bold tabular-nums">{state.campaigns.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ad Groups</p>
                    <p className="text-2xl font-bold tabular-nums">{stats.totalAdGroups}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Keywords</p>
                    <p className="text-2xl font-bold tabular-nums">{stats.totalKeywords.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Coverage</p>
                    <p className="text-2xl font-bold tabular-nums">{servicesCovered} <span className="text-sm font-normal text-muted-foreground">/ {state.selectedServices.length}</span></p>
                  </div>
                </div>
                {/* Highest Priority campaign */}
                {state.campaigns[0]?.priority && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Highest Priority</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{state.campaigns[0].campaignName.replace('Service - ', '')}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[state.campaigns[0].priority]}`}>
                        {state.campaigns[0].priority.charAt(0).toUpperCase() + state.campaigns[0].priority.slice(1)}
                      </span>
                    </div>
                  </div>
                )}
                {/* Estimated monthly spend range */}
                <div className="rounded-md bg-muted/50 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Est. Monthly Spend Range</p>
                  <p className="text-sm font-semibold tabular-nums">
                    ${estSpendLow.toLocaleString(undefined, { maximumFractionDigits: 0 })} &ndash; ${estSpendHigh.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Based on avg CPC of ${stats.avgCpc.toFixed(2)} across {stats.totalVolumeSum.toLocaleString()} monthly search volume
                  </p>
                </div>
              </div>

              {/* Right: Keyword distribution bar chart */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Keyword Distribution</p>
                <div className="space-y-2">
                  {state.campaigns.map((campaign, ci) => {
                    const kwCount = campaignKwCounts[ci];
                    const widthPct = Math.max((kwCount / maxKwCount) * 100, 4);
                    const barColor = campaign.priority ? priorityBarColors[campaign.priority] : 'bg-primary';
                    return (
                      <div key={ci} className="flex items-center gap-2">
                        <div className="w-[120px] min-w-[120px] text-right">
                          <span className="text-[11px] text-muted-foreground truncate block">
                            {campaign.campaignName.replace('Service - ', '')}
                          </span>
                        </div>
                        <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                          <div
                            className={`h-full rounded transition-all duration-300 ${barColor}`}
                            style={{
                              width: `${widthPct}%`,
                              opacity: 0.6 + (kwCount / maxKwCount) * 0.4,
                            }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground min-w-[32px] text-right">
                          {kwCount}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing state */}
      {isProcessing && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Building campaign structure...</span>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3">
            <p className="text-xs text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => void runBuild(true)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* View Toggle */}
      {state.campaigns.length > 0 && (
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode('table')}
          >
            <TableIcon className="h-3.5 w-3.5 mr-1" />
            Table
          </Button>
          <Button
            variant={viewMode === 'tree' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode('tree')}
          >
            <List className="h-3.5 w-3.5 mr-1" />
            Tree
          </Button>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && state.campaigns.length > 0 && (
        <CampaignDataTable campaigns={state.campaigns} />
      )}

      {/* Tree View (original accordions) */}
      {viewMode === 'tree' && campaignsWithSplit.map(({ campaign, mainGroups, additionalGroups }, ci) => {
        const campaignKwCount = campaignKwCounts[ci];
        const campaignAvgCpc = getCampaignAvgCpc(campaign, campaignKwCount);
        const campaignTotalVolume = getCampaignTotalVolume(campaign);
        const campEstLow = campaignAvgCpc * campaignTotalVolume * 0.02;
        const campEstHigh = campaignAvgCpc * campaignTotalVolume * 0.05;

        const renderAdGroup = (adGroup: typeof campaign.adGroups[number], agi: number, defaultOpen: boolean) => {
          const agKwCount = adGroup.subThemes.reduce((s, st) => s + st.keywords.length, 0);
          return (
            <AccordionItem key={agi} value={`ag-${ci}-${agi}`}>
              <AccordionTrigger className="text-xs py-2 hover:no-underline">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Ad Group: {adGroup.name}</span>
                  {adGroup.priority && (
                    <span className={`text-[9px] px-1.5 py-0 rounded-full font-medium ${adGroupPriorityColors[adGroup.priority]}`}>
                      {adGroupPriorityLabels[adGroup.priority]}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {agKwCount} kw
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="ml-2 space-y-2">
                  {adGroup.subThemes.map((subTheme, sti) => (
                    <Accordion key={sti} type="multiple" className="w-full">
                      <AccordionItem value={`st-${ci}-${agi}-${sti}`} className="border-l-2 border-muted pl-3">
                        <AccordionTrigger className="text-[11px] py-1.5 hover:no-underline">
                          <div className="flex items-center gap-2">
                            <span>{subTheme.name}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {subTheme.keywords.length} kw
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[10px]">Keyword</TableHead>
                                <TableHead className="text-[10px]">Match</TableHead>
                                <TableHead className="text-[10px] text-right">Vol</TableHead>
                                <TableHead className="text-[10px] text-right">CPC</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subTheme.keywords.map((kw, ki) => (
                                <TableRow key={ki} className="h-7">
                                  <TableCell className="text-[11px] font-mono py-0.5">
                                    {kw.matchType === 'Exact' ? `[${kw.keyword}]` : kw.matchType === 'Phrase' ? `"${kw.keyword}"` : kw.keyword}
                                  </TableCell>
                                  <TableCell className="text-[11px] py-0.5">{kw.matchType}</TableCell>
                                  <TableCell className="text-[11px] text-right py-0.5 tabular-nums">{kw.volume.toLocaleString()}</TableCell>
                                  <TableCell className="text-[11px] text-right py-0.5 tabular-nums">
                                    {kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : <span className="text-[10px] text-muted-foreground italic">Low data</span>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        };

        return (
          <Card key={ci}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {editingCampaignIdx === ci ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleFinishEditing}
                      onKeyDown={handleEditKeyDown}
                      autoFocus
                      className="h-7 text-sm font-semibold max-w-[400px]"
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 group text-left min-w-0"
                      onClick={() => handleStartEditing(ci)}
                      title="Click to rename campaign"
                    >
                      <CardTitle className="text-sm truncate">{campaign.campaignName}</CardTitle>
                      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0 ml-2">
                  {campaign.priority && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[campaign.priority]}`}>
                      {campaign.priority.charAt(0).toUpperCase() + campaign.priority.slice(1)}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {campaign.adGroups.length} ad group{campaign.adGroups.length !== 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {campaignKwCount} kw
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-1">
                {campaign.campaignTheme && <span>Theme: {campaign.campaignTheme}</span>}
                {campaign.landingPage && (
                  <span className="font-mono truncate max-w-[300px]">{campaign.landingPage}</span>
                )}
                <span>Avg CPC: ${campaignAvgCpc.toFixed(2)}</span>
                <span>Bid: {campaign.bidStrategy}</span>
                <span className="font-medium text-foreground/70">
                  Est. monthly: ${campEstLow.toLocaleString(undefined, { maximumFractionDigits: 0 })}&ndash;${campEstHigh.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                {campaign.recommendedBidStrategy && (
                  <span className="text-primary/80">Recommended: {campaign.recommendedBidStrategy}</span>
                )}
              </div>
              {/* Intent breakdown bar */}
              {campaign.intentBreakdown && (() => {
                const ib = campaign.intentBreakdown;
                const total = ib.transactional + ib.commercial + ib.informational + ib.navigational + ib.unknown;
                if (total === 0) return null;
                const segments = [
                  { key: 'transactional' as const, count: ib.transactional, label: 'Transactional' },
                  { key: 'commercial' as const, count: ib.commercial, label: 'Commercial' },
                  { key: 'informational' as const, count: ib.informational, label: 'Informational' },
                  { key: 'navigational' as const, count: ib.navigational, label: 'Navigational' },
                  { key: 'unknown' as const, count: ib.unknown, label: 'Unknown' },
                ].filter((s) => s.count > 0);
                return (
                  <div className="mt-1.5">
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
                      {segments.map((seg) => (
                        <div
                          key={seg.key}
                          className={`${intentBarColors[seg.key]} transition-all duration-300`}
                          style={{ width: `${(seg.count / total) * 100}%` }}
                          title={`${seg.label}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)`}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {segments.map((seg) => (
                        <span key={seg.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${intentBarColors[seg.key]}`} />
                          {seg.label} {Math.round((seg.count / total) * 100)}%
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </CardHeader>
            <CardContent className="pt-0">
              {/* Core + Recommended ad groups (expanded) */}
              <Accordion type="multiple" defaultValue={mainGroups.map((_, agi) => `ag-${ci}-${agi}`)} className="w-full">
                {mainGroups.map((adGroup, agi) => renderAdGroup(adGroup, agi, true))}
              </Accordion>

              {/* Additional Opportunities (collapsed) */}
              {additionalGroups.length > 0 && (
                <div className="mt-3 border rounded-md">
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => setShowAdditional(!showAdditional)}
                  >
                    <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showAdditional ? 'rotate-90' : ''}`} />
                    <span className="text-xs font-medium text-muted-foreground">Additional Opportunities</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {additionalGroups.length} ad group{additionalGroups.length !== 1 ? 's' : ''}
                    </Badge>
                  </button>
                  {showAdditional && (
                    <div className="border-t px-2">
                      <Accordion type="multiple" className="w-full">
                        {additionalGroups.map((adGroup, agi) => renderAdGroup(adGroup, mainGroups.length + agi, false))}
                      </Accordion>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Negative Keywords (#1) */}
      {state.negativeKeywords.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setShowNegatives(!showNegatives)}
            >
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showNegatives ? 'rotate-90' : ''}`} />
              <span className="text-xs font-medium">Negative Keywords</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {state.negativeKeywords.length}
              </Badge>
            </button>
            {showNegatives && (
              <div className="border-t px-4 py-2">
                <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                  {state.negativeKeywords.map((nk, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="font-mono text-muted-foreground">{nk.keyword}</span>
                      <span className="text-[10px] text-muted-foreground/60">{nk.matchType}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  These keywords are included in the Google Ads Editor CSV export.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Export Action Cards */}
      {state.campaigns.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Card 1: Download for Google Ads Editor */}
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="py-5 px-5 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2 shrink-0">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Download for Google Ads Editor</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      CSV file formatted for bulk import into Google Ads Editor
                    </p>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={handleExportGoogleAds}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download CSV
                </Button>
              </CardContent>
            </Card>

            {/* Card 2: Import Directly to Google Ads */}
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="py-5 px-5 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2 shrink-0">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Import Directly to Google Ads</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Create campaigns directly in your linked Google Ads account
                    </p>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Import to Google Ads
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Smaller analysis export link */}
          <div className="text-center">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              onClick={handleExportAnalysis}
            >
              Download full analysis CSV
            </button>
          </div>
        </div>
      )}

      {/* What's Next Guidance */}
      {state.campaigns.length > 0 && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              What&apos;s Next?
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="rounded-full bg-primary/20 text-primary text-[10px] font-bold h-4 w-4 flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>Download the Google Ads Editor CSV and import it for fine-tuning before going live</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="rounded-full bg-primary/20 text-primary text-[10px] font-bold h-4 w-4 flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>Or import directly to create paused campaigns you can review in Google Ads</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="rounded-full bg-primary/20 text-primary text-[10px] font-bold h-4 w-4 flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>Review your ad groups and adjust bids based on your competition level</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Import to Google Ads Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import to Google Ads</DialogTitle>
            <DialogDescription>
              This will create {state.campaigns.length} campaign{state.campaigns.length !== 1 ? 's' : ''},{' '}
              {stats.totalAdGroups} ad group{stats.totalAdGroups !== 1 ? 's' : ''}, and{' '}
              {stats.totalKeywords.toLocaleString()} keywords in your Google Ads account.
              All campaigns will be created as PAUSED — you will need to enable them in Google Ads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="daily-budget" className="text-xs">Daily Budget (USD)</Label>
              <Input
                id="daily-budget"
                type="number"
                min="1"
                step="1"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Estimated monthly spend: ${(parseFloat(dailyBudget || '0') * 30.4).toFixed(0)}/mo
              </p>
            </div>
            {budgetRec.avgCpc > 0 && (
              <div className="rounded-md bg-muted/50 px-3 py-2 space-y-0.5">
                <p className="text-[11px] text-muted-foreground">
                  Avg CPC: ${budgetRec.avgCpc.toFixed(2)} &bull; ~{estimatedDailyClicks(parseFloat(dailyBudget || '0'), budgetRec.avgCpc).toFixed(0)} clicks/day
                  &bull; ~{estimatedMonthlyConversions(parseFloat(dailyBudget || '0'), budgetRec.avgCpc).toFixed(1)} conversions/mo at 5% CR
                </p>
              </div>
            )}
          </div>
          {importResult && (
            <div className={`rounded-md p-3 text-xs ${importResult.success ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
              {importResult.message}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent mr-1.5" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
