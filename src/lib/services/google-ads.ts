import { GoogleAdsApi, enums } from 'google-ads-api';

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
      page_size: 100,
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
}
