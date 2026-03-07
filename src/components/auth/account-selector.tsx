'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const PARENT_SCOPE_PREFIX = '__parent_scope__:';

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

function findManagerPath(
  nodes: GoogleAdsAccountNode[],
  targetManagerId: string | null,
  targetAccountId: string | null
): string[] {
  for (const node of nodes) {
    if (!node.isManager) continue;

    if (targetManagerId && node.customerId === targetManagerId) {
      return [node.customerId];
    }

    const childPath = findManagerPath(node.children, targetManagerId, targetAccountId);
    if (childPath.length > 0) {
      return [node.customerId, ...childPath];
    }

    if (targetAccountId) {
      const leafIds = collectLeafAccounts(node, []).map((account) => account.customerId);
      if (leafIds.includes(targetAccountId)) {
        return [node.customerId];
      }
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
  const [selectedManagerPath, setSelectedManagerPath] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
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
  const currentAccountName = selectedAccountName || selection.descriptiveName;

  useEffect(() => {
    if (initialized || hierarchy.length === 0) return;

    const initialManagerPath = findManagerPath(hierarchy, currentLoginCustomerId, currentCustomerId);
    setSelectedManagerPath(initialManagerPath);

    const contextNode = initialManagerPath.length > 0
      ? findNodeById(hierarchy, initialManagerPath[initialManagerPath.length - 1])
      : null;

    if (currentCustomerId) {
      if (contextNode) {
        const descendantAccounts = collectLeafAccounts(contextNode, []);
        if (descendantAccounts.some((account) => account.customerId === currentCustomerId)) {
          setSelectedAccountId(currentCustomerId);
        }
      } else {
        const rootLeafAccounts = hierarchy
          .filter((node) => !node.isManager)
          .map((node) => ({
            customerId: node.customerId,
            descriptiveName: node.descriptiveName,
          }));
        if (rootLeafAccounts.some((account) => account.customerId === currentCustomerId)) {
          setSelectedAccountId(currentCustomerId);
        }
      }
    }

    setInitialized(true);
  }, [currentCustomerId, currentLoginCustomerId, hierarchy, initialized]);

  const managerLevels = useMemo(() => {
    const levels: Array<{
      level: number;
      options: GoogleAdsAccountNode[];
    }> = [];

    let currentNodes = hierarchy;
    let level = 0;

    while (true) {
      const managers = currentNodes.filter((node) => node.isManager);
      if (managers.length === 0) break;

      levels.push({ level, options: managers });

      const selectedManagerId = selectedManagerPath[level];
      const selectedNode = managers.find((node) => node.customerId === selectedManagerId);
      if (!selectedNode) break;

      currentNodes = selectedNode.children;
      level += 1;
    }

    return levels;
  }, [hierarchy, selectedManagerPath]);

  const activeManager = useMemo(() => {
    if (selectedManagerPath.length === 0) return null;
    return findNodeById(hierarchy, selectedManagerPath[selectedManagerPath.length - 1]);
  }, [hierarchy, selectedManagerPath]);

  const accountOptions = useMemo(() => {
    if (activeManager) {
      return collectLeafAccounts(activeManager, []);
    }

    const rootLeafAccounts = hierarchy.filter((node) => !node.isManager);
    return rootLeafAccounts.map((node) => ({
      customerId: node.customerId,
      descriptiveName: node.descriptiveName,
      label: `${node.descriptiveName} (${node.customerId})`,
    }));
  }, [activeManager, hierarchy]);

  const managerBreadcrumb = useMemo(() => {
    return selectedManagerPath
      .map((managerId) => findNodeById(hierarchy, managerId)?.descriptiveName)
      .filter((label): label is string => Boolean(label))
      .join(' / ');
  }, [hierarchy, selectedManagerPath]);

  const handleManagerChange = (level: number, managerId: string) => {
    if (managerId.startsWith(PARENT_SCOPE_PREFIX)) {
      setSelectedManagerPath((prev) => prev.slice(0, level));
      setSelectedAccountId('');
      return;
    }

    setSelectedManagerPath((prev) => [...prev.slice(0, level), managerId]);
    setSelectedAccountId('');
  };

  const handleApplySelection = async () => {
    const selectedAccount = accountOptions.find((account) => account.customerId === selectedAccountId);
    if (!selectedAccount) return;

    try {
      setSubmittingId(selectedAccount.customerId);
      setError('');

      await selectAccount({
        customerId: selectedAccount.customerId,
        loginCustomerId: activeManager?.customerId ?? null,
        descriptiveName: selectedAccount.descriptiveName,
      });

      setSelection({
        customerId: selectedAccount.customerId,
        loginCustomerId: activeManager?.customerId ?? null,
        descriptiveName: selectedAccount.descriptiveName,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to select account'));
    } finally {
      setSubmittingId('');
    }
  };

  const selectionIsCurrent =
    selectedAccountId.length > 0 &&
    selectedAccountId === currentCustomerId &&
    (activeManager?.customerId ?? null) === currentLoginCustomerId;

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
                <span className="text-xs text-muted-foreground">via MCC {currentLoginCustomerId}</span>
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
        {managerLevels.map(({ level, options }) => (
          <div key={`manager-level-${level}`} className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              MCC Level {level + 1}
            </p>
            <Select
              value={selectedManagerPath[level] ?? ''}
              onValueChange={(value) => handleManagerChange(level, value)}
            >
              <SelectTrigger size="sm" className="h-9 text-xs">
                <SelectValue placeholder={`Select MCC level ${level + 1}`} />
              </SelectTrigger>
              <SelectContent>
                {level > 0 && (
                  <SelectItem value={`${PARENT_SCOPE_PREFIX}${level}`}>
                    Use {findNodeById(hierarchy, selectedManagerPath[level - 1])?.descriptiveName || `MCC level ${level}`} scope
                  </SelectItem>
                )}
                {options.map((node) => {
                  const descendantCount = collectLeafAccounts(node, []).length;
                  return (
                    <SelectItem key={node.customerId} value={node.customerId}>
                      {node.descriptiveName} ({descendantCount} accounts)
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ))}

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Ad Account
          </p>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger size="sm" className="h-9 text-xs">
              <SelectValue placeholder={managerLevels.length > 0 && !activeManager ? 'Select an MCC first' : 'Select ad account'} />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((account) => (
                <SelectItem key={account.customerId} value={account.customerId}>
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{accountOptions.length} accounts in scope</Badge>
          {managerBreadcrumb && (
            <span className="text-xs text-muted-foreground">
              Current MCC path: {managerBreadcrumb}
            </span>
          )}
          {!managerBreadcrumb && managerLevels.length === 0 && (
            <span className="text-xs text-muted-foreground">Direct account access only</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant={selectionIsCurrent ? 'outline' : 'brand'}
          className="h-8"
          disabled={!selectedAccountId || Boolean(submittingId) || selectionIsCurrent}
          onClick={() => void handleApplySelection()}
        >
          {selectionIsCurrent ? 'Selected' : submittingId ? 'Selecting...' : 'Use This Account'}
        </Button>
      </div>
    </div>
  );
}
