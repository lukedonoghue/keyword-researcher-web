'use client';

import { useWorkflow } from '@/providers/workflow-provider';
import { GEO_CONSTANTS } from '@/lib/data/geoConstants';
import { GeoLocationPicker } from './geo-location-picker';
import type { GeoLocationSuggestion } from '@/lib/types/geo';

export function StepGeo() {
  const { state, dispatch } = useWorkflow();

  const hasAiDetection = Boolean(state.detectedCountryCode);

  const handleConfirm = (locations: GeoLocationSuggestion[], countryCode: string, languageId: string) => {
    if (locations.length > 0) {
      dispatch({
        type: 'SET_GEO_TARGETS',
        targets: locations,
        languageId,
      });
    } else {
      const geo = GEO_CONSTANTS.find((g) => g.countryCode === countryCode);
      if (geo) {
        dispatch({
          type: 'SET_GEO',
          geoTargetId: geo.geoTargetId,
          languageId: geo.languageId,
          countryCode: geo.countryCode,
          displayName: geo.displayName,
        });
      }
    }
    dispatch({ type: 'SET_STEP', step: 'strategy' });
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

      <GeoLocationPicker
        initialCountryCode={state.geoCountryCode}
        initialLocations={state.geoTargets}
        detectedServiceArea={state.detectedServiceArea}
        detectedCountryCode={state.detectedCountryCode}
        onConfirm={handleConfirm}
        onCancel={() => dispatch({ type: 'SET_STEP', step: 'discover' })}
        confirmLabel="Continue"
        cancelLabel="Back"
      />
    </div>
  );
}
