'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflow } from '@/providers/workflow-provider';
import { useWorkflowData } from '@/hooks/use-workflow-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Wrench, AlertCircle } from 'lucide-react';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  local_service: 'Local Service',
  ecommerce: 'E-Commerce',
  saas: 'SaaS',
  agency: 'Agency',
  marketplace: 'Marketplace',
  content: 'Content',
  nonprofit: 'Nonprofit',
  unknown: 'Business',
};

export function StepDiscover() {
  const { state, dispatch } = useWorkflow();
  const { discoverServices, isProcessing, error } = useWorkflowData();
  const autoStartedRef = useRef(false);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [hasCustomSelection, setHasCustomSelection] = useState(false);

  const discoveredNames = useMemo(
    () => state.discoveredServices.map((service) => service.name),
    [state.discoveredServices]
  );

  const defaultSelectionNames = useMemo(
    () => (state.selectedServices.length > 0 ? state.selectedServices : []),
    [state.selectedServices]
  );

  const effectiveSelection = useMemo(() => {
    if (hasCustomSelection) return selectedNames;
    return new Set(defaultSelectionNames);
  }, [defaultSelectionNames, hasCustomSelection, selectedNames]);

  const allSelected = effectiveSelection.size === discoveredNames.length && discoveredNames.length > 0;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(discoveredNames));
    }
    setHasCustomSelection(true);
  }, [allSelected, discoveredNames]);

  const runDiscovery = useCallback(async () => {
    await discoverServices(state.targetUrl);
  }, [discoverServices, state.targetUrl]);

  useEffect(() => {
    if (autoStartedRef.current || state.discoveredServices.length > 0 || !state.targetUrl) {
      return;
    }
    autoStartedRef.current = true;
    void runDiscovery();
  }, [runDiscovery, state.discoveredServices.length, state.targetUrl]);

  const toggle = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = hasCustomSelection ? new Set(prev) : new Set(defaultSelectionNames);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setHasCustomSelection(true);
  }, [defaultSelectionNames, hasCustomSelection]);

  const handleRetry = () => {
    setHasCustomSelection(false);
    setSelectedNames(new Set());
    void runDiscovery();
  };

  const handleNext = () => {
    const services = Array.from(effectiveSelection);
    const contexts = state.discoveredServices
      .filter((s) => effectiveSelection.has(s.name))
      .map((s) => ({ name: s.name, landingPage: s.landingPage || state.targetUrl }));
    dispatch({ type: 'SET_SELECTED_SERVICES', services, contexts });
    dispatch({ type: 'SET_STEP', step: 'geo' });
  };

  const businessTypeLabel = BUSINESS_TYPE_LABELS[state.businessType] || state.businessType || 'Business';

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold">Service Discovery</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Analyzing your website to identify the services you offer, your business type, and service area.
        </p>
      </div>

      {isProcessing && (
        <Card>
          <CardContent className="py-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">Analyzing website with Perplexity...</span>
            </div>
            <div className="space-y-1.5 pl-7">
              <p className="text-[11px] text-muted-foreground">Identifying business type and services</p>
              <p className="text-[11px] text-muted-foreground">Detecting geographic service area</p>
              <p className="text-[11px] text-muted-foreground">Generating seed keywords per service</p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
              <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={handleRetry}>
                Retry
              </Button>
            </CardContent>
        </Card>
      )}

      {state.discoveredServices.length > 0 && (
        <>
          <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40">
            <CardContent className="py-3">
              <p className="text-sm text-green-800 dark:text-green-300">
                We found <span className="font-semibold">{state.discoveredServices.length}</span> service{state.discoveredServices.length !== 1 ? 's' : ''}{state.businessName ? <> for <span className="font-semibold">{state.businessName}</span></> : ''}. Select the ones you want to target with Google Ads.
              </p>
            </CardContent>
          </Card>

          {state.businessName && (
            <div className="rounded border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{state.businessName}</p>
                {state.businessType && state.businessType !== 'unknown' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {businessTypeLabel}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{state.businessDescription}</p>
              {state.detectedServiceArea && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-muted-foreground">Service area:</span>
                  {state.detectedServiceArea.isNationwide ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {state.detectedServiceArea.country
                        ? `Nationwide (${state.detectedServiceArea.country})`
                        : 'Nationwide'}
                    </Badge>
                  ) : (
                    <>
                      {state.detectedServiceArea.cities.slice(0, 3).map((city) => (
                        <Badge key={city} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {city}
                        </Badge>
                      ))}
                      {state.detectedServiceArea.states.slice(0, 2).map((st) => (
                        <Badge key={st} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {st}
                        </Badge>
                      ))}
                    </>
                  )}
                </div>
              )}
              {state.contextTerms.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {state.contextTerms.map((term) => (
                    <Badge key={term} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      {term}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {effectiveSelection.size} of {discoveredNames.length} selected
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={toggleAll}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <div className="space-y-2">
            {state.discoveredServices.map((service) => (
              <Card
                key={service.name}
                data-interactive
                className={`cursor-pointer transition-colors ${effectiveSelection.has(service.name) ? 'border-brand-accent shadow-sm shadow-brand-accent/10' : ''}`}
                onClick={() => toggle(service.name)}
              >
                <CardContent className="flex items-start gap-3 py-3">
                  <Checkbox checked={effectiveSelection.has(service.name)} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {service.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {service.seedKeywords.slice(0, 4).map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={() => dispatch({ type: 'SET_STEP', step: 'setup' })}>
              Back
            </Button>
            <Button variant="brand" size="sm" className="h-8" onClick={handleNext} disabled={effectiveSelection.size === 0}>
              Continue with {effectiveSelection.size} service{effectiveSelection.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
