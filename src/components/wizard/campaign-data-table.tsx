'use client';

import { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, SlidersHorizontal, Search } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CampaignStructureV2, KeywordIntent, AdGroupPriority } from '@/lib/types/index';

type CampaignKeywordRow = {
  campaign: string;
  priority: 'high' | 'medium' | 'low' | '';
  adGroupPriority: AdGroupPriority | '';
  adGroup: string;
  keyword: string;
  matchType: string;
  volume: number;
  cpc: number;
  cpcLow: number;
  cpcHigh: number;
  competitionIndex: number;
  qualityScore: number;
  qualityRating: string;
  intent: KeywordIntent | '';
  landingPage: string;
  bidStrategy: string;
  recommendedBidStrategy: string;
};

const priorityColors = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
} as const;

const adGroupPriorityColors: Record<string, string> = {
  core: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  recommended: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  additional: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const adGroupPriorityLabels: Record<string, string> = {
  core: 'Core',
  recommended: 'Recommended',
  additional: 'Additional',
};

const qualityLabels: Record<string, string> = {
  A: 'High',
  B: 'Good',
  C: 'Medium',
  D: 'Low',
  F: 'Poor',
};

const qualityColors: Record<string, string> = {
  A: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  B: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  C: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  D: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  F: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const intentColors: Record<string, string> = {
  transactional: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  commercial: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  informational: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  navigational: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  unknown: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const intentLabels: Record<string, string> = {
  transactional: 'Transactional',
  commercial: 'Commercial',
  informational: 'Informational',
  navigational: 'Navigational',
  unknown: 'Unknown',
};

function flattenCampaigns(campaigns: CampaignStructureV2[]): CampaignKeywordRow[] {
  const rows: CampaignKeywordRow[] = [];
  for (const campaign of campaigns) {
    for (const ag of campaign.adGroups) {
      for (const st of ag.subThemes) {
        for (const kw of st.keywords) {
          rows.push({
            campaign: campaign.campaignName,
            priority: campaign.priority || '',
            adGroupPriority: ag.priority || '',
            adGroup: ag.name,
            keyword: kw.keyword,
            matchType: kw.matchType,
            volume: kw.volume,
            cpc: kw.cpc,
            cpcLow: kw.cpcLow ?? 0,
            cpcHigh: kw.cpcHigh ?? 0,
            competitionIndex: kw.competitionIndex ?? 0,
            qualityScore: kw.qualityScore ?? 0,
            qualityRating: kw.qualityRating ?? '',
            intent: kw.intent ?? '',
            landingPage: campaign.landingPage ?? '',
            bidStrategy: campaign.bidStrategy,
            recommendedBidStrategy: campaign.recommendedBidStrategy ?? '',
          });
        }
      }
    }
  }
  return rows;
}

function SortableHeader({ column, label }: { column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' }; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sorted ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </button>
  );
}

const columns: ColumnDef<CampaignKeywordRow>[] = [
  {
    accessorKey: 'campaign',
    header: ({ column }) => <SortableHeader column={column} label="Campaign" />,
    cell: ({ getValue }) => (
      <span className="block min-w-[140px] max-w-[220px] truncate" title={getValue<string>()}>
        {getValue<string>().replace('Service - ', '')}
      </span>
    ),
  },
  {
    accessorKey: 'priority',
    header: ({ column }) => <SortableHeader column={column} label="Campaign Priority" />,
    cell: ({ getValue }) => {
      const v = getValue<string>();
      if (!v) return null;
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[v as keyof typeof priorityColors]}`}>
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </span>
      );
    },
  },
  {
    accessorKey: 'adGroupPriority',
    header: ({ column }) => <SortableHeader column={column} label="Ad Group Tier" />,
    cell: ({ getValue }) => {
      const v = getValue<string>();
      if (!v) return null;
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${adGroupPriorityColors[v] ?? 'bg-gray-100 text-gray-600'}`}>
          {adGroupPriorityLabels[v] ?? v}
        </span>
      );
    },
  },
  {
    accessorKey: 'adGroup',
    header: ({ column }) => <SortableHeader column={column} label="Ad Group" />,
    cell: ({ getValue }) => (
      <span className="block min-w-[220px] max-w-[320px] whitespace-normal leading-4" title={getValue<string>()}>
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'keyword',
    header: ({ column }) => <SortableHeader column={column} label="Keyword" />,
    cell: ({ row }) => {
      const kw = row.getValue<string>('keyword');
      const mt = row.original.matchType;
      const formatted = mt === 'Exact' ? `[${kw}]` : mt === 'Phrase' ? `"${kw}"` : kw;
      return <span className="block min-w-[260px] font-mono whitespace-normal break-words">{formatted}</span>;
    },
  },
  {
    accessorKey: 'matchType',
    header: ({ column }) => <SortableHeader column={column} label="Match" />,
    cell: ({ getValue }) => {
      const v = getValue<string>();
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          {v}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'intent',
    header: ({ column }) => <SortableHeader column={column} label="Intent" />,
    cell: ({ getValue }) => {
      const v = getValue<string>();
      if (!v) return null;
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${intentColors[v] ?? 'bg-gray-100 text-gray-500'}`}>
          {intentLabels[v] ?? v}
        </span>
      );
    },
  },
  {
    accessorKey: 'volume',
    header: ({ column }) => (
      <div className="text-right">
        <SortableHeader column={column} label="Volume" />
      </div>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-right block">{getValue<number>().toLocaleString()}</span>
    ),
  },
  {
    accessorKey: 'cpc',
    header: ({ column }) => (
      <div className="text-right">
        <SortableHeader column={column} label="CPC" />
      </div>
    ),
    cell: ({ row }) => {
      const cpc = row.getValue<number>('cpc');
      const low = row.original.cpcLow;
      const high = row.original.cpcHigh;
      if (cpc === 0) {
        return (
          <span className="text-right block text-[10px] text-muted-foreground italic">Low data</span>
        );
      }
      if (low > 0 || high > 0) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="tabular-nums text-right block cursor-help">
                ${cpc.toFixed(2)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs tabular-nums">
              <p>Top of page (low): ${low.toFixed(2)}</p>
              <p>Top of page (high): ${high.toFixed(2)}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
      return (
        <span className="tabular-nums text-right block">${cpc.toFixed(2)}</span>
      );
    },
  },
  {
    accessorKey: 'cpcLow',
    header: ({ column }) => (
      <div className="text-right">
        <SortableHeader column={column} label="CPC Low" />
      </div>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-right block">${getValue<number>().toFixed(2)}</span>
    ),
  },
  {
    accessorKey: 'cpcHigh',
    header: ({ column }) => (
      <div className="text-right">
        <SortableHeader column={column} label="CPC High" />
      </div>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-right block">${getValue<number>().toFixed(2)}</span>
    ),
  },
  {
    accessorKey: 'competitionIndex',
    header: ({ column }) => (
      <div className="text-right">
        <SortableHeader column={column} label="Competition" />
      </div>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-right block">{getValue<number>()}</span>
    ),
  },
  {
    accessorKey: 'qualityRating',
    header: ({ column }) => <SortableHeader column={column} label="Quality" />,
    cell: ({ row }) => {
      const rating = row.getValue<string>('qualityRating');
      if (!rating) return null;
      return (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${qualityColors[rating] ?? 'bg-gray-100 text-gray-600'}`}
          title={`Quality: ${qualityLabels[rating] ?? rating} (${rating})`}
        >
          {qualityLabels[rating] ?? rating}
        </span>
      );
    },
  },
  {
    accessorKey: 'landingPage',
    header: 'Landing Page',
    cell: ({ getValue }) => (
      <span className="font-mono text-muted-foreground truncate max-w-[200px] block" title={getValue<string>()}>
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'bidStrategy',
    header: 'Bid Strategy',
  },
  {
    accessorKey: 'recommendedBidStrategy',
    header: 'Rec. Strategy',
    cell: ({ getValue }) => {
      const v = getValue<string>();
      return v ? <span className="text-primary/80">{v}</span> : null;
    },
  },
];

const defaultColumnVisibility: Record<string, boolean> = {
  campaign: false,
  priority: false,
  adGroupPriority: false,
  adGroup: false,
  cpcLow: false,
  cpcHigh: false,
  competitionIndex: false,
  landingPage: false,
  bidStrategy: false,
  recommendedBidStrategy: false,
};

export function CampaignDataTable({ campaigns }: { campaigns: CampaignStructureV2[] }) {
  const rows = useMemo(() => flattenCampaigns(campaigns), [campaigns]);

  const campaignNames = useMemo(
    () => [...new Set(campaigns.map((c) => c.campaignName))],
    [campaigns]
  );

  const matchTypes = useMemo(
    () => [...new Set(rows.map((r) => r.matchType))],
    [rows]
  );

  const [keywordFilter, setKeywordFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [adGroupPriorityFilter, setAdGroupPriorityFilter] = useState('core+recommended');
  const [matchTypeFilter, setMatchTypeFilter] = useState('all');
  const [colVisibility, setColVisibility] = useState(defaultColumnVisibility);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (campaignFilter !== 'all') {
      result = result.filter((r) => r.campaign === campaignFilter);
    }
    if (adGroupPriorityFilter === 'core+recommended') {
      result = result.filter((r) => r.adGroupPriority !== 'additional');
    } else if (adGroupPriorityFilter !== 'all') {
      result = result.filter((r) => r.adGroupPriority === adGroupPriorityFilter);
    }
    if (matchTypeFilter !== 'all') {
      result = result.filter((r) => r.matchType === matchTypeFilter);
    }
    if (keywordFilter) {
      const lower = keywordFilter.toLowerCase();
      result = result.filter((r) => r.keyword.toLowerCase().includes(lower));
    }
    return result;
  }, [rows, campaignFilter, adGroupPriorityFilter, matchTypeFilter, keywordFilter]);

  // Group rows by campaign > ad group for display
  const groupedData = useMemo(() => {
    const groups: { campaign: string; priority: string; adGroupPriority: string; adGroup: string; rows: CampaignKeywordRow[] }[] = [];
    const keyMap = new Map<string, CampaignKeywordRow[]>();

    for (const row of filteredRows) {
      const key = `${row.campaign}|||${row.adGroup}`;
      if (!keyMap.has(key)) {
        keyMap.set(key, []);
        groups.push({
          campaign: row.campaign,
          priority: row.priority,
          adGroupPriority: row.adGroupPriority,
          adGroup: row.adGroup,
          rows: keyMap.get(key)!,
        });
      }
      keyMap.get(key)!.push(row);
    }
    return groups;
  }, [filteredRows]);

  const allColumnKeys = columns.map((c) => ('accessorKey' in c ? (c.accessorKey as string) : '')).filter(Boolean);
  const visibilityWithDefaults = useMemo(() => {
    const vis: Record<string, boolean> = {};
    for (const key of allColumnKeys) {
      vis[key] = colVisibility[key] ?? !(key in defaultColumnVisibility);
    }
    return vis;
  }, [allColumnKeys, colVisibility]);

  const columnLabels: Record<string, string> = {
    campaign: 'Campaign',
    priority: 'Campaign Priority',
    adGroupPriority: 'Ad Group Tier',
    adGroup: 'Ad Group',
    keyword: 'Keyword',
    matchType: 'Match Type',
    intent: 'Intent',
    volume: 'Volume',
    cpc: 'CPC',
    cpcLow: 'CPC Low',
    cpcHigh: 'CPC High',
    competitionIndex: 'Competition',
    qualityRating: 'Quality',
    landingPage: 'Landing Page',
    bidStrategy: 'Bid Strategy',
    recommendedBidStrategy: 'Rec. Strategy',
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px] max-w-[260px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search keywords..."
          value={keywordFilter}
          onChange={(e) => setKeywordFilter(e.target.value)}
          className="h-8 text-xs pl-7"
        />
      </div>

      <Select value={campaignFilter} onValueChange={setCampaignFilter}>
        <SelectTrigger size="sm" className="h-8 text-[11px] w-auto min-w-[120px]">
          <SelectValue placeholder="Campaign" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Campaigns</SelectItem>
          {campaignNames.map((name) => (
            <SelectItem key={name} value={name}>
              {name.replace('Service - ', '')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={adGroupPriorityFilter} onValueChange={setAdGroupPriorityFilter}>
        <SelectTrigger size="sm" className="h-8 text-[11px] w-auto min-w-[130px]">
          <SelectValue placeholder="Ad Group Tier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="core+recommended">Core + Recommended</SelectItem>
          <SelectItem value="all">All Tiers</SelectItem>
          <SelectItem value="core">Core Only</SelectItem>
          <SelectItem value="recommended">Recommended Only</SelectItem>
          <SelectItem value="additional">Additional Only</SelectItem>
        </SelectContent>
      </Select>

      <Select value={matchTypeFilter} onValueChange={setMatchTypeFilter}>
        <SelectTrigger size="sm" className="h-8 text-[11px] w-auto min-w-[100px]">
          <SelectValue placeholder="Match Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {matchTypes.map((mt) => (
            <SelectItem key={mt} value={mt}>
              {mt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-[11px]">
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuLabel className="text-[11px]">Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allColumnKeys.map((key) => (
            <DropdownMenuCheckboxItem
              key={key}
              checked={visibilityWithDefaults[key] !== false}
              onCheckedChange={(checked) =>
                setColVisibility((prev) => ({ ...prev, [key]: !!checked }))
              }
              className="text-[11px]"
            >
              {columnLabels[key] ?? key}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-[11px] text-muted-foreground ml-auto">
        {filteredRows.length} of {rows.length} rows
        {groupedData.length > 0 && ` in ${groupedData.length} group${groupedData.length !== 1 ? 's' : ''}`}
      </span>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={filteredRows}
      groupedData={groupedData}
      defaultSorting={[{ id: 'volume', desc: true }]}
      defaultColumnVisibility={visibilityWithDefaults}
      defaultPageSize={50}
      toolbar={toolbar}
      hideCampaignLabelInGroups={campaignNames.length === 1}
    />
  );
}
