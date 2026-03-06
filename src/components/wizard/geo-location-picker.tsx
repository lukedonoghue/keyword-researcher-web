'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { GEO_CONSTANTS } from '@/lib/data/geoConstants';
import { formatServiceArea } from '@/lib/services/geo-detector';
import type { GeoLocationSuggestion, ServiceArea } from '@/lib/types/geo';

type MatchStatus = 'idle' | 'loading' | 'matched' | 'no-match';

type GeoLocationPickerProps = {
  initialCountryCode: string;
  initialLocations: GeoLocationSuggestion[];
  detectedServiceArea: ServiceArea | null;
  detectedCountryCode: string | null;
  onConfirm: (locations: GeoLocationSuggestion[], countryCode: string, languageId: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function GeoLocationPicker({
  initialCountryCode,
  initialLocations,
  detectedServiceArea,
  detectedCountryCode,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}: GeoLocationPickerProps) {
  const [manualCountry, setManualCountry] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeoLocationSuggestion[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<GeoLocationSuggestion[]>(initialLocations);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoPopulatedRef = useRef(false);

  // Match status tracking for detected cities/states
  const [matchStatuses, setMatchStatuses] = useState<Record<string, MatchStatus>>({});
  const [matchResults, setMatchResults] = useState<Record<string, GeoLocationSuggestion>>({});
  const [autoPopulating, setAutoPopulating] = useState(false);
  const [autoPopulateProgress, setAutoPopulateProgress] = useState({ done: 0, total: 0 });
  const [autoPopulateSummary, setAutoPopulateSummary] = useState<{ matched: number; total: number } | null>(null);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const inlineMessageTimerRef = useRef<NodeJS.Timeout | null>(null);

  const selectedCountry = useMemo(() => {
    if (manualCountry) return manualCountry;
    if (initialCountryCode) return initialCountryCode;
    if (detectedCountryCode) {
      const detected = GEO_CONSTANTS.find(
        (geo) => geo.countryCode.toUpperCase() === detectedCountryCode.toUpperCase()
      );
      if (detected) return detected.countryCode;
    }
    return 'US';
  }, [manualCountry, detectedCountryCode, initialCountryCode]);

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
      // silently fail for manual search
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Reusable helper: search GKP for a location name and return the best match
  const searchAndMatch = useCallback(async (name: string, countryCode: string): Promise<GeoLocationSuggestion | null> => {
    try {
      const res = await fetch('/api/google-ads/geo-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name, countryCode }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { locations: GeoLocationSuggestion[] };
      const locations = Array.isArray(data.locations) ? data.locations : [];
      return locations.find((l) => l.targetType === 'City') || locations[0] || null;
    } catch {
      return null;
    }
  }, []);

  // Show an inline message that auto-dismisses
  const showInlineMessage = useCallback((msg: string) => {
    if (inlineMessageTimerRef.current) clearTimeout(inlineMessageTimerRef.current);
    setInlineMessage(msg);
    inlineMessageTimerRef.current = setTimeout(() => setInlineMessage(null), 5000);
  }, []);

  // Handle clicking a detected location badge
  const handleDetectedLocationClick = useCallback(async (name: string) => {
    const status = matchStatuses[name];

    // If loading, do nothing
    if (status === 'loading') return;

    // If already matched, toggle selection
    if (status === 'matched') {
      const matchedLoc = matchResults[name];
      if (!matchedLoc) return;
      const isSelected = selectedLocations.some((l) => l.id === matchedLoc.id);
      if (isSelected) {
        setSelectedLocations((prev) => prev.filter((l) => l.id !== matchedLoc.id));
      } else {
        setSelectedLocations((prev) => [...prev, matchedLoc]);
      }
      return;
    }

    // If idle or no-match, try searching
    setMatchStatuses((prev) => ({ ...prev, [name]: 'loading' }));
    const result = await searchAndMatch(name, selectedCountry);
    if (result) {
      setMatchStatuses((prev) => ({ ...prev, [name]: 'matched' }));
      setMatchResults((prev) => ({ ...prev, [name]: result }));
      // Add to selected if not already there
      setSelectedLocations((prev) => {
        if (prev.some((l) => l.id === result.id)) return prev;
        return [...prev, result];
      });
    } else {
      setMatchStatuses((prev) => ({ ...prev, [name]: 'no-match' }));
      showInlineMessage(`"${name}" not found in Google Keyword Planner. Try searching for a broader area.`);
    }
  }, [matchStatuses, matchResults, selectedLocations, selectedCountry, searchAndMatch, showInlineMessage]);

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

  // Auto-populate from AI detection with progress tracking
  useEffect(() => {
    if (autoPopulatedRef.current) return;
    if (initialLocations.length > 0) {
      setSelectedLocations(initialLocations);
      autoPopulatedRef.current = true;
      return;
    }
    const cities = detectedServiceArea?.cities ?? [];
    const states = detectedServiceArea?.states ?? [];
    const allNames = [...cities, ...states];
    if (allNames.length === 0) return;

    let cancelled = false;

    async function autoSearch() {
      setAutoPopulating(true);
      setAutoPopulateProgress({ done: 0, total: allNames.length });
      setAutoPopulateSummary(null);

      const seen = new Set<string>();
      const results: GeoLocationSuggestion[] = [];
      let matchedCount = 0;
      let doneCount = 0;

      // Process sequentially to show progress and avoid overwhelming the API
      for (const name of allNames) {
        if (cancelled) return;

        setMatchStatuses((prev) => ({ ...prev, [name]: 'loading' }));

        const result = await searchAndMatch(name, selectedCountry);
        doneCount++;

        if (cancelled) return;

        if (result) {
          setMatchStatuses((prev) => ({ ...prev, [name]: 'matched' }));
          setMatchResults((prev) => ({ ...prev, [name]: result }));
          if (!seen.has(result.id)) {
            seen.add(result.id);
            results.push(result);
          }
          matchedCount++;
        } else {
          setMatchStatuses((prev) => ({ ...prev, [name]: 'no-match' }));
        }

        setAutoPopulateProgress({ done: doneCount, total: allNames.length });
      }

      if (cancelled) return;

      if (results.length > 0) {
        setSelectedLocations(results);
      }
      setAutoPopulating(false);
      setAutoPopulateSummary({ matched: matchedCount, total: allNames.length });
      autoPopulatedRef.current = true;
    }

    void autoSearch();

    return () => { cancelled = true; };
  }, [detectedServiceArea?.cities, detectedServiceArea?.states, initialLocations, selectedCountry, searchAndMatch]);

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

  const handleConfirm = () => {
    const geo = GEO_CONSTANTS.find((g) => g.countryCode === selectedCountry);
    const languageId = geo?.languageId || '1000';
    onConfirm(selectedLocations, selectedCountry, languageId);
  };

  const handleCountryChange = (countryCode: string) => {
    setManualCountry(countryCode);
    setSelectedLocations([]);
    setSearchQuery('');
    setSearchResults([]);
  };

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
    <div className="space-y-4">
      {detectedServiceArea && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              AI-Detected Service Area
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">auto</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {formatServiceArea(detectedServiceArea)}
            </p>
            {!detectedServiceArea.isNationwide && (
              <div className="space-y-1.5">
                {detectedServiceArea.cities.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-muted-foreground mr-1">Cities:</span>
                    {detectedServiceArea.cities.map((city) => (
                      <DetectedBadge
                        key={city}
                        name={city}
                        status={matchStatuses[city] || 'idle'}
                        isSelected={
                          matchStatuses[city] === 'matched' && matchResults[city]
                            ? selectedLocations.some((l) => l.id === matchResults[city].id)
                            : false
                        }
                        onClick={() => handleDetectedLocationClick(city)}
                      />
                    ))}
                  </div>
                )}
                {detectedServiceArea.states.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-muted-foreground mr-1">States:</span>
                    {detectedServiceArea.states.map((st) => (
                      <DetectedBadge
                        key={st}
                        name={st}
                        status={matchStatuses[st] || 'idle'}
                        isSelected={
                          matchStatuses[st] === 'matched' && matchResults[st]
                            ? selectedLocations.some((l) => l.id === matchResults[st].id)
                            : false
                        }
                        onClick={() => handleDetectedLocationClick(st)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Auto-populate progress */}
            {autoPopulating && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent shrink-0" />
                Matching detected locations... ({autoPopulateProgress.done}/{autoPopulateProgress.total})
              </div>
            )}

            {/* Auto-populate summary */}
            {!autoPopulating && autoPopulateSummary && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Matched {autoPopulateSummary.matched} of {autoPopulateSummary.total} locations
                {autoPopulateSummary.total - autoPopulateSummary.matched > 0 && (
                  <span> &middot; {autoPopulateSummary.total - autoPopulateSummary.matched} not found</span>
                )}
              </p>
            )}

            {/* Inline no-match message */}
            {inlineMessage && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                {inlineMessage}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
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
                  {geo.countryCode === detectedCountryCode ? ' (detected)' : ''}
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
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" size="sm" className="h-8" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="brand" size="sm" className="h-8" onClick={handleConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

// Badge component for detected cities/states with match status indicators
function DetectedBadge({
  name,
  status,
  isSelected,
  onClick,
}: {
  name: string;
  status: MatchStatus;
  isSelected: boolean;
  onClick: () => void;
}) {
  if (status === 'loading') {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 opacity-70">
        <span className="inline-block h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
        {name}
      </Badge>
    );
  }

  if (status === 'matched' && isSelected) {
    return (
      <Badge
        variant="default"
        className="text-[10px] px-1.5 py-0 gap-1 cursor-pointer bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
        onClick={onClick}
        title={`Click to remove "${name}" from selected locations`}
      >
        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {name}
      </Badge>
    );
  }

  if (status === 'matched' && !isSelected) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-accent"
        onClick={onClick}
        title={`Click to re-add "${name}"`}
      >
        {name}
      </Badge>
    );
  }

  if (status === 'no-match') {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 gap-1 cursor-pointer opacity-50 hover:opacity-75"
        onClick={onClick}
        title={`"${name}" not found in Google Keyword Planner. Click to retry.`}
      >
        <span className="text-amber-500 font-bold">!</span>
        {name}
      </Badge>
    );
  }

  // idle
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-accent"
      onClick={onClick}
      title={`Click to search for "${name}" in Google Keyword Planner`}
    >
      {name}
    </Badge>
  );
}
