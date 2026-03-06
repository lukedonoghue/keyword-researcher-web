import { OpenRouterService } from './openrouter';
import {
  buildBusinessAnalysisPrompt,
  buildBusinessMessagingPrompt,
  normalizeBusinessAnalysis,
  normalizeBusinessMessaging,
  type BusinessAnalysisResponse,
  type BusinessMessagingResponse,
} from '../logic/business-analyzer';
import type { ServiceArea } from '../types/geo';
import type { WebsiteMessagingProfile } from '../types/index';

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
  messagingProfile: WebsiteMessagingProfile;
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

const MAX_COMPETITORS = 30;
const KEYWORD_RESEARCH_COMPETITOR_LIMIT = 15;

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
    const totalUsage = { ...usage };
    let messagingProfile = normalizeBusinessMessaging({});

    try {
      const messagingResult = await this.client.jsonPrompt<Partial<BusinessMessagingResponse>>(
        buildBusinessMessagingPrompt(),
        `Analyze this website and extract direct-response messaging assets for Google Ads: ${targetUrl}`,
        0,
      );
      totalUsage.promptTokens += messagingResult.usage.promptTokens;
      totalUsage.completionTokens += messagingResult.usage.completionTokens;
      totalUsage.totalTokens += messagingResult.usage.totalTokens;
      messagingProfile = normalizeBusinessMessaging(messagingResult.data);
    } catch {
      messagingProfile = normalizeBusinessMessaging({});
    }

    return {
      businessName: normalized.businessName,
      businessDescription: normalized.businessDescription,
      businessType: normalized.businessType,
      messagingProfile,
      services: normalized.services,
      serviceArea: normalized.serviceArea,
      contextTerms: normalized.contextTerms,
      usage: totalUsage,
    };
  }

  private extractCompetitorsFromText(raw: string): CompetitorInfo[] {
    const lines = raw
      .split('\n')
      .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
      .filter(Boolean);

    const competitors: CompetitorInfo[] = [];
    const seenDomains = new Set<string>();

    for (const line of lines) {
      const domainMatch = line.match(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:\/\S*)?\b/i);
      if (!domainMatch?.[1]) continue;
      const domain = domainMatch[1].toLowerCase();
      if (seenDomains.has(domain)) continue;

      const name = line
        .replace(domainMatch[0], '')
        .replace(/\s*[|:-]\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || domain.split('.')[0] || domain;

      competitors.push({
        name,
        domain,
        description: line,
      });
      seenDomains.add(domain);
      if (competitors.length >= MAX_COMPETITORS) break;
    }

    return competitors;
  }

  private normalizeCompetitors(competitors: CompetitorInfo[]): CompetitorInfo[] {
    const seenDomains = new Set<string>();
    const seenNames = new Set<string>();

    return competitors
      .map((competitor) => ({
        name: competitor.name?.trim() || competitor.domain?.trim() || 'Unknown competitor',
        domain: competitor.domain?.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || '',
        description: competitor.description?.trim() || '',
      }))
      .filter((competitor) => {
        const domainKey = competitor.domain.toLowerCase();
        const nameKey = competitor.name.toLowerCase();
        if (domainKey && seenDomains.has(domainKey)) return false;
        if (seenNames.has(nameKey)) return false;
        if (domainKey) seenDomains.add(domainKey);
        seenNames.add(nameKey);
        return true;
      })
      .slice(0, MAX_COMPETITORS);
  }

  private async findCompetitorsWithFallback(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{ competitors: CompetitorInfo[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    try {
      const { data, usage } = await this.client.jsonPrompt<{ competitors: CompetitorInfo[] }>(systemPrompt, userPrompt);
      return {
        competitors: this.normalizeCompetitors(Array.isArray(data.competitors) ? data.competitors : []),
        usage,
      };
    } catch {
      const result = await this.client.chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      return {
        competitors: this.normalizeCompetitors(this.extractCompetitorsFromText(result.content)),
        usage: result.usage,
      };
    }
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
      const { competitors, usage: usage1 } = await this.findCompetitorsWithFallback(
        `You are a competitive intelligence analyst. Find as many strong direct competitors as you can verify for the given business, aiming for 20-30 when the market supports it.
Return JSON: { "competitors": [{ "name": string, "domain": string, "description": string }] }
Focus on direct competitors offering similar services in the same market${locationCtx}.
Prefer local and regional competitors over directories or marketplaces.
Return up to ${MAX_COMPETITORS} competitors.`,
        `Find up to ${MAX_COMPETITORS} direct competitors for ${targetUrl} which offers: ${services.join(', ')}${locationCtx}`
      );
      totalUsage.promptTokens += usage1.promptTokens;
      totalUsage.completionTokens += usage1.completionTokens;
      totalUsage.totalTokens += usage1.totalTokens;

      // Step 2: Extract competitor keywords (10-15 per service)
      const competitorDomains = competitors
        .slice(0, KEYWORD_RESEARCH_COMPETITOR_LIMIT)
        .map((c) => c.domain)
        .filter(Boolean)
        .join(', ');
      const serviceList = services.map((s, i) => `${i + 1}. ${s}`).join('\n');
      let allKeywords: CompetitorKeyword[] = [];
      try {
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
        allKeywords = Array.isArray(keywordData.keywords) ? [...keywordData.keywords] : [];
      } catch {
        allKeywords = [];
      }

      // Step 3: Per-service focused keyword generation
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
