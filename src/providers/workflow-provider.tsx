'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode, type Dispatch } from 'react';
import type {
  SeedKeyword,
  SuppressedKeyword,
  CampaignStrategy,
  CampaignStructureV2,
  ServiceContext,
  NegativeKeyword,
  NegativeKeywordList,
  WebsiteMessagingProfile,
} from '@/lib/types/index';
import type { ServiceArea, GeoLocationSuggestion } from '@/lib/types/geo';
import { normalizeCompetitorNames } from '@/lib/logic/competitor-names';

export type WizardStep =
  | 'setup'
  | 'discover'
  | 'geo'
  | 'strategy'
  | 'research'
  | 'competitors'
  | 'enhance'
  | 'review'
  | 'campaign';

export const WIZARD_STEPS: { id: WizardStep; label: string; number: number }[] = [
  { id: 'setup', label: 'Setup', number: 1 },
  { id: 'discover', label: 'Discover', number: 2 },
  { id: 'geo', label: 'Location', number: 3 },
  { id: 'strategy', label: 'Strategy', number: 4 },
  { id: 'research', label: 'Research', number: 5 },
  { id: 'competitors', label: 'Competitors', number: 6 },
  { id: 'enhance', label: 'Enhance', number: 7 },
  { id: 'review', label: 'Review', number: 8 },
  { id: 'campaign', label: 'Campaign', number: 9 },
];

export type WorkflowState = {
  currentStep: WizardStep;
  targetUrl: string;
  targetDomain: string;
  businessName: string;
  businessDescription: string;
  businessType: string;
  messagingProfile: WebsiteMessagingProfile;
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
  reviewNegativeKeywordLists: NegativeKeywordList[];
  negativeKeywords: NegativeKeyword[];
  negativeKeywordLists: NegativeKeywordList[];
  isProcessing: boolean;
  error: string | null;
};

const initialStrategy: CampaignStrategy = {
  goal: 'conversions',
  monthlyBudget: 2000,
  minVolume: 10,
  maxCpc: null,
  minAdGroupKeywords: 3,
  maxAdGroupKeywords: 10,
  focusHighIntent: false,
  includeInformational: false,
  includeNegativeCandidates: false,
  competitorCampaignMode: 'exclude',
  brandCampaignMode: 'exclude',
  matchTypeStrategy: 'exact_phrase',
};

const initialState: WorkflowState = {
  currentStep: 'setup',
  targetUrl: '',
  targetDomain: '',
  businessName: '',
  businessDescription: '',
  businessType: '',
  messagingProfile: {
    features: [],
    benefits: [],
    differentiators: [],
    offers: [],
    callsToAction: [],
    proofPoints: [],
    tone: '',
  },
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
  reviewNegativeKeywordLists: [],
  negativeKeywords: [],
  negativeKeywordLists: [],
  isProcessing: false,
  error: null,
};

const WORKFLOW_STORAGE_KEY = 'keyword-researcher:workflow-state';
const WORKFLOW_STORAGE_VERSION = 1;
const WORKFLOW_RESEARCH_BACKUP_KEY = 'keyword-researcher:research-backup';
const WORKFLOW_RESEARCH_BACKUP_VERSION = 1;

type WorkflowResearchBackup = {
  version: number;
  targetUrl: string;
  geoDisplayName: string;
  selectedServices: string[];
  competitorNames: string[];
  seedKeywords: SeedKeyword[];
  selectedKeywords: SeedKeyword[];
  suppressedKeywords: SuppressedKeyword[];
  enhancedKeywords: SeedKeyword[];
  enhancedSuppressed: SuppressedKeyword[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function sanitizeWorkflowState(candidate: unknown): WorkflowState {
  if (!isRecord(candidate)) {
    return initialState;
  }

  const currentStep =
    typeof candidate.currentStep === 'string' &&
    WIZARD_STEPS.some((step) => step.id === candidate.currentStep)
      ? candidate.currentStep as WizardStep
      : initialState.currentStep;

  const strategy = isRecord(candidate.strategy)
    ? { ...initialStrategy, ...candidate.strategy }
    : initialStrategy;

  const messagingProfile = isRecord(candidate.messagingProfile)
    ? {
        ...initialState.messagingProfile,
        ...candidate.messagingProfile,
        features: asArray<string>(candidate.messagingProfile.features),
        benefits: asArray<string>(candidate.messagingProfile.benefits),
        differentiators: asArray<string>(candidate.messagingProfile.differentiators),
        offers: asArray<string>(candidate.messagingProfile.offers),
        callsToAction: asArray<string>(candidate.messagingProfile.callsToAction),
        proofPoints: asArray<string>(candidate.messagingProfile.proofPoints),
        tone: typeof candidate.messagingProfile.tone === 'string' ? candidate.messagingProfile.tone : '',
      }
    : initialState.messagingProfile;

  const sanitized: WorkflowState = {
    ...initialState,
    ...candidate,
    currentStep,
    targetUrl: typeof candidate.targetUrl === 'string' ? candidate.targetUrl : initialState.targetUrl,
    targetDomain: typeof candidate.targetDomain === 'string' ? candidate.targetDomain : initialState.targetDomain,
    businessName: typeof candidate.businessName === 'string' ? candidate.businessName : initialState.businessName,
    businessDescription: typeof candidate.businessDescription === 'string' ? candidate.businessDescription : initialState.businessDescription,
    businessType: typeof candidate.businessType === 'string' ? candidate.businessType : initialState.businessType,
    messagingProfile,
    discoveredServices: asArray<WorkflowState['discoveredServices'][number]>(candidate.discoveredServices),
    detectedServiceArea: isRecord(candidate.detectedServiceArea) ? candidate.detectedServiceArea as ServiceArea : null,
    detectedCountryCode: typeof candidate.detectedCountryCode === 'string' ? candidate.detectedCountryCode : null,
    contextTerms: asArray<string>(candidate.contextTerms),
    selectedServices: asArray<string>(candidate.selectedServices),
    selectedServiceContexts: asArray<ServiceContext>(candidate.selectedServiceContexts),
    geoTargetId: typeof candidate.geoTargetId === 'string' ? candidate.geoTargetId : initialState.geoTargetId,
    geoTargets: asArray<GeoLocationSuggestion>(candidate.geoTargets),
    languageId: typeof candidate.languageId === 'string' ? candidate.languageId : initialState.languageId,
    geoCountryCode: typeof candidate.geoCountryCode === 'string' ? candidate.geoCountryCode : initialState.geoCountryCode,
    geoDisplayName: typeof candidate.geoDisplayName === 'string' ? candidate.geoDisplayName : initialState.geoDisplayName,
    strategy,
    seedKeywords: asArray<SeedKeyword>(candidate.seedKeywords),
    selectedKeywords: asArray<SeedKeyword>(candidate.selectedKeywords),
    suppressedKeywords: asArray<SuppressedKeyword>(candidate.suppressedKeywords),
    enhancedKeywords: asArray<SeedKeyword>(candidate.enhancedKeywords),
    enhancedSuppressed: asArray<SuppressedKeyword>(candidate.enhancedSuppressed),
    campaigns: asArray<CampaignStructureV2>(candidate.campaigns),
    manualSeedKeywords: asArray<string>(candidate.manualSeedKeywords),
    competitorNames: normalizeCompetitorNames(asArray<string>(candidate.competitorNames)),
    reviewNegativeKeywords: asArray<string>(candidate.reviewNegativeKeywords),
    reviewNegativeKeywordLists: asArray<NegativeKeywordList>(candidate.reviewNegativeKeywordLists),
    negativeKeywords: asArray<NegativeKeyword>(candidate.negativeKeywords),
    negativeKeywordLists: asArray<NegativeKeywordList>(candidate.negativeKeywordLists),
    isProcessing: false,
    error: null,
  };

  const hasResearchedKeywords =
    sanitized.seedKeywords.length > 0 ||
    sanitized.selectedKeywords.length > 0 ||
    sanitized.suppressedKeywords.length > 0 ||
    sanitized.enhancedKeywords.length > 0 ||
    sanitized.enhancedSuppressed.length > 0;

  if (!hasResearchedKeywords && ['competitors', 'enhance', 'review', 'campaign'].includes(sanitized.currentStep)) {
    sanitized.currentStep = 'research';
  }

  return sanitized;
}

function loadPersistedWorkflowState(): WorkflowState {
  if (typeof window === 'undefined') {
    return initialState;
  }

  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) return initialState;

    const parsed = JSON.parse(raw) as { version?: number; state?: unknown };
    if (!parsed || parsed.version !== WORKFLOW_STORAGE_VERSION) {
      window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
      return initialState;
    }

    return sanitizeWorkflowState(parsed.state);
  } catch {
    window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
    return initialState;
  }
}

function persistWorkflowState(state: WorkflowState) {
  if (typeof window === 'undefined') return;

  const snapshot: WorkflowState = {
    ...state,
    isProcessing: false,
    error: null,
  };

  window.localStorage.setItem(
    WORKFLOW_STORAGE_KEY,
    JSON.stringify({
      version: WORKFLOW_STORAGE_VERSION,
      state: snapshot,
    })
  );
}

function createResearchBackup(state: WorkflowState): WorkflowResearchBackup | null {
  const hasResearchState =
    state.seedKeywords.length > 0 ||
    state.selectedKeywords.length > 0 ||
    state.suppressedKeywords.length > 0 ||
    state.enhancedKeywords.length > 0 ||
    state.enhancedSuppressed.length > 0;

  if (!hasResearchState) {
    return null;
  }

  return {
    version: WORKFLOW_RESEARCH_BACKUP_VERSION,
    targetUrl: state.targetUrl,
    geoDisplayName: state.geoDisplayName,
    selectedServices: state.selectedServices,
    competitorNames: state.competitorNames,
    seedKeywords: state.seedKeywords,
    selectedKeywords: state.selectedKeywords,
    suppressedKeywords: state.suppressedKeywords,
    enhancedKeywords: state.enhancedKeywords,
    enhancedSuppressed: state.enhancedSuppressed,
  };
}

function persistResearchBackup(state: WorkflowState) {
  if (typeof window === 'undefined') return;
  const backup = createResearchBackup(state);
  if (!backup) return;
  window.localStorage.setItem(WORKFLOW_RESEARCH_BACKUP_KEY, JSON.stringify(backup));
}

function loadPersistedResearchBackup(): WorkflowResearchBackup | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKFLOW_RESEARCH_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkflowResearchBackup;
    if (!parsed || parsed.version !== WORKFLOW_RESEARCH_BACKUP_VERSION) {
      window.localStorage.removeItem(WORKFLOW_RESEARCH_BACKUP_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(WORKFLOW_RESEARCH_BACKUP_KEY);
    return null;
  }
}

function clearPersistedWorkflowState() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
  window.localStorage.removeItem(WORKFLOW_RESEARCH_BACKUP_KEY);
}

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
    reviewNegativeKeywordLists: [],
    negativeKeywords: [],
    negativeKeywordLists: [],
  };
}

export type WorkflowAction =
  | { type: 'HYDRATE'; state: WorkflowState }
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_TARGET'; url: string; domain: string }
  | { type: 'SET_DISCOVERY'; businessName: string; businessDescription: string; businessType: string; messagingProfile: WebsiteMessagingProfile; services: WorkflowState['discoveredServices']; serviceArea: ServiceArea | null; detectedCountryCode: string | null; contextTerms: string[] }
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
  | { type: 'SET_COMPETITOR_CAMPAIGN_MODE'; mode: CampaignStrategy['competitorCampaignMode'] }
  | { type: 'SET_REVIEW_NEGATIVE_KEYWORDS'; keywords: string[] }
  | { type: 'SET_REVIEW_NEGATIVE_KEYWORD_LISTS'; lists: NegativeKeywordList[] }
  | { type: 'SET_NEGATIVE_KEYWORDS'; negativeKeywords: NegativeKeyword[] }
  | { type: 'SET_NEGATIVE_KEYWORD_LISTS'; lists: NegativeKeywordList[] }
  | { type: 'RESTORE_RESEARCH_STATE'; backup: WorkflowResearchBackup }
  | { type: 'SET_PROCESSING'; isProcessing: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'HYDRATE':
      return action.state;
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
        messagingProfile: initialState.messagingProfile,
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
        messagingProfile: action.messagingProfile,
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
        enhancedKeywords: [],
        enhancedSuppressed: [],
        campaigns: [],
        reviewNegativeKeywords: [],
        reviewNegativeKeywordLists: [],
        negativeKeywords: [],
        negativeKeywordLists: [],
      };
    case 'SET_ENHANCED_KEYWORDS':
      return {
        ...state,
        enhancedKeywords: action.keywords,
        enhancedSuppressed: action.suppressed,
        campaigns: [],
        reviewNegativeKeywords: [],
        reviewNegativeKeywordLists: [],
        negativeKeywords: [],
        negativeKeywordLists: [],
      };
    case 'SET_CAMPAIGNS':
      return { ...state, campaigns: action.campaigns };
    case 'SET_MANUAL_SEEDS':
      return { ...state, manualSeedKeywords: action.keywords, ...createDownstreamResearchReset() };
    case 'SET_COMPETITOR_NAMES':
      return { ...state, competitorNames: normalizeCompetitorNames(action.names) };
    case 'SET_COMPETITOR_CAMPAIGN_MODE':
      return {
        ...state,
        strategy: {
          ...state.strategy,
          competitorCampaignMode: action.mode,
        },
      };
    case 'SET_REVIEW_NEGATIVE_KEYWORDS':
      return {
        ...state,
        reviewNegativeKeywords: action.keywords,
        campaigns: [],
        negativeKeywords: [],
        negativeKeywordLists: [],
      };
    case 'SET_REVIEW_NEGATIVE_KEYWORD_LISTS':
      return {
        ...state,
        reviewNegativeKeywordLists: action.lists,
        campaigns: [],
        negativeKeywords: [],
        negativeKeywordLists: [],
      };
    case 'SET_NEGATIVE_KEYWORDS':
      return { ...state, negativeKeywords: action.negativeKeywords };
    case 'SET_NEGATIVE_KEYWORD_LISTS':
      return { ...state, negativeKeywordLists: action.lists };
    case 'RESTORE_RESEARCH_STATE':
      return {
        ...state,
        competitorNames: normalizeCompetitorNames(action.backup.competitorNames),
        seedKeywords: action.backup.seedKeywords,
        selectedKeywords: action.backup.selectedKeywords,
        suppressedKeywords: action.backup.suppressedKeywords,
        enhancedKeywords: action.backup.enhancedKeywords,
        enhancedSuppressed: action.backup.enhancedSuppressed,
      };
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

const WorkflowContext = createContext<{
  state: WorkflowState;
  dispatch: Dispatch<WorkflowAction>;
  restart: () => void;
  hydrated: boolean;
} | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const selectedServicesKey = useMemo(
    () => [...state.selectedServices].sort().join('|'),
    [state.selectedServices],
  );

  useEffect(() => {
    dispatch({ type: 'HYDRATE', state: loadPersistedWorkflowState() });
    const timer = window.setTimeout(() => {
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistWorkflowState(state);
    persistResearchBackup(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const backup = loadPersistedResearchBackup();
    if (!backup) return;
    const hasResearchState =
      state.seedKeywords.length > 0 ||
      state.selectedKeywords.length > 0 ||
      state.suppressedKeywords.length > 0 ||
      state.enhancedKeywords.length > 0 ||
      state.enhancedSuppressed.length > 0;
    if (hasResearchState) return;
    if (!['competitors', 'enhance', 'review', 'campaign'].includes(state.currentStep)) return;
    if (backup.targetUrl !== state.targetUrl) return;
    if (backup.geoDisplayName !== state.geoDisplayName) return;
    const backupServicesKey = [...backup.selectedServices].sort().join('|');
    if (backupServicesKey !== selectedServicesKey) return;
    dispatch({ type: 'RESTORE_RESEARCH_STATE', backup });
  }, [
    dispatch,
    hydrated,
    state.currentStep,
    state.targetUrl,
    state.geoDisplayName,
    selectedServicesKey,
    state.seedKeywords.length,
    state.selectedKeywords.length,
    state.suppressedKeywords.length,
    state.enhancedKeywords.length,
    state.enhancedSuppressed.length,
  ]);

  const restart = useCallback(() => {
    clearPersistedWorkflowState();
    dispatch({ type: 'RESET' });
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, restart, hydrated }),
    [state, dispatch, restart, hydrated]
  );

  if (!hydrated) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider');
  return ctx;
}
