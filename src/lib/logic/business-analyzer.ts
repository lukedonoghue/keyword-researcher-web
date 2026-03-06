import type { ServiceArea } from '../types/geo';
import type { WebsiteMessagingProfile } from '../types/index';

export type BusinessAnalysisResponse = {
  businessName: string;
  businessDescription: string;
  businessType: string;
  services: Array<{
    name: string;
    description: string;
    seedKeywords: string[];
    landingPage?: string;
  }>;
  serviceArea: ServiceArea;
  contextTerms: string[];
};

export type BusinessMessagingResponse = {
  features: string[];
  benefits: string[];
  differentiators: string[];
  offers: string[];
  callsToAction: string[];
  proofPoints: string[];
  tone: string;
};

type RawBusinessService = {
  name?: string;
  description?: string;
  seedKeywords?: string[];
  landingPage?: string;
};

/**
 * Build the system prompt for AI-powered business analysis.
 * This is used by the Perplexity service to get richer discovery data.
 */
export function buildBusinessAnalysisPrompt(): string {
  return `You are a business analyst specializing in digital marketing and PPC campaigns. Analyze the given website URL and provide a comprehensive business analysis.

Return a JSON object with:
- businessName: the company/business name
- businessDescription: one-sentence description of what they do
- businessType: category like "local_service", "ecommerce", "saas", "agency", "marketplace", "content", "nonprofit"
- services: array of services they offer, each with:
  - name: service name (concise, 2-4 words)
  - description: brief description
  - seedKeywords: 8-12 PPC keyword ideas for this service. Include cost/pricing queries (e.g. "service cost", "service price"), "near me" variants, and material/method variants. Be thorough.
  - landingPage: specific URL for this service if identifiable. Each service MUST have a unique landingPage URL — never assign the same page to multiple services.
- serviceArea: geographic service area with:
  - country: primary country (ISO 2-letter code, e.g. "US", "GB", "AU")
  - states: array of states/regions they specifically serve (empty if nationwide)
  - cities: array of cities they specifically mention or serve (empty if nationwide)
  - isNationwide: true if they serve the entire country
- contextTerms: 3-5 industry-specific terms that help contextualize their business

Focus on services that would make good Google Ads campaigns. Be specific — "PPC Management" not "Marketing".

Service categorization rules:
- Split services by customer type when relevant (e.g. "Residential Plumbing" vs "Commercial Plumbing")
- Split services by distinct specialties (e.g. "Gutter Guard Installation" vs "Gutter Cleaning")
- Each service should map to a distinct ad group with its own landing page
- Order services from highest commercial value to lowest
- Do not return both a generic service and its residential/commercial variants unless the website clearly presents them as separate offers or separate landing pages
- If residential and commercial are mentioned but not clearly separated on the site, prefer one generic service name instead of two nearly-duplicate services
- Prefer stable canonical names and avoid near-duplicate variants of the same service

For serviceArea, look for location mentions in the content, contact pages, footer, service areas, etc.`;
}

export function buildBusinessMessagingPrompt(): string {
  return `You are a direct-response copy research analyst for Google Ads landing pages.
Analyze the business website and extract only claims that are clearly supported by the website.

Return a JSON object with:
- features: 4-8 concrete service/product features
- benefits: 4-8 customer outcomes or benefits
- differentiators: 3-6 trust factors, process advantages, or unique selling points
- offers: 0-5 current offer, quote, pricing, financing, discount, guarantee, or booking hooks explicitly supported by the site
- callsToAction: 3-6 strong CTA phrases actually aligned to the business
- proofPoints: 0-5 proof elements such as reviews, years in business, licensing, warranty, certifications, response speed, local coverage, or official-brand language
- tone: short description of the site's tone of voice

Rules:
- Do not invent offers, guarantees, or proof.
- Prefer concrete phrases that can improve Google Ads CTR and conversion rate.
- Keep each item concise, usually 2-8 words.
- Ignore generic filler like "quality service" unless the site repeatedly supports it with specifics.`;
}

const customerTypeQualifiers = [
  'residential',
  'commercial',
  'domestic',
  'industrial',
];

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function normalizeServiceName(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[|/]+/g, ' ')
    .replace(/\s{2,}/g, ' ');
}

function normalizeLandingPage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.replace(/\/+$/, '').replace(/[#?].*$/, '') || undefined;
}

function getServiceQualifier(name: string): string | null {
  const normalized = name.toLowerCase();
  const qualifier = customerTypeQualifiers.find((value) => new RegExp(`\\b${value}\\b`, 'i').test(normalized));
  return qualifier ?? null;
}

function getServiceBaseName(name: string): string {
  const normalized = normalizeServiceName(name.toLowerCase());
  const withoutQualifier = customerTypeQualifiers.reduce(
    (acc, qualifier) => acc.replace(new RegExp(`\\b${qualifier}\\b`, 'gi'), ' '),
    normalized,
  );
  return normalizeWhitespace(withoutQualifier);
}

function dedupeStrings(values: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (limit && result.length >= limit) break;
  }

  return result;
}

function normalizeDiscoveredServices(services: RawBusinessService[]): Array<{
  name: string;
  description: string;
  seedKeywords: string[];
  landingPage?: string;
}> {
  const cleaned = services
    .map((service) => ({
      name: normalizeServiceName(service.name || ''),
      description: normalizeWhitespace(service.description || ''),
      seedKeywords: dedupeStrings(Array.isArray(service.seedKeywords) ? service.seedKeywords.filter((value): value is string => typeof value === 'string') : [], 16),
      landingPage: normalizeLandingPage(service.landingPage),
    }))
    .filter((service) => service.name.length > 0);

  const grouped = new Map<string, typeof cleaned>();
  for (const service of cleaned) {
    const key = getServiceBaseName(service.name) || service.name.toLowerCase();
    const existing = grouped.get(key) ?? [];
    existing.push(service);
    grouped.set(key, existing);
  }

  const normalizedServices: Array<{
    name: string;
    description: string;
    seedKeywords: string[];
    landingPage?: string;
  }> = [];

  for (const group of grouped.values()) {
    const generic = group.find((service) => !getServiceQualifier(service.name));
    const qualified = group.filter((service) => Boolean(getServiceQualifier(service.name)));

    const distinctLandingPages = new Set(
      qualified.map((service) => service.landingPage).filter((value): value is string => Boolean(value))
    );
    const hasClearQualifiedSplit =
      qualified.length >= 2 &&
      distinctLandingPages.size === qualified.length &&
      qualified.every((service) => Boolean(service.landingPage));

    if (hasClearQualifiedSplit) {
      const seenQualified = new Set<string>();
      for (const service of qualified) {
        const key = `${service.name.toLowerCase()}|||${service.landingPage ?? ''}`;
        if (seenQualified.has(key)) continue;
        seenQualified.add(key);
        normalizedServices.push(service);
      }
      continue;
    }

    const mergedName = generic?.name || titleCase(getServiceBaseName(group[0]?.name || '') || group[0]?.name || 'Service');
    const mergedDescription = group
      .map((service) => service.description)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || '';
    const mergedSeedKeywords = dedupeStrings(group.flatMap((service) => service.seedKeywords), 16);
    const mergedLandingPage =
      generic?.landingPage ||
      group.map((service) => service.landingPage).find((value): value is string => Boolean(value));

    normalizedServices.push({
      name: mergedName,
      description: mergedDescription,
      seedKeywords: mergedSeedKeywords,
      landingPage: mergedLandingPage,
    });
  }

  return normalizedServices;
}

/**
 * Validate and normalize a business analysis response from AI.
 */
export function normalizeBusinessAnalysis(raw: Partial<BusinessAnalysisResponse>): BusinessAnalysisResponse {
  const rawCountry =
    typeof raw.serviceArea?.country === 'string'
      ? raw.serviceArea.country.trim().toUpperCase()
      : '';
  const rawStates = Array.isArray(raw.serviceArea?.states) ? raw.serviceArea.states.filter(Boolean) : [];
  const rawCities = Array.isArray(raw.serviceArea?.cities) ? raw.serviceArea.cities.filter(Boolean) : [];

  return {
    businessName: raw.businessName || '',
    businessDescription: raw.businessDescription || '',
    businessType: raw.businessType || 'unknown',
    services: normalizeDiscoveredServices(Array.isArray(raw.services) ? raw.services : []),
    serviceArea: {
      country: rawCountry,
      states: rawStates,
      cities: rawCities,
      isNationwide: raw.serviceArea?.isNationwide ?? (Boolean(rawCountry) && rawStates.length === 0 && rawCities.length === 0),
    },
    contextTerms: Array.isArray(raw.contextTerms) ? raw.contextTerms.filter(Boolean) : [],
  };
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim().replace(/\s+/g, ' ');
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }

  return result;
}

export function normalizeBusinessMessaging(raw: Partial<BusinessMessagingResponse>): WebsiteMessagingProfile {
  return {
    features: normalizeStringList(raw.features, 8),
    benefits: normalizeStringList(raw.benefits, 8),
    differentiators: normalizeStringList(raw.differentiators, 6),
    offers: normalizeStringList(raw.offers, 5),
    callsToAction: normalizeStringList(raw.callsToAction, 6),
    proofPoints: normalizeStringList(raw.proofPoints, 5),
    tone: typeof raw.tone === 'string' ? raw.tone.trim().replace(/\s+/g, ' ').slice(0, 120) : '',
  };
}
