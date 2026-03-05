'use client';

import { useWorkflow, WIZARD_STEPS, type WizardStep } from '@/providers/workflow-provider';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STEP_DESCRIPTIONS: Record<WizardStep, string> = {
  setup: 'Connect accounts',
  discover: 'Find services',
  geo: 'Set target market',
  strategy: 'Configure filters',
  research: 'Gather keywords',
  enhance: 'AI refinement',
  review: 'Audit keywords',
  campaign: 'Build & export',
};

const stepIndex = (step: WizardStep) => WIZARD_STEPS.findIndex((s) => s.id === step);

export function StepIndicator() {
  const { state } = useWorkflow();
  const currentIdx = stepIndex(state.currentStep);

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
        {WIZARD_STEPS.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isCompleted = idx < currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <div key={step.id} className="flex items-center">
              {idx > 0 && (
                <div
                  className={cn(
                    'h-px w-3 sm:w-5 mx-0.5 sm:mx-1',
                    isCompleted ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-default">
                    <div
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium transition-all shrink-0',
                        isActive && 'bg-primary text-primary-foreground ring-2 ring-[var(--brand-accent)] ring-offset-1 ring-offset-background',
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
                        'text-[11px] whitespace-nowrap leading-tight hidden sm:inline',
                        isActive && 'font-medium text-foreground',
                        isCompleted && 'text-foreground',
                        isFuture && 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">{step.label}</p>
                  <p className="text-muted-foreground">{STEP_DESCRIPTIONS[step.id]}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
