'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react';

interface GroupInfo<TData> {
  campaign: string;
  priority: string;
  adGroup: string;
  rows: TData[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  groupedData?: GroupInfo<TData>[];
  defaultSorting?: SortingState;
  defaultColumnVisibility?: VisibilityState;
  defaultPageSize?: number;
  toolbar?: React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  groupedData,
  defaultSorting = [],
  defaultColumnVisibility = {},
  defaultPageSize = 50,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(defaultSorting);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility);
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);

  // Initialize all groups as expanded
  React.useEffect(() => {
    if (!groupedData || groupedData.length === 0) return;
    setExpandedGroups((prev) => {
      if (prev.size > 0) return prev;
      return new Set(groupedData.map((g) => `${g.campaign}|||${g.adGroup}`));
    });
  }, [groupedData]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const visibleColumns = table.getVisibleFlatColumns();
  const colCount = visibleColumns.length;

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // For grouped mode, sort the rows within each group according to table sorting
  const sortedRows = table.getSortedRowModel().rows;
  const sortedData = React.useMemo(() => sortedRows.map((r) => r.original), [sortedRows]);

  // Build grouped sorted data
  const groupedSorted = React.useMemo(() => {
    if (!groupedData) return null;

    // Build an index from original data to sorted position
    const sortedIndex = new Map<TData, number>();
    sortedData.forEach((item, idx) => sortedIndex.set(item, idx));

    return groupedData.map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => {
        const ai = sortedIndex.get(a) ?? 0;
        const bi = sortedIndex.get(b) ?? 0;
        return ai - bi;
      }),
    }));
  }, [groupedData, sortedData]);

  // Pagination for grouped mode
  const totalRows = groupedSorted
    ? groupedSorted.reduce((sum, g) => sum + g.rows.length, 0)
    : sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const clampedPageIndex = Math.min(pageIndex, pageCount - 1);

  // For grouped mode, calculate which groups/rows to show on current page
  const pagedGroups = React.useMemo(() => {
    if (!groupedSorted) return null;
    const start = clampedPageIndex * pageSize;
    const end = start + pageSize;
    let runningIdx = 0;
    const result: { campaign: string; priority: string; adGroup: string; rows: TData[]; isPartial: boolean }[] = [];

    for (const group of groupedSorted) {
      const groupStart = runningIdx;
      const groupEnd = runningIdx + group.rows.length;

      if (groupEnd > start && groupStart < end) {
        const sliceStart = Math.max(0, start - groupStart);
        const sliceEnd = Math.min(group.rows.length, end - groupStart);
        result.push({
          ...group,
          rows: group.rows.slice(sliceStart, sliceEnd),
          isPartial: sliceStart > 0 || sliceEnd < group.rows.length,
        });
      }
      runningIdx = groupEnd;
    }
    return result;
  }, [groupedSorted, clampedPageIndex, pageSize]);

  // For non-grouped mode, paginate sorted rows
  const pagedRows = React.useMemo(() => {
    if (groupedData) return [];
    const start = clampedPageIndex * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [groupedData, sortedRows, clampedPageIndex, pageSize]);

  const showingCount = pagedGroups
    ? pagedGroups.reduce((sum, g) => sum + g.rows.length, 0)
    : pagedRows.length;

  return (
    <div className="space-y-2">
      {toolbar}

      <div className="rounded-md border [&_[data-slot=table-container]]:overflow-x-auto [&_[data-slot=table-container]]:overflow-y-visible">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  if (!header.column.getIsVisible()) return null;
                  return (
                    <TableHead key={header.id} className="text-[10px] h-8 px-2">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pagedGroups ? (
              // Grouped rendering
              pagedGroups.length > 0 ? (
                pagedGroups.map((group) => {
                  const key = `${group.campaign}|||${group.adGroup}`;
                  const isExpanded = expandedGroups.has(key);
                  const campaignShort = group.campaign.replace('Service - ', '');
                  return (
                    <React.Fragment key={key}>
                      {/* Group header row */}
                      <TableRow
                        className="h-8 bg-muted/30 hover:bg-muted/50 cursor-pointer border-b"
                        onClick={() => toggleGroup(key)}
                      >
                        <TableCell colSpan={colCount} className="py-1 px-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            <span className="font-semibold">{campaignShort}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="font-medium">{group.adGroup}</span>
                            <span className="text-muted-foreground ml-1">({group.rows.length} kw)</span>
                            {group.priority && (
                              <span className={`text-[9px] px-1.5 py-0 rounded-full font-medium ${
                                group.priority === 'high' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                : group.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                                {group.priority.charAt(0).toUpperCase() + group.priority.slice(1)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Keyword rows */}
                      {isExpanded && group.rows.map((item, rowIdx) => {
                        const row = sortedRows.find((r) => r.original === item);
                        if (!row) return null;
                        return (
                          <TableRow key={`${key}-${rowIdx}`} className="h-7">
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id} className="text-[11px] py-0.5 px-2">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-16 text-center text-xs text-muted-foreground">
                    No results.
                  </TableCell>
                </TableRow>
              )
            ) : (
              // Flat rendering
              pagedRows.length ? (
                pagedRows.map((row) => (
                  <TableRow key={row.id} className="h-7">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-[11px] py-0.5 px-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-16 text-center text-xs text-muted-foreground">
                    No results.
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
          Showing {showingCount} of {totalRows} rows
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Rows:</span>
            <Select
              value={pageSize >= totalRows ? 'all' : String(pageSize)}
              onValueChange={(value) => {
                setPageSize(value === 'all' ? totalRows : Number(value));
                setPageIndex(0);
              }}
            >
              <SelectTrigger size="sm" className="h-7 text-[11px] w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageIndex(0)}
              disabled={clampedPageIndex === 0}
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={clampedPageIndex === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground px-2">
              {clampedPageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPageIndex >= pageCount - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageIndex(pageCount - 1)}
              disabled={clampedPageIndex >= pageCount - 1}
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
