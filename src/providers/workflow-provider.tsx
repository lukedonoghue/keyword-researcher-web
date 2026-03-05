'use client';

import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';
import type { SeedKeyword, SuppressedKeyword, CampaignStrategy, CampaignStructureV2, ServiceContext, NegativeKeyword } from '@/lib/types/index';
import type { ServiceArea, GeoLocationSuggestion } from '@/lib/types/geo';

export type WizardStep =
  | 'setup'
  | 'discover'
  | 'geo'
  | 'strategy'
  | 'research'
  | 'enhance'
  | 'review'
  | 'campaign';

export const WIZARD_STEPS: { id: WizardStep; label: string; number: number }[] = [
  { id: 'setup', label: 'Setup', number: 1 },
  { id: 'discover', label: 'Discover', number: 2 },
  { id: 'geo', label: 'Location', number: 3 },
  { id: 'strategy', label: 'Strategy', number: 4 },
  { id: 'research', label: 'Research', number: 5 },
  { id: 'enhance', label: 'Enhance', number: 6 },
  { id: 'review', label: 'Review', number: 7 },
  { id: 'campaign', label: 'Campaign', number: 8 },
];

export type WorkflowState = {
  currentStep: WizardStep;
  targetUrl: string;
  targetDomain: string;
  businessName: string;
  businessDescription: string;
  businessType: string;
  discoveredServices: Array<{ name: string; description: string; seedKeywords: string[]; landingPage?: string }>;
  detectedServiceArea: ServiceArea | null;
  detectedCountryCode: string | null;
  contextTerms: string[];
  selectedServices: string[];
  selectedServiceContexts: ServiceContext[];
  geoTargetId: string;
  geoTargets: GeoLocationSuggestion[];
  languageId: string;
  geoCountryCode: string;
  geoDisplayName: string;
  strategy: CampaignStrategy;
  seedKeywords: SeedKeyword[];
  selectedKeywords: SeedKeyword[];
  suppressedKeywords: SuppressedKeyword[];
  enhancedKeywords: SeedKeyword[];
  enhancedSuppressed: SuppressedKeyword[];
  campaigns: CampaignStructureV2[];
  manualSeedKeywords: string[];
  competitorNames: string[];
  reviewNegativeKeywords: string[];
  negativeKeywords: NegativeKeyword[];
  isProcessing: boolean;
  error: string | null;
};

const initialStrategy: CampaignStrategy = {
  goal: 'conversions',
  monthlyBudget: 2000,
  minVolume: 50,
  maxCpc: 12,
  minAdGroupKeywords: 3,
  maxAdGroupKeywords: 20,
  focusHighIntent: true,
  includeInformational: false,
  includeNegativeCandidates: false,
};

const initialState: WorkflowState = {
  currentStep: 'setup',
  targetUrl: '',
  targetDomain: '',
  businessName: '',
  businessDescription: '',
  businessType: '',
  discoveredServices: [],
  detectedServiceArea: null,
  detectedCountryCode: null,
  contextTerms: [],
  selectedServices: [],
  selectedServiceContexts: [],
  geoTargetId: '2840',
  geoTargets: [],
  languageId: '1000',
  geoCountryCode: 'US',
  geoDisplayName: 'United States',
  strategy: initialStrategy,
  seedKeywords: [],
  selectedKeywords: [],
  suppressedKeywords: [],
  enhancedKeywords: [],
  enhancedSuppressed: [],
  campaigns: [],
  manualSeedKeywords: [],
  competitorNames: [],
  reviewNegativeKeywords: [],
  negativeKeywords: [],
  isProcessing: false,
  error: null,
};

function createDownstreamResearchReset() {
  return {
    seedKeywords: [],
    selectedKeywords: [],
    suppressedKeywords: [],
    enhancedKeywords: [],
    enhancedSuppressed: [],
    campaigns: [],
    competitorNames: [],
    reviewNegativeKeywords: [],
    negativeKeywords: [],
  };
}

export type WorkflowAction =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_TARGET'; url: string; domain: string }
  | { type: 'SET_DISCOVERY'; businessName: string; businessDescription: string; businessType: string; services: WorkflowState['discoveredServices']; serviceArea: ServiceArea | null; detectedCountryCode: string | null; contextTerms: string[] }
  | { type: 'SET_SELECTED_SERVICES'; services: string[]; contexts: ServiceContext[] }
  | { type: 'SET_GEO'; geoTargetId: string; languageId: string; countryCode: string; displayName: string }
  | { type: 'SET_GEO_TARGETS'; targets: GeoLocationSuggestion[]; languageId: string }
  | { type: 'SET_STRATEGY'; strategy: CampaignStrategy }
  | { type: 'SET_SEED_KEYWORDS'; keywords: SeedKeyword[] }
  | { type: 'SET_FILTERED_KEYWORDS'; selected: SeedKeyword[]; suppressed: SuppressedKeyword[] }
  | { type: 'SET_ENHANCED_KEYWORDS'; keywords: SeedKeyword[]; suppressed: SuppressedKeyword[] }
  | { type: 'SET_CAMPAIGNS'; campaigns: CampaignStructureV2[] }
  | { type: 'SET_MANUAL_SEEDS'; keywords: string[] }
  | { type: 'SET_COMPETITOR_NAMES'; names: string[] }
  | { type: 'SET_REVIEW_NEGATIVE_KEYWORDS'; keywords: string[] }
  | { type: 'SET_NEGATIVE_KEYWORDS'; negativeKeywords: NegativeKeyword[] }
  | { type: 'SET_PROCESSING'; isProcessing: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step, error: null };
    case 'SET_TARGET':
      return {
        ...state,
        targetUrl: action.url,
        targetDomain: action.domain,
        businessName: '',
        businessDescription: '',
        businessType: '',
        discoveredServices: [],
        detectedServiceArea: null,
        detectedCountryCode: null,
        contextTerms: [],
        selectedServices: [],
        selectedServiceContexts: [],
        geoTargetId: initialState.geoTargetId,
        geoTargets: [],
        languageId: initialState.languageId,
        geoCountryCode: initialState.geoCountryCode,
        geoDisplayName: initialState.geoDisplayName,
        ...createDownstreamResearchReset(),
        error: null,
      };
    case 'SET_DISCOVERY':
      return {
        ...state,
        businessName: action.businessName,
        businessDescription: action.businessDescription,
        businessType: action.businessType,
        discoveredServices: action.services,
        detectedServiceArea: action.serviceArea,
        detectedCountryCode: action.detectedCountryCode,
        contextTerms: action.contextTerms,
        selectedServices: [],
        selectedServiceContexts: [],
        ...createDownstreamResearchReset(),
        // Auto-set geo if AI detected a country
        ...(action.detectedCountryCode ? { geoCountryCode: action.detectedCountryCode } : {}),
      };
    case 'SET_SELECTED_SERVICES':
      return {
        ...state,
        selectedServices: action.services,
        selectedServiceContexts: action.contexts,
        ...createDownstreamResearchReset(),
      };
    case 'SET_GEO':
      return {
        ...state,
        geoTargetId: action.geoTargetId,
        geoTargets: [],
        languageId: action.languageId,
        geoCountryCode: action.countryCode,
        geoDisplayName: action.displayName,
        ...createDownstreamResearchReset(),
      };
    case 'SET_GEO_TARGETS':
      return {
        ...state,
        geoTargets: action.targets,
        geoTargetId: action.targets.length > 0 ? action.targets[0].id : state.geoTargetId,
        languageId: action.languageId,
        geoDisplayName: action.targets.length > 0
          ? action.targets.map((t) => t.name).join(', ')
          : state.geoDisplayName,
        ...createDownstreamResearchReset(),
      };
    case 'SET_STRATEGY':
      return { ...state, strategy: action.strategy, ...createDownstreamResearchReset() };
    case 'SET_SEED_KEYWORDS':
      return { ...state, seedKeywords: action.keywords };
    case 'SET_FILTERED_KEYWORDS':
      return {
        ...state,
        selectedKeywords: action.selected,
        suppressedKeywords: action.suppressed,
        campaigns: [],
        reviewNegativeKeywords: [],
        negativeKeywords: [],
      };
    case 'SET_ENHANCED_KEYWORDS':
      return {
        ...state,
        enhancedKeywords: action.keywords,
        enhancedSuppressed: action.suppressed,
        campaigns: [],
        reviewNegativeKeywords: [],
        negativeKeywords: [],
      };
    case 'SET_CAMPAIGNS':
      return { ...state, campaigns: action.campaigns };
    case 'SET_MANUAL_SEEDS':
      return { ...state, manualSeedKeywords: action.keywords, ...createDownstreamResearchReset() };
    case 'SET_COMPETITOR_NAMES':
      return { ...state, competitorNames: action.names };
    case 'SET_REVIEW_NEGATIVE_KEYWORDS':
      return { ...state, reviewNegativeKeywords: action.keywords, campaigns: [], negativeKeywords: [] };
    case 'SET_NEGATIVE_KEYWORDS':
      return { ...state, negativeKeywords: action.negativeKeywords };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.isProcessing };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

const WorkflowContext = createContext<{ state: WorkflowState; dispatch: Dispatch<WorkflowAction> } | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  return (
    <WorkflowContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider');
  return ctx;
}
