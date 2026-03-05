'use client';

import Image from 'next/image';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';

export function Header() {
  const { authenticated, customerId, logout } = useAuth();
  const { theme, mounted, toggleTheme } = useTheme();
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
  const commitSha = process.env.NEXT_PUBLIC_APP_COMMIT_SHA ?? '';
  const versionLabel = commitSha ? `v${appVersion}-${commitSha}` : `v${appVersion}`;

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Image
              src={mounted && theme === 'dark' ? '/grow-my-ads-logo-alt.png' : '/grow-my-ads-logo.png'}
              alt="Grow My Ads"
              width={120}
              height={28}
              className="h-7 w-auto"
              priority
            />
            <span className="text-[10px] font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 leading-none">
              Keyword Researcher
            </span>
          </div>
          {customerId && (
            <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
              {customerId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground font-mono leading-none">
            {versionLabel}
          </span>
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-7 w-7 p-0">
            {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
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
