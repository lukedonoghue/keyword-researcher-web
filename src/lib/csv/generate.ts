import type { CampaignStructureV2, NegativeKeyword } from '../types/index';

export type CsvFormat = 'google-ads-editor' | 'analysis';

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
          ]);
        }
      }
    }
  }

  // Append negative keywords
  for (const nk of negativeKeywords) {
    rows.push([
      csvEscape(nk.campaign),
      'Search',
      '',
      csvEscape(nk.keyword),
      nk.matchType,
      '',
      '',
      'Negative',
      '',
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
  ];

  const rows: string[][] = [];
  for (const campaign of campaigns) {
    for (const ag of campaign.adGroups) {
      for (const st of ag.subThemes) {
        for (const kw of st.keywords) {
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
          ]);
        }
      }
    }
  }

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Default export function — dispatches to the appropriate format.
 */
export function generateCampaignCsv(
  campaigns: CampaignStructureV2[],
  defaultUrl: string,
  format: CsvFormat = 'google-ads-editor',
  negativeKeywords: NegativeKeyword[] = [],
): string {
  if (format === 'analysis') {
    return generateAnalysisCsv(campaigns, defaultUrl);
  }
  return generateGoogleAdsEditorCsv(campaigns, defaultUrl, negativeKeywords);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
