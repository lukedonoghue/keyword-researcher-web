'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import packageJson from '../../../package.json';

export function Header() {
  const { authenticated, customerId, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const fallbackBuild = typeof packageJson.version === 'string' ? `v${packageJson.version}` : 'v0.0.0';
  const [buildLabel, setBuildLabel] = useState<string>(fallbackBuild);

  useEffect(() => {
    let cancelled = false;
    const loadBuild = async () => {
      try {
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as { build?: string };
        if (!cancelled && typeof data.build === 'string' && data.build.trim()) {
          setBuildLabel(data.build.trim());
        }
      } catch {
        // Keep fallback build label if version endpoint is unavailable.
      }
    };
    void loadBuild();
    return () => { cancelled = true; };
  }, []);

  return (
    <header className="border-b border-border bg-card shadow-[0_1px_3px_0_rgb(0,0,0,0.03)] dark:shadow-[0_1px_6px_0_rgb(0,0,0,0.15)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Image
              src={theme === 'dark' ? '/grow-my-ads-logo-alt.png' : '/grow-my-ads-logo.png'}
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
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            BUILD {buildLabel}
          </span>
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-7 w-7 p-0">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
