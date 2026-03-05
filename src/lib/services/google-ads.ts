import { GoogleAdsApi, enums } from 'google-ads-api';
import type { CampaignStructureV2 } from '../types/index';
import type { GeoLocationSuggestion } from '../types/geo';

type KeywordMetric = {
  text: string;
  volume: number;
  cpc: number;
  cpcLow: number;
  cpcHigh: number;
  competition: string;
  competitionIndex: number;
};

type GoogleAdsCredentials = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
};

export class GoogleAdsService {
  private static readonly REQUEST_TIMEOUT_MS = 45000;
  private client: GoogleAdsApi;
  private customerId: string;
  private refreshToken: string;
  private loginCustomerId?: string;

  constructor(credentials: GoogleAdsCredentials) {
    this.client = new GoogleAdsApi({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      developer_token: credentials.developerToken,
    });
    this.customerId = credentials.customerId;
    this.refreshToken = credentials.refreshToken;
    this.loginCustomerId = credentials.loginCustomerId;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === 'object' && 'low' in (value as Record<string, unknown>) && 'high' in (value as Record<string, unknown>)) {
      const low = this.toNumber((value as { low?: unknown }).low);
      const high = this.toNumber((value as { high?: unknown }).high);
      if (Number.isFinite(low) && Number.isFinite(high)) {
        return (high >>> 0) * 4294967296 + (low >>> 0);
      }
    }
    if (value && typeof value === 'object' && 'value' in value) {
      return this.toNumber((value as { value?: unknown }).value);
    }
    return 0;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return {};
  }

  async getCustomer() {
    return this.client.Customer({
      customer_id: this.customerId,
      refresh_token: this.refreshToken,
      login_customer_id: this.loginCustomerId || undefined,
    });
  }

  async listAccessibleAccounts(): Promise<Array<{ customerId: string; descriptiveName: string }>> {
    const response = await this.client.listAccessibleCustomers(this.refreshToken);
    const rawResourceNames = this.asRecord(response).resource_names;
    const resourceNames = Array.isArray(rawResourceNames)
      ? rawResourceNames.filter((name): name is string => typeof name === 'string')
      : [];
    const accountIds = Array.from(
      new Set(resourceNames.map((name) => name.replace(/\D/g, '')).filter(Boolean))
    );

    const accounts = await Promise.all(
      accountIds.map(async (customerId) => {
        let descriptiveName = `Account ${customerId}`;
        try {
          const customer = this.client.Customer({
            customer_id: customerId,
            refresh_token: this.refreshToken,
            login_customer_id: this.loginCustomerId || undefined,
          });
          const rows = await customer.query(`
            SELECT customer.descriptive_name, customer.id
            FROM customer
            LIMIT 1
          `);
          const firstRow = Array.isArray(rows) ? rows[0] : null;
          const customerRow = this.asRecord(this.asRecord(firstRow).customer);
          const maybeName = customerRow.descriptive_name;
          if (typeof maybeName === 'string' && maybeName.trim()) {
            descriptiveName = maybeName;
          }
        } catch {
          // Keep fallback descriptive name if account details are unavailable.
        }

        return { customerId, descriptiveName };
      })
    );

    return accounts;
  }

  private inferCpcMicros(metrics: Record<string, unknown>, row: Record<string, unknown>): number {
    const avgCpcMicros =
      this.toNumber(metrics.average_cpc_micros) ||
      this.toNumber(metrics.averageCpcMicros) ||
      this.toNumber(row.average_cpc_micros) ||
      this.toNumber(row.averageCpcMicros);
    if (avgCpcMicros > 0) return avgCpcMicros;

    const lowTopMicros =
      this.toNumber(metrics.low_top_of_page_bid_micros) ||
      this.toNumber(metrics.lowTopOfPageBidMicros) ||
      this.toNumber(row.low_top_of_page_bid_micros) ||
      this.toNumber(row.lowTopOfPageBidMicros);
    const highTopMicros =
      this.toNumber(metrics.high_top_of_page_bid_micros) ||
      this.toNumber(metrics.highTopOfPageBidMicros) ||
      this.toNumber(row.high_top_of_page_bid_micros) ||
      this.toNumber(row.highTopOfPageBidMicros);

    if (lowTopMicros > 0 && highTopMicros > 0) return Math.round((lowTopMicros + highTopMicros) / 2);
    if (highTopMicros > 0) return highTopMicros;
    if (lowTopMicros > 0) return lowTopMicros;
    return 0;
  }

  private normalizeKeywordIdeas(response: unknown): KeywordMetric[] {
    const responseRecord = this.asRecord(response);
    const rows = Array.isArray(responseRecord.results)
      ? responseRecord.results
      : Array.isArray(response)
        ? response
        : [];

    // Debug: log raw shape of first 3 rows
    if (rows.length > 0) {
      console.log(`[normalizeKeywordIdeas] ${rows.length} raw rows. First row keys:`, Object.keys(this.asRecord(rows[0])));
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const row = this.asRecord(rows[i]);
        const metrics = this.asRecord(row.keyword_idea_metrics || row.keywordIdeaMetrics || row.metrics);
        const kw = this.asRecord(row.keyword);
        console.log(`[normalizeKeywordIdeas] row[${i}]:`, {
          text: row.text ?? kw.text,
          metricsKeys: Object.keys(metrics),
          avgMonthlySearches: metrics.avg_monthly_searches ?? metrics.avgMonthlySearches,
          lowTopBid: metrics.low_top_of_page_bid_micros ?? metrics.lowTopOfPageBidMicros,
          highTopBid: metrics.high_top_of_page_bid_micros ?? metrics.highTopOfPageBidMicros,
        });
      }
    }

    return rows
      .map((item) => {
        const row = this.asRecord(item);
        const keywordRecord = this.asRecord(row.keyword);
        const rawKeyword = typeof row.text === 'string'
          ? row.text
          : typeof keywordRecord.text === 'string'
            ? keywordRecord.text
            : typeof keywordRecord.keyword === 'string'
              ? keywordRecord.keyword
              : '';
        const text = rawKeyword.trim();
        if (!text) return null;

        const metrics = this.asRecord(
          row.keyword_idea_metrics ||
          row.keywordIdeaMetrics ||
          row.metrics ||
          keywordRecord.keyword_idea_metrics
        );
        const rawVolume =
          metrics.avg_monthly_searches ??
          metrics.avgMonthlySearches ??
          metrics.monthly_searches ??
          metrics.monthlySearches ??
          row.avg_monthly_searches ??
          row.avgMonthlySearches ??
          row.monthly_searches ??
          row.monthlySearches ??
          0;
        const volume = this.toNumber(rawVolume);
        const cpcMicros = this.inferCpcMicros(metrics, row);
        const cpc = cpcMicros > 0 ? cpcMicros / 1_000_000 : 0;

        const lowTopMicros =
          this.toNumber(metrics.low_top_of_page_bid_micros) ||
          this.toNumber(metrics.lowTopOfPageBidMicros) ||
          this.toNumber(row.low_top_of_page_bid_micros) ||
          this.toNumber(row.lowTopOfPageBidMicros);
        const highTopMicros =
          this.toNumber(metrics.high_top_of_page_bid_micros) ||
          this.toNumber(metrics.highTopOfPageBidMicros) ||
          this.toNumber(row.high_top_of_page_bid_micros) ||
          this.toNumber(row.highTopOfPageBidMicros);
        const cpcLow = lowTopMicros > 0 ? lowTopMicros / 1_000_000 : 0;
        const cpcHigh = highTopMicros > 0 ? highTopMicros / 1_000_000 : 0;

        const rawCompetition = metrics.competition ?? metrics.competitionLevel ?? row.competition ?? '';
        const competition = typeof rawCompetition === 'string' ? rawCompetition : String(rawCompetition);
        const rawCompetitionIndex =
          metrics.competition_index ??
          metrics.competitionIndex ??
          row.competition_index ??
          row.competitionIndex ??
          0;
        const competitionIndex = Math.min(100, Math.max(0, this.toNumber(rawCompetitionIndex)));

        return { text, volume, cpc, cpcLow, cpcHigh, competition, competitionIndex };
      })
      .filter((row: KeywordMetric | null): row is KeywordMetric => Boolean(row));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async suggestGeoLocations(query: string, countryCode?: string): Promise<GeoLocationSuggestion[]> {
    const customer = await this.getCustomer();
    const request: Record<string, unknown> = {
      location_names: { names: [query] },
      locale: 'en',
    };
    if (countryCode) {
      request.country_code = countryCode;
    }

    const response = await this.withTimeout(
      customer.geoTargetConstants.suggestGeoTargetConstants(
        request as unknown as Parameters<typeof customer.geoTargetConstants.suggestGeoTargetConstants>[0]
      ),
      GoogleAdsService.REQUEST_TIMEOUT_MS,
      'Geo target suggestion request timed out.',
    );

    const responseRecord = this.asRecord(response);
    const suggestions = Array.isArray(responseRecord.geo_target_constant_suggestions)
      ? responseRecord.geo_target_constant_suggestions
      : Array.isArray(response) ? response : [];

    return suggestions
      .map((item: unknown) => {
        const suggestion = this.asRecord(item);
        const constant = this.asRecord(suggestion.geo_target_constant);
        const id = this.toNumber(constant.id);
        if (!id) return null;
        const name = typeof constant.name === 'string' ? constant.name : '';
        const canonicalName = typeof constant.canonical_name === 'string'
          ? constant.canonical_name
          : typeof constant.canonicalName === 'string'
            ? constant.canonicalName
            : name;
        const targetType = typeof constant.target_type === 'string'
          ? constant.target_type
          : typeof constant.targetType === 'string'
            ? constant.targetType
            : '';
        const cc = typeof constant.country_code === 'string'
          ? constant.country_code
          : typeof constant.countryCode === 'string'
            ? constant.countryCode
            : '';
        const reach = this.toNumber(suggestion.reach);

        return {
          id: String(id),
          name,
          canonicalName,
          targetType,
          countryCode: cc,
          reach,
        };
      })
      .filter((s: GeoLocationSuggestion | null): s is GeoLocationSuggestion => s !== null);
  }

  async generateKeywordIdeas(
    seedKeywords: string[],
    targetUrl: string,
    languageId: string = '1000',
    geoTargetIds: string[] = ['2840']
  ): Promise<KeywordMetric[]> {
    if (seedKeywords.length === 0 && !targetUrl) {
      throw new Error('No seed keywords or target URL was provided.');
    }

    const customer = await this.getCustomer();
    const topSeeds = seedKeywords.filter(Boolean).slice(0, 20);
    const request: Record<string, unknown> = {
      customer_id: this.customerId,
      language: `languageConstants/${languageId}`,
      geo_target_constants: geoTargetIds.map((id) => `geoTargetConstants/${id}`),
      keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH,
      include_adult_keywords: false,
      page_size: 500,
    };

    if (topSeeds.length > 0 && targetUrl) {
      request.keyword_and_url_seed = { keywords: topSeeds, url: targetUrl };
    } else if (topSeeds.length > 0) {
      request.keyword_seed = { keywords: topSeeds };
    } else {
      request.url_seed = { url: targetUrl };
    }

    const response = await this.withTimeout(
      customer.keywordPlanIdeas.generateKeywordIdeas(
        request as unknown as Parameters<typeof customer.keywordPlanIdeas.generateKeywordIdeas>[0]
      ),
      GoogleAdsService.REQUEST_TIMEOUT_MS,
      'Google Ads keyword idea request timed out.',
    );
    return this.normalizeKeywordIdeas(response);
  }

  async generateKeywordIdeasDebug(
    seedKeywords: string[],
    targetUrl: string,
    languageId: string = '1000',
    geoTargetIds: string[] = ['2840']
  ): Promise<{ normalized: KeywordMetric[]; rawSample: unknown[]; rawRowCount: number; responseType: string }> {
    if (seedKeywords.length === 0 && !targetUrl) {
      throw new Error('No seed keywords or target URL was provided.');
    }

    const customer = await this.getCustomer();
    const topSeeds = seedKeywords.filter(Boolean).slice(0, 20);
    const request: Record<string, unknown> = {
      customer_id: this.customerId,
      language: `languageConstants/${languageId}`,
      geo_target_constants: geoTargetIds.map((id) => `geoTargetConstants/${id}`),
      keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH,
      include_adult_keywords: false,
      page_size: 20,
    };

    if (topSeeds.length > 0 && targetUrl) {
      request.keyword_and_url_seed = { keywords: topSeeds, url: targetUrl };
    } else if (topSeeds.length > 0) {
      request.keyword_seed = { keywords: topSeeds };
    } else {
      request.url_seed = { url: targetUrl };
    }

    const response = await this.withTimeout(
      customer.keywordPlanIdeas.generateKeywordIdeas(
        request as unknown as Parameters<typeof customer.keywordPlanIdeas.generateKeywordIdeas>[0]
      ),
      GoogleAdsService.REQUEST_TIMEOUT_MS,
      'Google Ads keyword idea request timed out.',
    );

    const responseRecord = this.asRecord(response);
    const rows = Array.isArray(responseRecord.results)
      ? responseRecord.results
      : Array.isArray(response)
        ? (response as unknown[])
        : [];

    // Capture first 5 raw rows with full structure
    const rawSample = rows.slice(0, 5).map((item) => {
      try { return JSON.parse(JSON.stringify(item)); }
      catch { return { _error: 'not serializable', keys: Object.keys(this.asRecord(item)) }; }
    });

    const normalized = this.normalizeKeywordIdeas(response);

    return {
      normalized,
      rawSample,
      rawRowCount: rows.length,
      responseType: Array.isArray(response) ? 'array' : typeof response,
    };
  }

  async createCampaignStructure(
    campaigns: CampaignStructureV2[],
    options: {
      dailyBudgetMicros: number;
      biddingStrategy: string;
      geoTargetIds: string[];
    }
  ): Promise<{ created: { campaigns: number; adGroups: number; keywords: number }; errors: string[] }> {
    const customer = await this.getCustomer();
    const errors: string[] = [];
    let createdCampaigns = 0;
    let createdAdGroups = 0;
    let createdKeywords = 0;

    for (const campaign of campaigns) {
      try {
        // 1. Create campaign budget
        const budgetResult = await customer.campaignBudgets.create([{
          amount_micros: options.dailyBudgetMicros,
          delivery_method: enums.BudgetDeliveryMethod.STANDARD,
          name: `${campaign.campaignName} Budget - ${Date.now()}`,
        }]);
        const budgetResourceName = budgetResult.results?.[0]?.resource_name;
        if (!budgetResourceName) {
          errors.push(`Failed to create budget for ${campaign.campaignName}`);
          continue;
        }

        // 2. Create campaign
        const biddingStrategyType = options.biddingStrategy === 'MAXIMIZE_CONVERSIONS'
          ? enums.BiddingStrategyType.MAXIMIZE_CONVERSIONS
          : options.biddingStrategy === 'MANUAL_CPC'
            ? enums.BiddingStrategyType.MANUAL_CPC
            : enums.BiddingStrategyType.MAXIMIZE_CONVERSIONS;

        const campaignResult = await customer.campaigns.create([{
          name: campaign.campaignName,
          advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
          status: enums.CampaignStatus.PAUSED,
          campaign_budget: budgetResourceName,
          bidding_strategy_type: biddingStrategyType,
          network_settings: {
            target_google_search: true,
            target_search_network: false,
            target_content_network: false,
          },
        }]);
        const campaignResourceName = campaignResult.results?.[0]?.resource_name;
        if (!campaignResourceName) {
          errors.push(`Failed to create campaign ${campaign.campaignName}`);
          continue;
        }
        createdCampaigns++;

        // 3. Set geo targeting
        if (options.geoTargetIds.length > 0) {
          try {
            await customer.campaignCriteria.create(
              options.geoTargetIds.map((geoId) => ({
                campaign: campaignResourceName,
                geo_target_constant: `geoTargetConstants/${geoId}`,
                type: enums.CriterionType.LOCATION,
              }))
            );
          } catch { /* geo targeting is best-effort */ }
        }

        // 4. Create ad groups and keywords
        for (const adGroup of campaign.adGroups) {
          try {
            const avgCpcMicros = this.calculateAvgCpcMicros(adGroup);
            const adGroupResult = await customer.adGroups.create([{
              name: adGroup.name,
              campaign: campaignResourceName,
              type: enums.AdGroupType.SEARCH_STANDARD,
              cpc_bid_micros: avgCpcMicros || options.dailyBudgetMicros,
              status: enums.AdGroupStatus.ENABLED,
            }]);
            const adGroupResourceName = adGroupResult.results?.[0]?.resource_name;
            if (!adGroupResourceName) {
              errors.push(`Failed to create ad group ${adGroup.name}`);
              continue;
            }
            createdAdGroups++;

            // 5. Create keywords for this ad group (batch all sub-themes)
            const keywordCriteria = [];
            for (const st of adGroup.subThemes) {
              for (const kw of st.keywords) {
                const matchType = kw.matchType === 'Exact'
                  ? enums.KeywordMatchType.EXACT
                  : enums.KeywordMatchType.PHRASE;
                keywordCriteria.push({
                  ad_group: adGroupResourceName,
                  keyword: { text: kw.keyword, match_type: matchType },
                  status: enums.AdGroupCriterionStatus.ENABLED,
                });
              }
            }

            if (keywordCriteria.length > 0) {
              // Batch in groups of 5000 (API limit)
              for (let i = 0; i < keywordCriteria.length; i += 5000) {
                const batch = keywordCriteria.slice(i, i + 5000);
                try {
                  const kwResult = await customer.adGroupCriteria.create(batch);
                  createdKeywords += kwResult.results?.length ?? batch.length;
                } catch (err) {
                  errors.push(`Failed to create keywords for ${adGroup.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
                }
              }
            }
          } catch (err) {
            errors.push(`Failed to create ad group ${adGroup.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
          }
        }
      } catch (err) {
        errors.push(`Failed to create campaign ${campaign.campaignName}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    return {
      created: { campaigns: createdCampaigns, adGroups: createdAdGroups, keywords: createdKeywords },
      errors,
    };
  }

  private calculateAvgCpcMicros(adGroup: CampaignStructureV2['adGroups'][0]): number {
    let totalCpc = 0;
    let count = 0;
    for (const st of adGroup.subThemes) {
      for (const kw of st.keywords) {
        if (kw.cpc > 0) {
          totalCpc += kw.cpc;
          count++;
        }
      }
    }
    return count > 0 ? Math.round((totalCpc / count) * 1_000_000) : 0;
  }
}
