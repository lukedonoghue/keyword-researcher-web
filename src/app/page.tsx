'use client';

import { Header } from '@/components/layout/header';
import { StepIndicator } from '@/components/layout/step-indicator';
import { WizardShell } from '@/components/wizard/wizard-shell';
import { AuthGuard } from '@/components/auth/auth-guard';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AuthGuard>
        <StepIndicator />
        <WizardShell />
      </AuthGuard>
    </div>
  );
}
