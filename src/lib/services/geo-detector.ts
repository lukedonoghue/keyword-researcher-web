import type { GeoSignal, ServiceArea } from '../types/geo';
import { GEO_CONSTANTS } from '../data/geoConstants';

type GeoDetectionResult = {
  countryCode: string;
  confidence: number;
  signals: GeoSignal[];
  serviceArea?: ServiceArea;
};

/**
 * Enhance geo detection with AI-derived service area data.
 * Maps AI service area info to GeoSignals and resolves the best country match.
 */
export function enhanceWithAI(
  serviceArea: ServiceArea | undefined,
  existingSignals: GeoSignal[] = []
): GeoDetectionResult {
  const signals: GeoSignal[] = [...existingSignals];

  if (serviceArea?.country) {
    signals.push({
      type: 'ai',
      value: `country:${serviceArea.country}`,
      confidence: 0.85,
    });
  }

  if (serviceArea?.cities && serviceArea.cities.length > 0) {
    signals.push({
      type: 'ai',
      value: `cities:${serviceArea.cities.join(',')}`,
      confidence: 0.8,
    });
  }

  if (serviceArea?.states && serviceArea.states.length > 0) {
    signals.push({
      type: 'ai',
      value: `states:${serviceArea.states.join(',')}`,
      confidence: 0.75,
    });
  }

  // Resolve country code from AI signals + existing signals
  const countryCode = resolveCountryCode(signals, serviceArea);
  const confidence = calculateConfidence(signals);

  return {
    countryCode,
    confidence,
    signals,
    serviceArea,
  };
}

function resolveCountryCode(signals: GeoSignal[], serviceArea?: ServiceArea): string {
  // AI signal takes priority if present
  if (serviceArea?.country) {
    const match = GEO_CONSTANTS.find(
      (g) => g.countryCode.toUpperCase() === serviceArea.country.toUpperCase()
    );
    if (match) return match.countryCode;
  }

  // Fall back to highest-confidence signal
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  for (const signal of sorted) {
    if (signal.type === 'ai' && signal.value.startsWith('country:')) {
      const code = signal.value.split(':')[1];
      const match = GEO_CONSTANTS.find(
        (g) => g.countryCode.toUpperCase() === code.toUpperCase()
      );
      if (match) return match.countryCode;
    }
  }

  return 'US'; // default
}

function calculateConfidence(signals: GeoSignal[]): number {
  if (signals.length === 0) return 0;
  const max = Math.max(...signals.map((s) => s.confidence));
  const bonus = Math.min(0.1, signals.length * 0.02);
  return Math.min(1, max + bonus);
}

/**
 * Format the detected service area as a human-readable string.
 */
export function formatServiceArea(serviceArea: ServiceArea): string {
  const parts: string[] = [];
  const countryCode = serviceArea.country?.trim();

  if (serviceArea.isNationwide && countryCode) {
    const country = GEO_CONSTANTS.find(
      (g) => g.countryCode.toUpperCase() === countryCode.toUpperCase()
    );
    parts.push(`Nationwide (${country?.displayName || countryCode})`);
  } else {
    if (serviceArea.cities.length > 0) {
      parts.push(serviceArea.cities.slice(0, 3).join(', '));
      if (serviceArea.cities.length > 3) {
        parts.push(`+${serviceArea.cities.length - 3} more`);
      }
    }
    if (serviceArea.states.length > 0) {
      parts.push(serviceArea.states.join(', '));
    }
  }

  if (parts.length > 0) {
    return parts.join(' · ');
  }
  return countryCode || 'Location not specified';
}
