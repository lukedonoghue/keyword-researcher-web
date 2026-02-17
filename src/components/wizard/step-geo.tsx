'use client';

import { useMemo, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { GEO_CONSTANTS } from '@/lib/data/geoConstants';
import { formatServiceArea } from '@/lib/services/geo-detector';

export function StepGeo() {
  const { state, dispatch } = useWorkflow();
  const [manualCountry, setManualCountry] = useState<string | null>(null);

  const selectedCountry = useMemo(() => {
    if (manualCountry) return manualCountry;
    const detectedCountryCode = state.detectedCountryCode;
    if (detectedCountryCode) {
      const detected = GEO_CONSTANTS.find(
        (geo) => geo.countryCode.toUpperCase() === detectedCountryCode.toUpperCase()
      );
      if (detected) return detected.countryCode;
    }
    return state.geoCountryCode || 'US';
  }, [manualCountry, state.detectedCountryCode, state.geoCountryCode]);

  const handleNext = () => {
    const geo = GEO_CONSTANTS.find((g) => g.countryCode === selectedCountry);
    if (geo) {
      dispatch({
        type: 'SET_GEO',
        geoTargetId: geo.geoTargetId,
        languageId: geo.languageId,
        countryCode: geo.countryCode,
        displayName: geo.displayName,
      });
    }
    dispatch({ type: 'SET_STEP', step: 'strategy' });
  };

  const hasAiDetection = Boolean(state.detectedCountryCode);

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-base font-semibold">Geo Targeting</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {hasAiDetection
            ? 'AI detected a service area. Confirm or change the target market.'
            : 'Select the primary market for keyword research.'}
        </p>
      </div>

      {state.detectedServiceArea && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              AI-Detected Service Area
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">auto</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {formatServiceArea(state.detectedServiceArea)}
            </p>
            {!state.detectedServiceArea.isNationwide && (
              <div className="space-y-1">
                {state.detectedServiceArea.cities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Cities:</span>
                    {state.detectedServiceArea.cities.map((city) => (
                      <Badge key={city} variant="outline" className="text-[10px] px-1.5 py-0">
                        {city}
                      </Badge>
                    ))}
                  </div>
                )}
                {state.detectedServiceArea.states.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">States:</span>
                    {state.detectedServiceArea.states.map((st) => (
                      <Badge key={st} variant="outline" className="text-[10px] px-1.5 py-0">
                        {st}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Target Location</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCountry} onValueChange={setManualCountry}>
            <SelectTrigger className="h-8 text-xs w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GEO_CONSTANTS.map((geo) => (
                <SelectItem key={geo.countryCode} value={geo.countryCode} className="text-xs">
                  {geo.displayName}
                  {geo.countryCode === state.detectedCountryCode ? ' (detected)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-8" onClick={() => dispatch({ type: 'SET_STEP', step: 'discover' })}>
          Back
        </Button>
        <Button size="sm" className="h-8" onClick={handleNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
