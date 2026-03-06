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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {WIZARD_STEPS.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isCompleted = idx < currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <div key={step.id} className="flex items-center">
              {idx > 0 && (
                <div
                  className={cn(
                    'h-0.5 w-4 sm:w-8 mx-0.5 sm:mx-1',
                    isCompleted ? 'bg-brand-accent' : 'bg-border',
                  )}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-default">
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all shrink-0',
                        isActive && 'bg-brand-accent text-brand-accent-foreground ring-2 ring-brand-accent/30 ring-offset-2 ring-offset-background',
                        isCompleted && 'bg-brand-accent text-brand-accent-foreground',
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
                        'text-[11px] whitespace-nowrap leading-tight',
                        isActive ? 'font-semibold text-foreground' : 'hidden sm:inline',
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
