'use client';

import Image from 'next/image';
import { useAuth } from '@/providers/auth-provider';
import type { ReactNode } from 'react';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="relative h-6 w-24 opacity-75 animate-pulse">
              <Image
                src="/grow-my-ads-logo.png"
                alt="Grow My Ads"
                fill
                sizes="96px"
                className="object-contain"
              />
            </div>
            <span className="text-xs text-muted-foreground">Loading workspace...</span>
          </div>
          <div className="space-y-2">
            <div className="h-2 rounded bg-muted animate-pulse" />
            <div className="h-2 rounded bg-muted/80 animate-pulse w-[88%]" />
            <div className="h-2 rounded bg-muted/70 animate-pulse w-[76%]" />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
