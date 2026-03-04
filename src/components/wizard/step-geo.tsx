'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { GEO_CONSTANTS } from '@/lib/data/geoConstants';
import { formatServiceArea } from '@/lib/services/geo-detector';
import type { GeoLocationSuggestion } from '@/lib/types/geo';

type GeoSearchResult = GeoLocationSuggestion & { searching?: boolean };

export function StepGeo() {
  const { state, dispatch } = useWorkflow();
  const [manualCountry, setManualCountry] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeoSearchResult[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<GeoLocationSuggestion[]>(state.geoTargets);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoPopulatedRef = useRef(false);

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

  const searchLocations = useCallback(async (query: string, countryCode: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch('/api/google-ads/geo-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, countryCode }),
      });
      if (res.ok) {
        const data = await res.json() as { locations: GeoLocationSuggestion[] };
        setSearchResults(Array.isArray(data.locations) ? data.locations : []);
        setShowResults(true);
      }
    } catch {
      // silently fail
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      void searchLocations(searchQuery, selectedCountry);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, selectedCountry, searchLocations]);

  // Auto-populate from AI detection
  useEffect(() => {
    if (autoPopulatedRef.current) return;
    if (state.geoTargets.length > 0) {
      setSelectedLocations(state.geoTargets);
      autoPopulatedRef.current = true;
      return;
    }
    const cities = state.detectedServiceArea?.cities ?? [];
    if (cities.length === 0) return;
    autoPopulatedRef.current = true;

    async function autoSearch() {
      const results: GeoLocationSuggestion[] = [];
      for (const city of cities) {
        try {
          const res = await fetch('/api/google-ads/geo-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: city, countryCode: selectedCountry }),
          });
          if (res.ok) {
            const data = await res.json() as { locations: GeoLocationSuggestion[] };
            const locations = Array.isArray(data.locations) ? data.locations : [];
            // Pick the first City-type result, or the first result
            const match = locations.find((l) => l.targetType === 'City') || locations[0];
            if (match && !results.some((r) => r.id === match.id)) {
              results.push(match);
            }
          }
        } catch {
          // skip failed lookups
        }
      }
      if (results.length > 0) {
        setSelectedLocations(results);
      }
    }
    void autoSearch();
  }, [state.detectedServiceArea?.cities, state.geoTargets, selectedCountry]);

  // Close results dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        resultsRef.current && !resultsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const addLocation = (location: GeoLocationSuggestion) => {
    if (!selectedLocations.some((l) => l.id === location.id)) {
      setSelectedLocations((prev) => [...prev, location]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const removeLocation = (id: string) => {
    setSelectedLocations((prev) => prev.filter((l) => l.id !== id));
  };

  const handleNext = () => {
    const geo = GEO_CONSTANTS.find((g) => g.countryCode === selectedCountry);
    const languageId = geo?.languageId || '1000';

    if (selectedLocations.length > 0) {
      dispatch({
        type: 'SET_GEO_TARGETS',
        targets: selectedLocations,
        languageId,
      });
    } else if (geo) {
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

  const handleCountryChange = (countryCode: string) => {
    setManualCountry(countryCode);
    // Clear specific locations when country changes
    setSelectedLocations([]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const hasAiDetection = Boolean(state.detectedCountryCode);

  const targetTypeBadgeVariant = (type: string): 'default' | 'secondary' | 'outline' => {
    switch (type) {
      case 'City': return 'default';
      case 'State':
      case 'Province':
      case 'Region': return 'secondary';
      default: return 'outline';
    }
  };

  const formatReach = (reach: number): string => {
    if (reach >= 1_000_000) return `${(reach / 1_000_000).toFixed(1)}M`;
    if (reach >= 1_000) return `${(reach / 1_000).toFixed(0)}K`;
    return String(reach);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-base font-semibold">Geo Targeting</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {hasAiDetection
            ? 'AI detected a service area. Confirm or change the target location.'
            : 'Select the target market for keyword research.'}
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
        <CardContent className="space-y-4">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Country</label>
            <Select value={selectedCountry} onValueChange={handleCountryChange}>
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
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
              Specific locations <span className="font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Search for a city, state, or region..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                className="h-8 text-xs"
              />
              {isSearching && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                </div>
              )}
              {showResults && searchResults.length > 0 && (
                <div
                  ref={resultsRef}
                  className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto"
                >
                  {searchResults.map((loc) => {
                    const isSelected = selectedLocations.some((s) => s.id === loc.id);
                    return (
                      <button
                        key={loc.id}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center justify-between gap-2 ${isSelected ? 'opacity-50' : ''}`}
                        onClick={() => !isSelected && addLocation(loc)}
                        disabled={isSelected}
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{loc.name}</span>
                          {loc.canonicalName !== loc.name && (
                            <span className="text-muted-foreground ml-1">{loc.canonicalName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {loc.reach > 0 && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">{formatReach(loc.reach)}</span>
                          )}
                          <Badge variant={targetTypeBadgeVariant(loc.targetType)} className="text-[9px] px-1 py-0">
                            {loc.targetType}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedLocations.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {selectedLocations.map((loc) => (
                    <Badge key={loc.id} variant="secondary" className="text-[11px] px-2 py-0.5 gap-1">
                      {loc.name}
                      <button
                        className="ml-0.5 hover:text-destructive"
                        onClick={() => removeLocation(loc.id)}
                        aria-label={`Remove ${loc.name}`}
                      >
                        &times;
                      </button>
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Using {selectedLocations.length} specific location{selectedLocations.length !== 1 ? 's' : ''} for keyword research
                </p>
              </div>
            )}
            {selectedLocations.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                No specific locations selected &mdash; using entire country.
              </p>
            )}
          </div>
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
