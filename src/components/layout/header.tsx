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
  const { toggleTheme } = useTheme();
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
    <header className="sticky top-0 z-40 relative border-b border-border/70 bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/75 shadow-[0_1px_8px_0_rgb(0,0,0,0.04)] dark:shadow-[0_2px_10px_0_rgb(0,0,0,0.2)]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Image
              src="/grow-my-ads-logo.png"
              alt="Grow My Ads"
              width={120}
              height={28}
              className="h-7 w-auto dark:hidden"
              priority
            />
            <Image
              src="/grow-my-ads-logo-alt.png"
              alt="Grow My Ads"
              width={120}
              height={28}
              className="hidden h-7 w-auto dark:block"
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
          <span className="text-[10px] font-medium text-muted-foreground/80 tracking-wide">
            build {buildLabel}
          </span>
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-7 w-7 p-0" aria-label="Toggle theme">
            <Moon className="h-4 w-4 dark:hidden" />
            <Sun className="hidden h-4 w-4 dark:block" />
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
