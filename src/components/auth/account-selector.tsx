'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AccountSelector() {
  const { selectAccount } = useAuth();
  const [accounts, setAccounts] = useState<Array<{ customerId: string; descriptiveName: string }>>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadAccounts = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch('/api/google-ads/accounts');
        const data = await res.json() as {
          accounts?: Array<{ customerId: string; descriptiveName: string }>;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load accounts');
        }

        if (!active) return;
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
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

  if (loading) return <p className="text-xs text-muted-foreground">Loading accounts...</p>;
  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (accounts.length === 0) return <p className="text-xs text-muted-foreground">No accounts found.</p>;

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-8 text-xs w-[240px]">
          <SelectValue placeholder="Select an account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.customerId} value={account.customerId} className="text-xs">
              {account.descriptiveName} ({account.customerId})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8" onClick={() => selectAccount(selected)} disabled={!selected}>
        Select
      </Button>
    </div>
  );
}
