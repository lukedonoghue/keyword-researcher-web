'use client';

import { useWorkflow } from '@/providers/workflow-provider';
import { StepSetup } from './step-setup';
import { StepDiscover } from './step-discover';
import { StepGeo } from './step-geo';
import { StepStrategy } from './step-strategy';
import { StepResearch } from './step-research';
import { StepCompetitors } from './step-competitors';
import { StepEnhance } from './step-enhance';
import { StepReview } from './step-review';
import { StepCampaign } from './step-campaign';

export function WizardShell() {
  const { state } = useWorkflow();

  const stepComponents = {
    setup: StepSetup,
    discover: StepDiscover,
    geo: StepGeo,
    strategy: StepStrategy,
    research: StepResearch,
    competitors: StepCompetitors,
    enhance: StepEnhance,
    review: StepReview,
    campaign: StepCampaign,
  };

  const StepComponent = stepComponents[state.currentStep];
  const widthClass = state.currentStep === 'campaign' ? 'max-w-[1600px]' : 'max-w-4xl';

  return (
    <div className={`mx-auto ${widthClass} px-4 py-8`}>
      <div key={state.currentStep} className="animate-step-enter">
        <StepComponent />
      </div>
    </div>
  );
}
