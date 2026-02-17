'use client';

import { useWorkflow, WIZARD_STEPS, type WizardStep } from '@/providers/workflow-provider';
import { cn } from '@/lib/utils';

const stepIndex = (step: WizardStep) => WIZARD_STEPS.findIndex((s) => s.id === step);

export function StepIndicator() {
  const { state } = useWorkflow();
  const currentIdx = stepIndex(state.currentStep);

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-0 px-4 py-2 overflow-x-auto">
        {WIZARD_STEPS.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isCompleted = idx < currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <div key={step.id} className="flex items-center">
              {idx > 0 && (
                <div
                  className={cn(
                    'h-px w-6 mx-1',
                    isCompleted ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                    isActive && 'bg-primary text-primary-foreground',
                    isCompleted && 'bg-primary text-primary-foreground',
                    isFuture && 'border border-border text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs whitespace-nowrap',
                    isActive && 'font-medium text-foreground',
                    isCompleted && 'text-foreground',
                    isFuture && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
