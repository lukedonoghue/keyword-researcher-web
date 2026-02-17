'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { useWorkflowData } from '@/hooks/use-workflow-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function StepCampaign() {
  const { state, dispatch } = useWorkflow();
  const { buildCampaign, exportCsv, isProcessing, error } = useWorkflowData();
  const startedRef = useRef(false);

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

  const totalKeywords = state.campaigns.reduce(
    (sum, c) => sum + Object.values(c.adGroups).reduce((s, g) => s + g.length, 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Campaign Structure</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {state.campaigns.length} campaign{state.campaigns.length !== 1 ? 's' : ''}, {totalKeywords} keyword rows.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => dispatch({ type: 'SET_STEP', step: 'review' })}>
            Back
          </Button>
          <Button size="sm" className="h-8" onClick={exportCsv} disabled={state.campaigns.length === 0}>
            Download CSV
          </Button>
        </div>
      </div>

      {isProcessing && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Building campaign structure...</span>
          </CardContent>
        </Card>
      )}

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

      {state.campaigns.map((campaign, ci) => (
        <Card key={ci}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{campaign.campaignName}</CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {Object.keys(campaign.adGroups).length} ad groups
              </Badge>
            </div>
            {campaign.landingPage && (
              <p className="text-[11px] text-muted-foreground font-mono truncate">{campaign.landingPage}</p>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <Accordion type="multiple" className="w-full">
              {Object.entries(campaign.adGroups).map(([groupName, keywords]) => (
                <AccordionItem key={groupName} value={groupName}>
                  <AccordionTrigger className="text-xs py-2 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span>{groupName}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {keywords.length} kw
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
                        {keywords.map((kw, ki) => (
                          <TableRow key={ki} className="h-7">
                            <TableCell className="text-[11px] font-mono py-0.5">{kw.keyword}</TableCell>
                            <TableCell className="text-[11px] py-0.5">{kw.matchType}</TableCell>
                            <TableCell className="text-[11px] text-right py-0.5 tabular-nums">{kw.volume.toLocaleString()}</TableCell>
                            <TableCell className="text-[11px] text-right py-0.5 tabular-nums">${kw.cpc.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
