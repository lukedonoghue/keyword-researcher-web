import type { CampaignStructure, CampaignRow } from '../types/index';

export function generateCampaignCsv(campaigns: CampaignStructure[], defaultUrl: string): string {
  const rows: CampaignRow[] = [];

  for (const campaign of campaigns) {
    for (const [adGroupName, keywords] of Object.entries(campaign.adGroups)) {
      for (const kw of keywords) {
        rows.push({
          campaign: campaign.campaignName,
          adGroup: adGroupName,
          keyword: kw.keyword,
          matchType: kw.matchType,
          maxCpc: kw.cpc,
          finalUrl: campaign.landingPage || defaultUrl,
          status: 'Enabled',
          estVolume: kw.volume,
          estCpcLow: kw.cpcLow ?? 0,
          estCpcHigh: kw.cpcHigh ?? 0,
          competitionIndex: kw.competitionIndex ?? 0,
          qualityScore: kw.qualityScore ?? 0,
          qualityRating: kw.qualityRating ?? '',
        });
      }
    }
  }

  const headers = [
    'Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Max CPC',
    'Final URL', 'Status', 'Est. Volume', 'Est. CPC Low', 'Est. CPC High',
    'Competition Index', 'Quality Score', 'Quality Rating',
  ];

  const csvLines = [
    headers.join(','),
    ...rows.map((row) => [
      csvEscape(row.campaign),
      csvEscape(row.adGroup),
      csvEscape(row.keyword),
      row.matchType,
      row.maxCpc.toFixed(2),
      csvEscape(row.finalUrl),
      row.status,
      row.estVolume,
      row.estCpcLow.toFixed(2),
      row.estCpcHigh.toFixed(2),
      row.competitionIndex,
      row.qualityScore,
      row.qualityRating,
    ].join(',')),
  ];

  return csvLines.join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
