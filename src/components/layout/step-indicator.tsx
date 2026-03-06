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
  competitors: 'Review competitors',
  enhance: 'AI refinement',
  review: 'Audit keywords',
  campaign: 'Build & export',
};

const stepIndex = (step: WizardStep) => WIZARD_STEPS.findIndex((s) => s.id === step);

export function StepIndicator() {
  const { state } = useWorkflow();
  const currentIdx = stepIndex(state.currentStep);
  const progressPct = ((currentIdx + 1) / WIZARD_STEPS.length) * 100;

  return (
    <div className="border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="sm:hidden space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{WIZARD_STEPS[currentIdx]?.label ?? 'Step'}</span>
            <span className="text-[11px] text-muted-foreground">Step {currentIdx + 1} of {WIZARD_STEPS.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {WIZARD_STEPS.map((step, idx) => (
              <span
                key={step.id}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  idx <= currentIdx ? 'bg-brand-accent' : 'bg-border'
                )}
              />
            ))}
          </div>
        </div>

        <div className="relative hidden sm:block">
          <div className="absolute left-6 right-6 top-3.5 h-0.5 rounded-full bg-border" />
          <div
            className="absolute left-6 top-3.5 h-0.5 rounded-full bg-brand-accent transition-all duration-300"
            style={{ width: `calc((100% - 3rem) * ${progressPct / 100})` }}
          />

          <div className="relative z-10 flex items-start justify-between gap-2">
            {WIZARD_STEPS.map((step, idx) => {
              const isActive = idx === currentIdx;
              const isCompleted = idx < currentIdx;
              const isFuture = idx > currentIdx;

              return (
                <Tooltip key={step.id}>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1 cursor-default min-w-0">
                      <div
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all shrink-0',
                          isActive && 'bg-brand-accent text-brand-accent-foreground ring-2 ring-brand-accent/35 ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(252,185,0,0.25)]',
                          isCompleted && 'bg-brand-accent text-brand-accent-foreground',
                          isFuture && 'border border-border bg-background text-muted-foreground'
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
                          'text-[11px] leading-tight text-center max-w-[90px]',
                          isActive ? 'font-semibold text-foreground' : isCompleted ? 'text-foreground/90' : 'text-muted-foreground'
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
