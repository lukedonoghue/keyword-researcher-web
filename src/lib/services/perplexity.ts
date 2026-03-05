import { OpenRouterService } from './openrouter';
import { buildBusinessAnalysisPrompt, normalizeBusinessAnalysis, type BusinessAnalysisResponse } from '../logic/business-analyzer';
import type { ServiceArea } from '../types/geo';

export type DiscoveredService = {
  name: string;
  description: string;
  seedKeywords: string[];
  landingPage?: string;
};

export type ServiceDiscoveryResult = {
  businessName: string;
  businessDescription: string;
  businessType: string;
  services: DiscoveredService[];
  serviceArea: ServiceArea;
  contextTerms: string[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export type CompetitorInfo = {
  name: string;
  domain: string;
  description: string;
};

export type CompetitorKeyword = {
  text: string;
  estimatedVolume: number;
  estimatedCpc: number;
  source: string;
};

export type CompetitorResearchResult = {
  competitors: CompetitorInfo[];
  keywords: CompetitorKeyword[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export class PerplexityService {
  private client: OpenRouterService;

  constructor(apiKey: string) {
    this.client = new OpenRouterService(apiKey, 'perplexity/sonar');
  }

  async discoverServices(targetUrl: string): Promise<ServiceDiscoveryResult> {
    const systemPrompt = buildBusinessAnalysisPrompt();

    const { data, usage } = await this.client.jsonPrompt<Partial<BusinessAnalysisResponse>>(
      systemPrompt,
      `Analyze this website and identify their services, business type, and geographic service area: ${targetUrl}`,
      0,
    );

    const normalized = normalizeBusinessAnalysis(data);

    return {
      businessName: normalized.businessName,
      businessDescription: normalized.businessDescription,
      businessType: normalized.businessType,
      services: normalized.services,
      serviceArea: normalized.serviceArea,
      contextTerms: normalized.contextTerms,
      usage,
    };
  }

  async researchCompetitors(
    targetUrl: string,
    services: string[],
    location?: string
  ): Promise<CompetitorResearchResult> {
    this.client.setModel('perplexity/sonar-pro');

    try {
      const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const locationCtx = location ? ` in ${location}` : '';

      // Step 1: Find competitors
      const { data: competitorData, usage: usage1 } = await this.client.jsonPrompt<{
        competitors: CompetitorInfo[];
      }>(
        `You are a competitive intelligence analyst. Find the top 5 competitors for the given business.
Return JSON: { "competitors": [{ "name": string, "domain": string, "description": string }] }
Focus on direct competitors offering similar services in the same market${locationCtx}.`,
        `Find top 5 competitors for ${targetUrl} which offers: ${services.join(', ')}${locationCtx}`
      );
      totalUsage.promptTokens += usage1.promptTokens;
      totalUsage.completionTokens += usage1.completionTokens;
      totalUsage.totalTokens += usage1.totalTokens;

      // Step 2: Extract competitor keywords (10-15 per service)
      const competitors = Array.isArray(competitorData.competitors) ? competitorData.competitors : [];
      const competitorDomains = competitors.map((c) => c.domain).filter(Boolean).join(', ');
      const serviceList = services.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const { data: keywordData, usage: usage2 } = await this.client.jsonPrompt<{
        keywords: CompetitorKeyword[];
      }>(
        `You are a PPC keyword researcher. Analyze these competitor websites and extract keywords they likely target in Google Ads.
Return JSON: { "keywords": [{ "text": string, "estimatedVolume": number, "estimatedCpc": number, "source": string }] }
- text: the keyword phrase
- estimatedVolume: estimated monthly search volume
- estimatedCpc: estimated cost per click in USD
- source: which competitor domain this keyword is associated with

Generate 10-15 keywords PER service listed below. Include locale-appropriate terms for the target market${locationCtx}.
Services:
${serviceList}

Focus on commercial and transactional intent keywords. Include cost/pricing queries, "near me" variants, and service-specific terminology.`,
        `Extract PPC keywords that these competitors likely target: ${competitorDomains}
These businesses offer: ${services.join(', ')}${locationCtx}`
      );
      totalUsage.promptTokens += usage2.promptTokens;
      totalUsage.completionTokens += usage2.completionTokens;
      totalUsage.totalTokens += usage2.totalTokens;

      // Step 3: Per-service focused keyword generation
      const allKeywords = Array.isArray(keywordData.keywords) ? [...keywordData.keywords] : [];
      for (const service of services) {
        try {
          const { data: serviceData, usage: usage3 } = await this.client.jsonPrompt<{
            keywords: CompetitorKeyword[];
          }>(
            `You are a PPC keyword specialist. Generate seed keywords for one specific service.
Return JSON: { "keywords": [{ "text": string, "estimatedVolume": number, "estimatedCpc": number, "source": "service_research" }] }
Generate 10-15 highly relevant Google Ads keywords for this service${locationCtx}. Include:
- Direct service queries (e.g. "[service] near me", "[service] [city]")
- Cost/pricing queries (e.g. "[service] cost", "[service] price", "how much does [service] cost")
- Comparison/review queries (e.g. "best [service]", "[service] reviews")
- Problem-solution queries (e.g. related problems that lead to needing this service)
Use locale-appropriate language for the target market.`,
            `Generate PPC keywords for: "${service}"${locationCtx}. The business is ${targetUrl}.`
          );
          totalUsage.promptTokens += usage3.promptTokens;
          totalUsage.completionTokens += usage3.completionTokens;
          totalUsage.totalTokens += usage3.totalTokens;
          if (Array.isArray(serviceData.keywords)) {
            allKeywords.push(...serviceData.keywords);
          }
        } catch { /* graceful degradation — skip this service */ }
      }

      return {
        competitors,
        keywords: allKeywords,
        usage: totalUsage,
      };
    } finally {
      this.client.setModel('perplexity/sonar');
    }
  }
}
