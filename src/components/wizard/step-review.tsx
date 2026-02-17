'use client';

import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

const intentColors: Record<string, string> = {
  transactional: 'bg-green-100 text-green-800 border-green-200',
  commercial: 'bg-blue-100 text-blue-800 border-blue-200',
  informational: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  navigational: 'bg-gray-100 text-gray-800 border-gray-200',
  unknown: 'bg-gray-100 text-gray-500 border-gray-200',
};

const qualityColors: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  'A': 'bg-green-100 text-green-800',
  'B+': 'bg-blue-100 text-blue-800',
  'B': 'bg-sky-100 text-sky-800',
  'C': 'bg-yellow-100 text-yellow-800',
  'D': 'bg-red-100 text-red-800',
};

export function StepReview() {
  const { state, dispatch } = useWorkflow();
  const keywords = state.enhancedKeywords.length > 0 ? state.enhancedKeywords : state.selectedKeywords;

  const handleNext = () => {
    dispatch({ type: 'SET_STEP', step: 'campaign' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Keyword Review</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {keywords.length} keywords ready for campaign building.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => dispatch({ type: 'SET_STEP', step: 'enhance' })}>
            Back
          </Button>
          <Button size="sm" className="h-8" onClick={handleNext}>
            Build Campaign
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-medium w-[300px]">Keyword</TableHead>
                  <TableHead className="text-[11px] font-medium text-right w-[80px]">Volume</TableHead>
                  <TableHead className="text-[11px] font-medium text-right w-[70px]">CPC</TableHead>
                  <TableHead className="text-[11px] font-medium w-[100px]">Intent</TableHead>
                  <TableHead className="text-[11px] font-medium w-[60px]">Quality</TableHead>
                  <TableHead className="text-[11px] font-medium w-[80px]">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((kw, idx) => (
                  <TableRow key={`${kw.text}-${idx}`} className="h-8">
                    <TableCell className="text-xs font-mono py-1">{kw.text}</TableCell>
                    <TableCell className="text-xs text-right py-1 tabular-nums">
                      {kw.volume.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-right py-1 tabular-nums">
                      ${kw.cpc.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${intentColors[kw.intent || 'unknown']}`}>
                        {kw.intent || 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1">
                      {kw.qualityRating && (
                        <Badge className={`text-[10px] px-1.5 py-0 border ${qualityColors[kw.qualityRating] || ''}`}>
                          {kw.qualityRating}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      <span className="text-[10px] text-muted-foreground">{kw.source}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
