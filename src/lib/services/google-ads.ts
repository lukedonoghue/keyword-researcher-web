import { GoogleAdsApi, enums } from 'google-ads-api';
import type { CampaignStructureV2, NegativeKeyword, ResponsiveSearchAd } from '../types/index';
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
  private static readonly KEYWORD_IDEA_MAX_RESULTS = 500;
  private static readonly KEYWORD_IDEA_PAGE_SIZE = 100;
  private static readonly KEYWORD_IDEA_PAGE_LIMIT = 12;
  private static readonly SAFE_FALLBACK_MAX_CPC_MICROS = 5_000_000;
  private static readonly SAFE_FALLBACK_BUDGET_SHARE = 0.2;
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

  private toKeywordMatchType(matchType: string) {
    return matchType === 'Exact'
      ? enums.KeywordMatchType.EXACT
      : enums.KeywordMatchType.PHRASE;
  }

  private resolveSafeFallbackCpcMicros(dailyBudgetMicros: number): number {
    const budgetShareCap = Math.round(dailyBudgetMicros * GoogleAdsService.SAFE_FALLBACK_BUDGET_SHARE);
    return Math.max(
      1_000_000,
      Math.min(GoogleAdsService.SAFE_FALLBACK_MAX_CPC_MICROS, budgetShareCap || GoogleAdsService.SAFE_FALLBACK_MAX_CPC_MICROS),
    );
  }

  private resolveAdGroupBidMicros(
    avgCpcMicros: number,
    options: { dailyBudgetMicros: number; biddingStrategy: string },
  ): number | undefined {
    if (options.biddingStrategy !== 'MANUAL_CPC') {
      return undefined;
    }

    if (avgCpcMicros > 0) {
      return avgCpcMicros;
    }

    return this.resolveSafeFallbackCpcMicros(options.dailyBudgetMicros);
  }

  private sanitizeAdAssetText(text: string, maxLength: number): string {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (normalized.length <= maxLength) return normalized;
    return normalized.slice(0, maxLength).trim();
  }

  private createResponsiveSearchAdOperation(
    adGroupResourceName: string,
    finalUrl: string,
    responsiveSearchAd: ResponsiveSearchAd,
  ) {
    return {
      ad_group: adGroupResourceName,
      status: enums.AdGroupAdStatus.PAUSED,
      ad: {
        final_urls: [finalUrl],
        responsive_search_ad: {
          headlines: responsiveSearchAd.headlines.map((headline) => ({
            text: this.sanitizeAdAssetText(headline, 30),
          })),
          descriptions: responsiveSearchAd.descriptions.map((description) => ({
            text: this.sanitizeAdAssetText(description, 90),
          })),
          path1: responsiveSearchAd.path1 ? this.sanitizeAdAssetText(responsiveSearchAd.path1, 15) : undefined,
          path2: responsiveSearchAd.path2 ? this.sanitizeAdAssetText(responsiveSearchAd.path2, 15) : undefined,
        },
      },
    };
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

  private extractMetrics(row: Record<string, unknown>): Record<string, unknown> {
    const keywordRecord = this.asRecord(row.keyword);
    return this.asRecord(
      row.keyword_idea_metrics ||
      row.keywordIdeaMetrics ||
      row.metrics ||
      keywordRecord.keyword_idea_metrics
    );
  }

  private distinctMetricCounts(keywords: KeywordMetric[]): { cpcs: number; volumes: number } {
    const cpcs = new Set<number>();
    const volumes = new Set<number>();
    for (const keyword of keywords) {
      if (keyword.cpc > 0) {
        cpcs.add(Math.round(keyword.cpc * 1_000_000));
      }
      volumes.add(keyword.volume);
    }
    return { cpcs: cpcs.size, volumes: volumes.size };
  }

  private shouldRetryKeywordAndUrl(primary: KeywordMetric[]): boolean {
    if (primary.length < 20) return false;
    const counts = this.distinctMetricCounts(primary);
    return counts.cpcs <= 1 && counts.volumes <= 1;
  }

  private chooseBetterKeywordSet(primary: KeywordMetric[], fallback: KeywordMetric[]): KeywordMetric[] {
    if (fallback.length === 0) return primary;
    const primaryCounts = this.distinctMetricCounts(primary);
    const fallbackCounts = this.distinctMetricCounts(fallback);
    const primaryScore = primaryCounts.cpcs * 10_000 + primaryCounts.volumes;
    const fallbackScore = fallbackCounts.cpcs * 10_000 + fallbackCounts.volumes;

    if (fallbackScore > primaryScore) {
      console.log(
        `[generateKeywordIdeas] Using keyword-only fallback due to better diversity. primary cpcs=${primaryCounts.cpcs} volumes=${primaryCounts.volumes}; fallback cpcs=${fallbackCounts.cpcs} volumes=${fallbackCounts.volumes}`
      );
      return fallback;
    }

    return primary;
  }

  private dedupeKeywordIdeas(keywords: KeywordMetric[]): KeywordMetric[] {
    const deduped = new Map<string, KeywordMetric>();
    for (const keyword of keywords) {
      const key = keyword.text.toLowerCase();
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, keyword);
        continue;
      }

      const incomingCpc = keyword.cpc > 0 ? keyword.cpc : null;
      const existingCpc = existing.cpc > 0 ? existing.cpc : null;
      const better =
        incomingCpc !== null && existingCpc !== null && incomingCpc !== existingCpc ? (incomingCpc < existingCpc ? keyword : existing) :
        incomingCpc !== null && existingCpc === null ? keyword :
        existingCpc !== null && incomingCpc === null ? existing :
        keyword.volume > existing.volume ? keyword :
        existing;

      deduped.set(key, better);
    }
    return Array.from(deduped.values());
  }

  private async fetchKeywordIdeasPaged(
    customer: Awaited<ReturnType<GoogleAdsService['getCustomer']>>,
    baseRequest: Record<string, unknown>,
    maxResults: number = GoogleAdsService.KEYWORD_IDEA_MAX_RESULTS
  ): Promise<KeywordMetric[]> {
    const aggregated: KeywordMetric[] = [];
    const seenTokens = new Set<string>();
    let pageToken = '';

    for (let page = 0; page < GoogleAdsService.KEYWORD_IDEA_PAGE_LIMIT; page++) {
      const remaining = maxResults - aggregated.length;
      if (remaining <= 0) break;

      const request: Record<string, unknown> = {
        ...baseRequest,
        page_size: Math.min(GoogleAdsService.KEYWORD_IDEA_PAGE_SIZE, remaining),
      };
      if (pageToken) {
        request.page_token = pageToken;
      }

      const response = await this.withTimeout(
        customer.keywordPlanIdeas.generateKeywordIdeas(
          request as unknown as Parameters<typeof customer.keywordPlanIdeas.generateKeywordIdeas>[0]
        ),
        GoogleAdsService.REQUEST_TIMEOUT_MS,
        'Google Ads keyword idea request timed out.',
      );

      aggregated.push(...this.normalizeKeywordIdeas(response));
      const responseRecord = this.asRecord(response);
      const nextTokenRaw = responseRecord.next_page_token ?? responseRecord.nextPageToken;
      const nextToken = typeof nextTokenRaw === 'string' ? nextTokenRaw : '';
      if (!nextToken || seenTokens.has(nextToken)) {
        break;
      }

      seenTokens.add(nextToken);
      pageToken = nextToken;
    }

    return this.dedupeKeywordIdeas(aggregated).slice(0, maxResults);
  }

  private normalizeKeywordIdeas(response: unknown): KeywordMetric[] {
    const responseRecord = this.asRecord(response);
    const rows = Array.isArray(responseRecord.results)
      ? responseRecord.results
      : Array.isArray(response)
        ? response
        : [];

    // Sample raw metrics at different positions to check if they differ
    const sampleIndices = [0, Math.floor(rows.length / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i && v < rows.length);
    const rawSamples: Array<{ idx: number; text: string; lowBid: unknown; highBid: unknown; vol: unknown; sameRef: boolean }> = [];
    let firstMetricsRef: unknown = null;
    for (const idx of sampleIndices) {
      const row = this.asRecord(rows[idx]);
      const metricsRaw = row.keyword_idea_metrics || row.keywordIdeaMetrics || row.metrics;
      const metrics = this.asRecord(metricsRaw);
      const kw = this.asRecord(row.keyword);
      if (idx === 0) firstMetricsRef = metricsRaw;
      rawSamples.push({
        idx,
        text: String(row.text ?? kw.text ?? '').slice(0, 40),
        lowBid: metrics.low_top_of_page_bid_micros ?? metrics.lowTopOfPageBidMicros ?? '(missing)',
        highBid: metrics.high_top_of_page_bid_micros ?? metrics.highTopOfPageBidMicros ?? '(missing)',
        vol: metrics.avg_monthly_searches ?? metrics.avgMonthlySearches ?? '(missing)',
        sameRef: metricsRaw === firstMetricsRef,
      });
    }
    console.log(`[normalizeKeywordIdeas] ${rows.length} rows. Raw metric samples:`, JSON.stringify(rawSamples));

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

        const metrics = this.extractMetrics(row);
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
      : Array.isArray(responseRecord.geoTargetConstantSuggestions)
        ? responseRecord.geoTargetConstantSuggestions
        : Array.isArray(response) ? response : [];

    return suggestions
      .map((item: unknown) => {
        const suggestion = this.asRecord(item);
        const constant = this.asRecord(suggestion.geo_target_constant ?? suggestion.geoTargetConstant);
        const resourceName = typeof constant.resource_name === 'string'
          ? constant.resource_name
          : typeof constant.resourceName === 'string'
            ? constant.resourceName
            : '';
        const fallbackId = resourceName.split('/').pop() ?? '';
        const id = this.toNumber(constant.id) || this.toNumber(fallbackId);
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
        const reach = this.toNumber(suggestion.reach ?? suggestion.localeReach ?? suggestion.searchInterest);

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
    const baseRequest: Record<string, unknown> = {
      customer_id: this.customerId,
      language: `languageConstants/${languageId}`,
      geo_target_constants: geoTargetIds.map((id) => `geoTargetConstants/${id}`),
      keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH,
      include_adult_keywords: false,
      historical_metrics_options: {
        include_average_cpc: true,
      },
    };

    if (topSeeds.length > 0 && targetUrl) {
      const keywordAndUrlRequest: Record<string, unknown> = {
        ...baseRequest,
        keyword_and_url_seed: { keywords: topSeeds, url: targetUrl },
      };
      const primary = await this.fetchKeywordIdeasPaged(customer, keywordAndUrlRequest);

      if (!this.shouldRetryKeywordAndUrl(primary)) {
        return primary;
      }

      const keywordOnlyRequest: Record<string, unknown> = {
        ...baseRequest,
        keyword_seed: { keywords: topSeeds },
      };
      const fallback = await this.fetchKeywordIdeasPaged(customer, keywordOnlyRequest);
      return this.chooseBetterKeywordSet(primary, fallback);
    }

    if (topSeeds.length > 0) {
      return this.fetchKeywordIdeasPaged(customer, {
        ...baseRequest,
        keyword_seed: { keywords: topSeeds },
      });
    }

    return this.fetchKeywordIdeasPaged(customer, {
      ...baseRequest,
      url_seed: { url: targetUrl },
    });
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
      historical_metrics_options: {
        include_average_cpc: true,
      },
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
      negativeKeywords?: NegativeKeyword[];
      defaultFinalUrl?: string;
    }
  ): Promise<{ created: { campaigns: number; adGroups: number; keywords: number; ads: number }; errors: string[] }> {
    const customer = await this.getCustomer();
    const errors: string[] = [];
    let createdCampaigns = 0;
    let createdAdGroups = 0;
    let createdKeywords = 0;
    let createdAds = 0;

    for (const campaign of campaigns) {
      try {
        const adGroupResourceNames = new Map<string, string>();

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
            const adGroupBidMicros = this.resolveAdGroupBidMicros(avgCpcMicros, options);
            const adGroupResult = await customer.adGroups.create([{
              name: adGroup.name,
              campaign: campaignResourceName,
              type: enums.AdGroupType.SEARCH_STANDARD,
              ...(adGroupBidMicros ? { cpc_bid_micros: adGroupBidMicros } : {}),
              status: enums.AdGroupStatus.ENABLED,
            }]);
            const adGroupResourceName = adGroupResult.results?.[0]?.resource_name;
            if (!adGroupResourceName) {
              errors.push(`Failed to create ad group ${adGroup.name}`);
              continue;
            }
            adGroupResourceNames.set(adGroup.name, adGroupResourceName);
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

            const finalUrl = campaign.landingPage?.trim() || options.defaultFinalUrl?.trim();
            if (finalUrl && adGroup.responsiveSearchAd?.headlines.length && adGroup.responsiveSearchAd.descriptions.length) {
              try {
                const adResult = await customer.adGroupAds.create([
                  this.createResponsiveSearchAdOperation(adGroupResourceName, finalUrl, adGroup.responsiveSearchAd),
                ]);
                createdAds += adResult.results?.length ?? 1;
              } catch (err) {
                errors.push(`Failed to create RSA for ${adGroup.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
              }
            }
          } catch (err) {
            errors.push(`Failed to create ad group ${adGroup.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
          }
        }

        const campaignNegativeKeywords = (options.negativeKeywords ?? [])
          .filter((item) => item.campaign === campaign.campaignName);

        if (campaignNegativeKeywords.length > 0) {
          const campaignLevelNegatives = campaignNegativeKeywords
            .filter((item) => !item.adGroup)
            .map((item) => ({
              campaign: campaignResourceName,
              negative: true,
              keyword: {
                text: item.keyword,
                match_type: this.toKeywordMatchType(item.matchType),
              },
            }));

          if (campaignLevelNegatives.length > 0) {
            try {
              await customer.campaignCriteria.create(campaignLevelNegatives);
            } catch (err) {
              errors.push(`Failed to create campaign negatives for ${campaign.campaignName}: ${err instanceof Error ? err.message : 'unknown error'}`);
            }
          }

          const adGroupNegativeOperations = new Map<string, Array<{
            ad_group: string;
            negative: boolean;
            keyword: { text: string; match_type: ReturnType<GoogleAdsService['toKeywordMatchType']> };
          }>>();

          for (const item of campaignNegativeKeywords.filter((keyword) => Boolean(keyword.adGroup))) {
            const adGroupResourceName = adGroupResourceNames.get(item.adGroup);
            if (!adGroupResourceName) {
              errors.push(`Failed to find ad group ${item.adGroup} for negative keyword ${item.keyword}`);
              continue;
            }

            const existing = adGroupNegativeOperations.get(item.adGroup) ?? [];
            existing.push({
              ad_group: adGroupResourceName,
              negative: true,
              keyword: {
                text: item.keyword,
                match_type: this.toKeywordMatchType(item.matchType),
              },
            });
            adGroupNegativeOperations.set(item.adGroup, existing);
          }

          for (const [adGroupName, operations] of adGroupNegativeOperations.entries()) {
            try {
              await customer.adGroupCriteria.create(operations);
            } catch (err) {
              errors.push(`Failed to create negative keywords for ${adGroupName}: ${err instanceof Error ? err.message : 'unknown error'}`);
            }
          }
        }
      } catch (err) {
        errors.push(`Failed to create campaign ${campaign.campaignName}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    return {
      created: { campaigns: createdCampaigns, adGroups: createdAdGroups, keywords: createdKeywords, ads: createdAds },
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
