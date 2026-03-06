import type { CampaignStructureV2, NegativeKeyword, NegativeKeywordList } from '../types/index';

export type CsvFormat =
  | 'google-ads-editor'
  | 'analysis'
  | 'diagnostic'
  | 'negative-lists'
  | 'negative-list-assignments';

/**
 * Google Ads Editor compatible CSV — imports directly into the desktop app.
 */
export function generateGoogleAdsEditorCsv(
  campaigns: CampaignStructureV2[],
  defaultUrl: string,
  negativeKeywords: NegativeKeyword[] = [],
): string {
  const headers = [
    'Campaign', 'Campaign type', 'Ad group', 'Keyword', 'Match type',
    'Max CPC', 'Final URL', 'Status', 'Bid strategy type',
    'Ad type',
    'Headline 1', 'Headline 2', 'Headline 3', 'Headline 4',
    'Headline 5', 'Headline 6', 'Headline 7', 'Headline 8',
    'Description 1', 'Description 2', 'Description 3', 'Description 4',
    'Path 1', 'Path 2',
  ];

  const rows: string[][] = [];
  for (const campaign of campaigns) {
    for (const ag of campaign.adGroups) {
      for (const st of ag.subThemes) {
        for (const kw of st.keywords) {
          rows.push([
            csvEscape(campaign.campaignName),
            'Search',
            csvEscape(ag.name),
            csvEscape(kw.keyword),
            kw.matchType,
            kw.cpc.toFixed(2),
            csvEscape(campaign.landingPage || defaultUrl),
            'Paused',
            campaign.bidStrategy || 'Maximize conversions',
            '',
            '', '', '', '',
            '', '', '', '',
            '', '', '', '',
            '', '',
          ]);
        }
      }

      const responsiveSearchAd = ag.responsiveSearchAd;
      if (responsiveSearchAd) {
        rows.push([
          csvEscape(campaign.campaignName),
          'Search',
          csvEscape(ag.name),
          '',
          '',
          '',
          csvEscape(campaign.landingPage || defaultUrl),
          'Paused',
          campaign.bidStrategy || 'Maximize conversions',
          'Responsive search ad',
          ...Array.from({ length: 8 }, (_, index) => csvEscape(responsiveSearchAd.headlines[index] || '')),
          ...Array.from({ length: 4 }, (_, index) => csvEscape(responsiveSearchAd.descriptions[index] || '')),
          csvEscape(responsiveSearchAd.path1 || ''),
          csvEscape(responsiveSearchAd.path2 || ''),
        ]);
      }
    }
  }

  // Append negative keywords
  for (const nk of negativeKeywords) {
    rows.push([
      csvEscape(nk.campaign),
      'Search',
      csvEscape(nk.adGroup || ''),
      csvEscape(nk.keyword),
      nk.matchType,
      '',
      '',
      'Negative',
      '',
      '',
      '', '', '', '',
      '', '', '', '',
      '', '', '', '',
      '', '',
    ]);
  }

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Full analysis CSV with all metrics, quality scores, and competition data.
 */
export function generateAnalysisCsv(campaigns: CampaignStructureV2[], defaultUrl: string): string {
  const headers = [
    'Campaign', 'Campaign Theme', 'Ad Group', 'Sub-theme', 'Keyword', 'Match Type',
    'Max CPC', 'Final URL', 'Status', 'Est. Volume', 'Est. CPC Low', 'Est. CPC High',
    'Competition Index', 'Quality Score', 'Quality Rating', 'Bid Strategy',
    'Priority', 'Priority Score', 'Recommended Bid Strategy',
    'RSA Headlines', 'RSA Descriptions', 'RSA Path 1', 'RSA Path 2',
  ];

  const rows: string[][] = [];
  for (const campaign of campaigns) {
    for (const ag of campaign.adGroups) {
      for (const st of ag.subThemes) {
        for (const kw of st.keywords) {
          const responsiveSearchAd = ag.responsiveSearchAd;
          rows.push([
            csvEscape(campaign.campaignName),
            csvEscape(campaign.campaignTheme || ''),
            csvEscape(ag.name),
            csvEscape(st.name),
            csvEscape(kw.keyword),
            kw.matchType,
            kw.cpc.toFixed(2),
            csvEscape(campaign.landingPage || defaultUrl),
            'Paused',
            String(kw.volume),
            (kw.cpcLow ?? 0).toFixed(2),
            (kw.cpcHigh ?? 0).toFixed(2),
            String(kw.competitionIndex ?? 0),
            String(kw.qualityScore ?? 0),
            kw.qualityRating ?? '',
            campaign.bidStrategy || 'Maximize conversions',
            (campaign.priority ?? '').charAt(0).toUpperCase() + (campaign.priority ?? '').slice(1),
            String(campaign.priorityScore ?? ''),
            csvEscape(campaign.recommendedBidStrategy ?? ''),
            csvEscape((responsiveSearchAd?.headlines ?? []).join(' | ')),
            csvEscape((responsiveSearchAd?.descriptions ?? []).join(' | ')),
            csvEscape(responsiveSearchAd?.path1 ?? ''),
            csvEscape(responsiveSearchAd?.path2 ?? ''),
          ]);
        }
      }
    }
  }

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function generateNegativeListsCsv(negativeKeywordLists: NegativeKeywordList[] = []): string {
  const headers = [
    'List Name', 'List Label', 'Scope', 'Default Match Type', 'Keyword',
    'Match Type', 'Enabled', 'Source', 'Reason', 'Variants', 'Occurrences', 'Campaign', 'Ad Group',
  ];

  const rows: string[][] = [];
  for (const list of negativeKeywordLists) {
    for (const item of list.items) {
      rows.push([
        csvEscape(list.name),
        csvEscape(list.label),
        list.scope,
        list.defaultMatchType,
        csvEscape(item.keyword),
        item.matchType,
        item.enabled ? 'TRUE' : 'FALSE',
        csvEscape(item.source),
        csvEscape(item.reasons.join('; ')),
        csvEscape((item.variants ?? []).join(' | ')),
        String(item.occurrences ?? ''),
        csvEscape(item.campaign ?? ''),
        csvEscape(item.adGroup ?? ''),
      ]);
    }
  }

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export function generateNegativeAssignmentsCsv(negativeKeywords: NegativeKeyword[] = []): string {
  const headers = ['List Name', 'Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Source', 'Reason', 'Status'];
  const rows = negativeKeywords.map((item) => ([
    csvEscape(item.listName ?? ''),
    csvEscape(item.campaign),
    csvEscape(item.adGroup || ''),
    csvEscape(item.keyword),
    item.matchType,
    csvEscape(item.source ?? ''),
    csvEscape(item.reason ?? ''),
    item.status,
  ]));

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function flattenSettings(value: unknown, prefix = ''): Array<[string, string]> {
  if (value === null || value === undefined) {
    return [[prefix, '']];
  }

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return [[prefix, String(value)]];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [[prefix, '']];
    const rows: Array<[string, string]> = [];
    value.forEach((item, index) => {
      const nextPrefix = `${prefix}[${index}]`;
      rows.push(...flattenSettings(item, nextPrefix));
    });
    return rows;
  }

  if (valueType === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [[prefix, '']];
    const rows: Array<[string, string]> = [];
    for (const [key, child] of entries) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      rows.push(...flattenSettings(child, nextPrefix));
    }
    return rows;
  }

  return [[prefix, String(value)]];
}

export function generateDiagnosticCsv(
  campaigns: CampaignStructureV2[],
  defaultUrl: string,
  negativeKeywords: NegativeKeyword[] = [],
  negativeKeywordLists: NegativeKeywordList[] = [],
  settings: Record<string, unknown> = {},
): string {
  const settingsHeader = ['Setting', 'Value'];
  const settingsRows = flattenSettings(settings)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, value]) => [csvEscape(key), csvEscape(value)]);

  const campaignCsv = generateGoogleAdsEditorCsv(campaigns, defaultUrl, negativeKeywords);

  return [
    settingsHeader.join(','),
    ...settingsRows.map((row) => row.join(',')),
    '',
    'NEGATIVE LISTS',
    generateNegativeListsCsv(negativeKeywordLists),
    '',
    'NEGATIVE ASSIGNMENTS',
    generateNegativeAssignmentsCsv(negativeKeywords),
    '',
    campaignCsv,
  ].join('\n');
}

/**
 * Default export function — dispatches to the appropriate format.
 */
export function generateCampaignCsv(
  campaigns: CampaignStructureV2[],
  defaultUrl: string,
  format: CsvFormat = 'google-ads-editor',
  negativeKeywords: NegativeKeyword[] = [],
  negativeKeywordLists: NegativeKeywordList[] = [],
  settings: Record<string, unknown> = {},
): string {
  if (format === 'analysis') {
    return generateAnalysisCsv(campaigns, defaultUrl);
  }
  if (format === 'negative-lists') {
    return generateNegativeListsCsv(negativeKeywordLists);
  }
  if (format === 'negative-list-assignments') {
    return generateNegativeAssignmentsCsv(negativeKeywords);
  }
  if (format === 'diagnostic') {
    return generateDiagnosticCsv(campaigns, defaultUrl, negativeKeywords, negativeKeywordLists, settings);
  }
  return generateGoogleAdsEditorCsv(campaigns, defaultUrl, negativeKeywords);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
