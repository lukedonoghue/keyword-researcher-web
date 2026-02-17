'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';

export function Header() {
  const { authenticated, customerId, logout } = useAuth();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight">Keyword Researcher</h1>
          {customerId && (
            <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
              {customerId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {authenticated && (
            <Button variant="ghost" size="sm" onClick={logout} className="h-7 text-xs">
              Sign Out
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
