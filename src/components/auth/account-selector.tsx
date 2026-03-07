'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '@/providers/auth-provider';
import type { GoogleAdsAccountNode, GoogleAdsAccountSelection } from '@/lib/types/google-ads';
import { getErrorMessage } from '@/lib/utils';

type AccountsResponse = {
  hierarchy?: GoogleAdsAccountNode[];
  selection?: GoogleAdsAccountSelection;
  error?: string;
};

type AccountOption = {
  customerId: string;
  descriptiveName: string;
  label: string;
};

function collectLeafAccounts(node: GoogleAdsAccountNode, path: string[]): AccountOption[] {
  const nextPath = [...path, node.descriptiveName];
  if (!node.isManager) {
    return [{
      customerId: node.customerId,
      descriptiveName: node.descriptiveName,
      label: `${nextPath.join(' / ')} (${node.customerId})`,
    }];
  }

  return node.children.flatMap((child) => collectLeafAccounts(child, nextPath));
}

function findNodePath(nodes: GoogleAdsAccountNode[], targetCustomerId: string | null): string[] {
  if (!targetCustomerId) return [];

  for (const node of nodes) {
    if (node.customerId === targetCustomerId) {
      return [node.customerId];
    }

    const childPath = findNodePath(node.children, targetCustomerId);
    if (childPath.length > 0) {
      return [node.customerId, ...childPath];
    }
  }

  return [];
}

function findNodeById(nodes: GoogleAdsAccountNode[], customerId: string): GoogleAdsAccountNode | null {
  for (const node of nodes) {
    if (node.customerId === customerId) return node;
    const nested = findNodeById(node.children, customerId);
    if (nested) return nested;
  }
  return null;
}

export function AccountSelector() {
  const {
    customerId,
    loginCustomerId,
    selectedAccountName,
    selectAccount,
  } = useAuth();
  const [hierarchy, setHierarchy] = useState<GoogleAdsAccountNode[]>([]);
  const [selection, setSelection] = useState<GoogleAdsAccountSelection>({
    customerId: null,
    loginCustomerId: null,
    descriptiveName: null,
  });
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState('');
  const [error, setError] = useState('');
  const [selectedNodePath, setSelectedNodePath] = useState<string[]>([]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    const loadAccounts = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch('/api/google-ads/accounts', { cache: 'no-store' });
        const data = await res.json() as AccountsResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load Google Ads account hierarchy');
        }
        if (!active) return;
        setHierarchy(Array.isArray(data.hierarchy) ? data.hierarchy : []);
        setSelection(data.selection || {
          customerId: null,
          loginCustomerId: null,
          descriptiveName: null,
        });
        setInitialized(false);
      } catch (err: unknown) {
        if (!active) return;
        setError(getErrorMessage(err, 'Failed to load accounts'));
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAccounts();
    return () => {
      active = false;
    };
  }, []);

  const currentCustomerId = customerId || selection.customerId;
  const currentLoginCustomerId = loginCustomerId || selection.loginCustomerId;
  const currentLoginNode = useMemo(
    () => (currentLoginCustomerId ? findNodeById(hierarchy, currentLoginCustomerId) : null),
    [currentLoginCustomerId, hierarchy],
  );
  const fallbackSelectedNode = useMemo(
    () => (currentCustomerId ? findNodeById(hierarchy, currentCustomerId) : null),
    [currentCustomerId, hierarchy],
  );
  const currentAccountName = selectedAccountName || selection.descriptiveName || fallbackSelectedNode?.descriptiveName || null;

  useEffect(() => {
    if (initialized || hierarchy.length === 0) return;

    const fullPath = findNodePath(hierarchy, currentCustomerId);
    if (fullPath.length > 0) {
      setSelectedNodePath(fullPath);
    } else {
      setSelectedNodePath([]);
    }

    setInitialized(true);
  }, [currentCustomerId, hierarchy, initialized]);

  const levelGroups = useMemo(() => {
    const levels: Array<{
      level: number;
      options: GoogleAdsAccountNode[];
    }> = [];

    let currentNodes = hierarchy;
    let level = 0;

    while (currentNodes.length > 0) {
      levels.push({ level, options: currentNodes });

      const selectedNodeId = selectedNodePath[level];
      const selectedNode = currentNodes.find((node) => node.customerId === selectedNodeId);
      if (!selectedNode || !selectedNode.isManager) break;

      currentNodes = selectedNode.children;
      level += 1;
    }

    return levels;
  }, [hierarchy, selectedNodePath]);

  const selectedNodes = useMemo(
    () =>
      selectedNodePath
        .map((nodeId) => findNodeById(hierarchy, nodeId))
        .filter((node): node is GoogleAdsAccountNode => Boolean(node)),
    [hierarchy, selectedNodePath],
  );

  const selectedLeafNode = useMemo(() => {
    const lastNode = selectedNodes[selectedNodes.length - 1];
    if (!lastNode || lastNode.isManager) return null;
    return lastNode;
  }, [selectedNodes]);

  const activeManagerContext = useMemo(() => {
    const managerChain = selectedNodes.filter((node) => node.isManager);
    return managerChain[managerChain.length - 1] ?? null;
  }, [selectedNodes]);

  const currentScopeOptions = useMemo(() => {
    const lastSelectedNode = selectedNodes[selectedNodes.length - 1];
    if (lastSelectedNode?.isManager) {
      return lastSelectedNode.children;
    }

    if (selectedNodes.length >= 2) {
      const parentNode = selectedNodes[selectedNodes.length - 2];
      if (parentNode?.isManager) return parentNode.children;
    }

    return hierarchy;
  }, [hierarchy, selectedNodes]);

  const directAccountCount = useMemo(
    () => currentScopeOptions.filter((node) => !node.isManager).length,
    [currentScopeOptions],
  );

  const directManagerCount = useMemo(
    () => currentScopeOptions.filter((node) => node.isManager).length,
    [currentScopeOptions],
  );

  const selectionBreadcrumb = useMemo(() => {
    const labels = selectedNodes.map((node) => node.descriptiveName);

    return labels
      .filter((label): label is string => Boolean(label))
      .join(' / ');
  }, [selectedNodes]);

  const handleLevelChange = (level: number, nodeId: string) => {
    setSelectedNodePath((prev) => [...prev.slice(0, level), nodeId]);
    setSearchQueries((prev) => prev.slice(0, level + 1));
  };

  const handleSearchChange = (level: number, query: string) => {
    setSearchQueries((prev) => {
      const next = [...prev];
      next[level] = query;
      return next;
    });
  };

  const handleApplySelection = async () => {
    const selectedAccount = selectedLeafNode;
    if (!selectedAccount) return;

    try {
      setSubmittingId(selectedAccount.customerId);
      setError('');

      await selectAccount({
        customerId: selectedAccount.customerId,
        loginCustomerId: activeManagerContext?.customerId ?? null,
        descriptiveName: selectedAccount.descriptiveName,
      });

      setSelection({
        customerId: selectedAccount.customerId,
        loginCustomerId: activeManagerContext?.customerId ?? null,
        descriptiveName: selectedAccount.descriptiveName,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to select account'));
    } finally {
      setSubmittingId('');
    }
  };

  const selectionIsCurrent =
    Boolean(selectedLeafNode) &&
    selectedLeafNode?.customerId === currentCustomerId &&
    (activeManagerContext?.customerId ?? null) === currentLoginCustomerId;

  if (loading) return <p className="text-xs text-muted-foreground">Loading Google Ads account hierarchy...</p>;
  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (hierarchy.length === 0) return <p className="text-xs text-muted-foreground">No Google Ads accounts found.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Publish Target</Badge>
          {currentCustomerId ? (
            <>
              <span className="text-sm font-medium">{currentAccountName || `Account ${currentCustomerId}`}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{currentCustomerId}</span>
              {currentLoginCustomerId && (
                <span className="text-xs text-muted-foreground">
                  via {currentLoginNode?.descriptiveName || `MCC ${currentLoginCustomerId}`}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Choose the manager context, then the exact ad account to publish into.</span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Additional MCC dropdowns appear automatically when the selected manager contains another MCC layer.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {levelGroups.map(({ level, options }) => (
          <div key={`manager-level-${level}`} className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {level === 0 ? 'Select Account or MCC' : `Child Level ${level + 1}`}
            </p>
            <Input
              value={searchQueries[level] ?? ''}
              onChange={(event) => handleSearchChange(level, event.target.value)}
              placeholder="Search by account name or ID"
              className="h-8 text-xs"
            />
            <Select
              value={selectedNodePath[level] ?? ''}
              onValueChange={(value) => handleLevelChange(level, value)}
            >
              <SelectTrigger size="sm" className="h-9 text-xs">
                <SelectValue placeholder={level === 0 ? 'Select account or MCC' : 'Select child account or MCC'} />
              </SelectTrigger>
              <SelectContent>
                {options
                  .filter((node) => {
                    if (node.customerId === selectedNodePath[level]) return true;
                    const query = (searchQueries[level] ?? '').trim().toLowerCase();
                    if (!query) return true;
                    const haystack = `${node.descriptiveName} ${node.customerId}`.toLowerCase();
                    return haystack.includes(query);
                  })
                  .map((node) => {
                  const descendantCount = node.isManager ? collectLeafAccounts(node, []).length : 0;
                  return (
                    <SelectItem key={node.customerId} value={node.customerId}>
                      {node.isManager ? `MCC · ${node.descriptiveName} (${descendantCount} accounts)` : `Account · ${node.descriptiveName}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{directAccountCount} direct accounts</Badge>
          <Badge variant="secondary">{directManagerCount} child MCCs</Badge>
          {selectionBreadcrumb && (
            <span className="text-xs text-muted-foreground">
              Current path: {selectionBreadcrumb}
            </span>
          )}
          {selectedLeafNode && (
            <span className="text-xs text-muted-foreground">
              Ready to publish into {selectedLeafNode.descriptiveName}
            </span>
          )}
          {!selectionBreadcrumb && (
            <span className="text-xs text-muted-foreground">Direct account access only</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant={selectionIsCurrent ? 'outline' : 'brand'}
          className="h-8"
          disabled={!selectedLeafNode || Boolean(submittingId) || selectionIsCurrent}
          onClick={() => void handleApplySelection()}
        >
          {selectionIsCurrent ? 'Selected' : submittingId ? 'Selecting...' : 'Use This Account'}
        </Button>
      </div>
    </div>
  );
}
