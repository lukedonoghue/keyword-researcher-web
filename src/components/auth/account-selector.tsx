'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import type { GoogleAdsAccountNode, GoogleAdsAccountSelection } from '@/lib/types/google-ads';
import { getErrorMessage } from '@/lib/utils';

type AccountsResponse = {
  hierarchy?: GoogleAdsAccountNode[];
  selection?: GoogleAdsAccountSelection;
  error?: string;
};

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

  const handleSelect = async (node: GoogleAdsAccountNode, rootManagerId: string | null) => {
    try {
      setSubmittingId(node.customerId);
      setError('');
      await selectAccount({
        customerId: node.customerId,
        loginCustomerId: rootManagerId,
        descriptiveName: node.descriptiveName,
      });
      setSelection({
        customerId: node.customerId,
        loginCustomerId: rootManagerId,
        descriptiveName: node.descriptiveName,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to select account'));
    } finally {
      setSubmittingId('');
    }
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading Google Ads account hierarchy...</p>;
  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (hierarchy.length === 0) return <p className="text-xs text-muted-foreground">No Google Ads accounts found.</p>;

  return (
    <div className="space-y-3">
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
            <span className="text-xs text-muted-foreground">Choose the exact ad account inside your MCC tree.</span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Manager accounts are for navigation only. Select a leaf ad account to use for direct Google Ads import.
        </p>
      </div>

      <div className="space-y-2">
        {hierarchy.map((node) => (
          <AccountTreeNode
            key={node.customerId}
            node={node}
            depth={0}
            rootManagerId={node.isManager ? node.customerId : null}
            selectedCustomerId={currentCustomerId}
            selectedLoginCustomerId={currentLoginCustomerId}
            submittingId={submittingId}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}

function AccountTreeNode({
  node,
  depth,
  rootManagerId,
  selectedCustomerId,
  selectedLoginCustomerId,
  submittingId,
  onSelect,
}: {
  node: GoogleAdsAccountNode;
  depth: number;
  rootManagerId: string | null;
  selectedCustomerId: string | null;
  selectedLoginCustomerId: string | null;
  submittingId: string;
  onSelect: (node: GoogleAdsAccountNode, rootManagerId: string | null) => Promise<void>;
}) {
  const effectiveRootManagerId = rootManagerId || (node.isManager ? node.customerId : null);
  const isSelected = node.customerId === selectedCustomerId;

  if (node.isManager) {
    return (
      <details open={depth === 0} className="rounded-lg border border-border/70 bg-card/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">MCC</Badge>
              <span className="text-sm font-medium">{node.descriptiveName}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{node.customerId}</span>
              {node.children.length > 0 && (
                <Badge variant="secondary">{node.children.length} child accounts</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedLoginCustomerId === node.customerId
                ? 'Current manager context'
                : 'Expand to choose a child account'}
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground">Browse</span>
        </summary>
        <div className="border-t border-border/60 px-3 py-3">
          {node.children.length > 0 ? (
            <div className="space-y-2 border-l border-border/60 pl-3">
              {node.children.map((child) => (
                <AccountTreeNode
                  key={child.customerId}
                  node={child}
                  depth={depth + 1}
                  rootManagerId={effectiveRootManagerId}
                  selectedCustomerId={selectedCustomerId}
                  selectedLoginCustomerId={selectedLoginCustomerId}
                  submittingId={submittingId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No visible child accounts under this MCC.</p>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{node.descriptiveName}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{node.customerId}</span>
          <Badge variant="secondary">Ad account</Badge>
          {isSelected && (
            <Badge className="bg-green-600 text-white hover:bg-green-600">Selected</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {effectiveRootManagerId
            ? `Publishes via MCC ${effectiveRootManagerId}`
            : 'Direct account access'}
        </p>
      </div>
      <Button
        size="sm"
        variant={isSelected ? 'outline' : 'brand'}
        className="h-8 shrink-0"
        disabled={Boolean(submittingId) || isSelected}
        onClick={() => void onSelect(node, effectiveRootManagerId)}
      >
        {isSelected ? 'Selected' : submittingId === node.customerId ? 'Selecting...' : 'Select Account'}
      </Button>
    </div>
  );
}
