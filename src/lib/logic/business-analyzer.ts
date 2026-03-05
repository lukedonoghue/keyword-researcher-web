import type { ServiceArea } from '../types/geo';

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

For serviceArea, look for location mentions in the content, contact pages, footer, service areas, etc.`;
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
    services: Array.isArray(raw.services)
      ? raw.services.map((s) => ({
          name: s.name || '',
          description: s.description || '',
          seedKeywords: Array.isArray(s.seedKeywords) ? s.seedKeywords.filter(Boolean) : [],
          landingPage: s.landingPage || undefined,
        }))
      : [],
    serviceArea: {
      country: rawCountry,
      states: rawStates,
      cities: rawCities,
      isNationwide: raw.serviceArea?.isNationwide ?? (Boolean(rawCountry) && rawStates.length === 0 && rawCities.length === 0),
    },
    contextTerms: Array.isArray(raw.contextTerms) ? raw.contextTerms.filter(Boolean) : [],
  };
}
