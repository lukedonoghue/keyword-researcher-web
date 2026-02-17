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
      `Analyze this website and identify their services, business type, and geographic service area: ${targetUrl}`
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

      // Step 1: Find competitors
      const { data: competitorData, usage: usage1 } = await this.client.jsonPrompt<{
        competitors: CompetitorInfo[];
      }>(
        `You are a competitive intelligence analyst. Find the top 5 competitors for the given business.
Return JSON: { "competitors": [{ "name": string, "domain": string, "description": string }] }
Focus on direct competitors offering similar services in the same market.`,
        `Find top 5 competitors for ${targetUrl} which offers: ${services.join(', ')}${location ? ` in ${location}` : ''}`
      );
      totalUsage.promptTokens += usage1.promptTokens;
      totalUsage.completionTokens += usage1.completionTokens;
      totalUsage.totalTokens += usage1.totalTokens;

      // Step 2: Extract competitor keywords
      const competitors = Array.isArray(competitorData.competitors) ? competitorData.competitors : [];
      const competitorDomains = competitors.map((c) => c.domain).filter(Boolean).join(', ');
      const { data: keywordData, usage: usage2 } = await this.client.jsonPrompt<{
        keywords: CompetitorKeyword[];
      }>(
        `You are a PPC keyword researcher. Analyze these competitor websites and extract keywords they likely target in Google Ads.
Return JSON: { "keywords": [{ "text": string, "estimatedVolume": number, "estimatedCpc": number, "source": string }] }
- text: the keyword phrase
- estimatedVolume: estimated monthly search volume
- estimatedCpc: estimated cost per click in USD
- source: which competitor domain this keyword is associated with
Include 20-40 keywords covering the main services. Focus on commercial and transactional intent keywords.`,
        `Extract PPC keywords that these competitors likely target: ${competitorDomains}
These businesses offer: ${services.join(', ')}${location ? ` in ${location}` : ''}`
      );
      totalUsage.promptTokens += usage2.promptTokens;
      totalUsage.completionTokens += usage2.completionTokens;
      totalUsage.totalTokens += usage2.totalTokens;

      return {
        competitors,
        keywords: Array.isArray(keywordData.keywords) ? keywordData.keywords : [],
        usage: totalUsage,
      };
    } finally {
      this.client.setModel('perplexity/sonar');
    }
  }
}
