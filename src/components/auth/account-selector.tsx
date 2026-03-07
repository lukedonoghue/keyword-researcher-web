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

function findNodeById(nodes: GoogleAdsAccountNode[], customerId: string): GoogleAdsAccountNode | null {
  for (const node of nodes) {
    if (node.customerId === customerId) return node;
    const nested = findNodeById(node.children, customerId);
    if (nested) return nested;
  }
  return null;
}

type ScopeLevel = {
  level: number;
  managerNode: GoogleAdsAccountNode | null;
  nodes: GoogleAdsAccountNode[];
  accounts: GoogleAdsAccountNode[];
  managers: GoogleAdsAccountNode[];
};

function isSelectableLeafAccount(node: GoogleAdsAccountNode): boolean {
  if (node.isManager) return false;
  if (!node.status) return true;
  return node.status === '2' || node.status.toUpperCase() === 'ENABLED';
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
  const [selectedManagerPath, setSelectedManagerPath] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountSearchQueries, setAccountSearchQueries] = useState<Record<number, string>>({});
  const [managerSearchQueries, setManagerSearchQueries] = useState<Record<number, string>>({});
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
  const flattenedRootManager = useMemo(() => {
    if (hierarchy.length === 1 && hierarchy[0]?.isManager) {
      return hierarchy[0];
    }
    return null;
  }, [hierarchy]);
  const scopeRootNodes = useMemo(
    () => (flattenedRootManager ? flattenedRootManager.children : hierarchy),
    [flattenedRootManager, hierarchy],
  );

  useEffect(() => {
    if (initialized || hierarchy.length === 0) return;
    setSelectedManagerPath([]);
    setSelectedAccountId('');
    setAccountSearchQueries({});
    setManagerSearchQueries({});
    setInitialized(true);
  }, [hierarchy, initialized]);

  useEffect(() => {
    setSelectedManagerPath((prev) => {
      let currentNodes = scopeRootNodes;
      const nextPath: string[] = [];

      for (const nodeId of prev) {
        const nextManager = currentNodes.find((node) => node.customerId === nodeId && node.isManager);
        if (!nextManager) break;
        nextPath.push(nodeId);
        currentNodes = nextManager.children;
      }

      return prev.length === nextPath.length && prev.every((nodeId, index) => nodeId === nextPath[index])
        ? prev
        : nextPath;
    });
  }, [scopeRootNodes]);

  const scopeLevels = useMemo(() => {
    const levels: ScopeLevel[] = [];
    let currentNodes = scopeRootNodes;
    let managerNode: GoogleAdsAccountNode | null = null;

    for (let level = 0; ; level += 1) {
      const accounts = currentNodes.filter((node) => isSelectableLeafAccount(node));
      const managers = currentNodes.filter((node) => node.isManager);

      levels.push({ level, managerNode, nodes: currentNodes, accounts, managers });

      const nextManagerId = selectedManagerPath[level];
      if (!nextManagerId) break;

      const nextManager = currentNodes.find((node) => node.customerId === nextManagerId && node.isManager);
      if (!nextManager) break;

      managerNode = nextManager;
      currentNodes = nextManager.children;
    }

    return levels;
  }, [scopeRootNodes, selectedManagerPath]);

  const selectedManagerNodes = useMemo(
    () =>
      selectedManagerPath
        .map((nodeId) => findNodeById(hierarchy, nodeId))
        .filter((node): node is GoogleAdsAccountNode => node !== null && node.isManager),
    [hierarchy, selectedManagerPath],
  );

  const selectedLeafNode = useMemo(() => {
    if (!selectedAccountId) return null;
    const node = findNodeById(hierarchy, selectedAccountId);
    return node && !node.isManager ? node : null;
  }, [hierarchy, selectedAccountId]);

  const activeManagerContext = useMemo(() => {
    if (selectedManagerNodes.length > 0) {
      return selectedManagerNodes[selectedManagerNodes.length - 1] ?? null;
    }
    if (
      flattenedRootManager &&
      selectedLeafNode &&
      flattenedRootManager.children.some((node) => node.customerId === selectedLeafNode.customerId)
    ) {
      return flattenedRootManager;
    }
    return null;
  }, [flattenedRootManager, selectedLeafNode, selectedManagerNodes]);

  const currentScope = scopeLevels[scopeLevels.length - 1] ?? null;

  useEffect(() => {
    setSelectedAccountId((prev) => {
      if (!prev) return prev;
      return currentScope?.accounts.some((node) => node.customerId === prev) ? prev : '';
    });
  }, [currentScope]);

  const selectionBreadcrumb = useMemo(() => {
    const labels = [
      ...(flattenedRootManager && (selectedManagerNodes.length > 0 || selectedLeafNode)
        ? [flattenedRootManager.descriptiveName]
        : []),
      ...selectedManagerNodes
      .map((node) => node.descriptiveName)
    ];

    return labels
      .filter((label): label is string => Boolean(label))
      .join(' / ');
  }, [flattenedRootManager, selectedLeafNode, selectedManagerNodes]);

  const handleManagerChange = (level: number, nodeId: string) => {
    setSelectedManagerPath((prev) => [...prev.slice(0, level), nodeId]);
    setSelectedAccountId('');
    setAccountSearchQueries((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => Number(key) <= level))
    );
    setManagerSearchQueries((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => Number(key) <= level))
    );
  };

  const handleAccountChange = (level: number, nodeId: string) => {
    setSelectedManagerPath((prev) => prev.slice(0, level));
    setSelectedAccountId(nodeId);
    setAccountSearchQueries((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => Number(key) <= level))
    );
    setManagerSearchQueries((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => Number(key) <= level))
    );
  };

  const handleAccountSearchChange = (level: number, query: string) => {
    setAccountSearchQueries((prev) => ({ ...prev, [level]: query }));
  };

  const handleManagerSearchChange = (level: number, query: string) => {
    setManagerSearchQueries((prev) => ({ ...prev, [level]: query }));
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

      <div className="space-y-4">
        {scopeLevels.map(({ level, accounts, managers }) => {
          const selectedAccountValue =
            selectedLeafNode && level === selectedManagerPath.length
              ? selectedLeafNode.customerId
              : '';
          const selectedManagerValue = selectedManagerPath[level] ?? '';
          const accountQuery = (accountSearchQueries[level] ?? '').trim().toLowerCase();
          const managerQuery = (managerSearchQueries[level] ?? '').trim().toLowerCase();
          const filteredAccounts = accounts.filter((node) => {
            if (node.customerId === selectedAccountValue) return true;
            if (!accountQuery) return true;
            return `${node.descriptiveName} ${node.customerId}`.toLowerCase().includes(accountQuery);
          });
          const filteredManagers = managers.filter((node) => {
            if (node.customerId === selectedManagerValue) return true;
            if (!managerQuery) return true;
            return `${node.descriptiveName} ${node.customerId}`.toLowerCase().includes(managerQuery);
          });

          return (
            <div key={`scope-level-${level}`} className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {level === 0 ? 'Select Account Or MCC' : `Child Level ${level + 1}`}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Direct Accounts
                  </p>
                  <Input
                    value={accountSearchQueries[level] ?? ''}
                    onChange={(event) => handleAccountSearchChange(level, event.target.value)}
                    placeholder="Search by account name or ID"
                    className="h-8 text-xs"
                  />
                  <Select
                    value={selectedAccountValue}
                    onValueChange={(nodeId) => handleAccountChange(level, nodeId)}
                  >
                    <SelectTrigger size="sm" className="h-9 text-xs">
                      <SelectValue placeholder={level === 0 ? 'Select direct account' : 'Select child account'} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAccounts.length > 0 ? filteredAccounts.map((node) => (
                        <SelectItem key={node.customerId} value={node.customerId}>
                          {`Account · ${node.descriptiveName}`}
                        </SelectItem>
                      )) : (
                        <SelectItem value={`__no_accounts__${level}`} disabled>
                          No direct accounts in this scope
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Child MCCs
                  </p>
                  <Input
                    value={managerSearchQueries[level] ?? ''}
                    onChange={(event) => handleManagerSearchChange(level, event.target.value)}
                    placeholder="Search by MCC name or ID"
                    className="h-8 text-xs"
                  />
                  <Select
                    value={selectedManagerValue}
                    onValueChange={(nodeId) => handleManagerChange(level, nodeId)}
                  >
                    <SelectTrigger size="sm" className="h-9 text-xs">
                      <SelectValue placeholder={level === 0 ? 'Select child MCC' : `Select child MCC level ${level + 1}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredManagers.length > 0 ? filteredManagers.map((node) => (
                        <SelectItem key={node.customerId} value={node.customerId}>
                          {`MCC · ${node.descriptiveName} (${node.children.length} children)`}
                        </SelectItem>
                      )) : (
                        <SelectItem value={`__no_managers__${level}`} disabled>
                          No child MCCs in this scope
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{currentScope?.accounts.length ?? 0} direct accounts</Badge>
          <Badge variant="secondary">{currentScope?.managers.length ?? 0} child MCCs</Badge>
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
