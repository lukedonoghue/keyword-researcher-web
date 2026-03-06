'use client';

import { useAuth } from '@/providers/auth-provider';
import type { ReactNode } from 'react';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-accent border-t-transparent" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return <>{children}</>;
}
