export type KeywordIntent = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unknown';

export interface KeywordSignal {
  intent: KeywordIntent;
  intentConfidence: number;
  intentReason: string;
  themes: string[];
  tags: string[];
  isNegativeCandidate: boolean;
  negativeReasons: string[];
}

const informationalIndicators = [
  'how',
  'what',
  'why',
  'where',
  'when',
  'definition',
  'guide',
  'tutorial',
  'tips',
  'ideas',
  'meaning',
  'meaning of',
  'differences',
  'difference between',
  'does',
  'doesn\'t',
  'can',
  'can\'t',
  'should',
];

const commercialIndicators = [
  'agency',
  'agencies',
  'management',
  'managed',
  'company',
  'companies',
  'firm',
  'consultant',
  'consultants',
  'specialist',
  'specialists',
  'expert',
  'experts',
  'professional',
  'provider',
  'providers',
  'compare',
  'alternatives',
  'reviews',
  'review',
  'difference',
  'between',
  'near',
  'nearby',
  'local',
  'service area',
  'services',
  'options',
];

const transactionalIndicators = [
  'buy',
  'purchase',
  'order',
  'book',
  'booking',
  'quote',
  'price',
  'pricing',
  'cost',
  'costs',
  'hire',
  'schedule',
  'estimate',
  'signup',
  'sign up',
  'register',
  'order now',
  'start',
  'get started',
  'call',
  'request',
  'request a',
  'near me',
  'same day',
  'book now',
];

const navigationalIndicators = [
  'login',
  'log in',
  'signin',
  'sign in',
  'forgot',
  'password',
  'account',
  'support',
  'help',
  'faq',
  'privacy',
  'policy',
  'terms',
  'contact us',
  'cookie',
  'cookie policy',
  'tos',
  'sitemap',
  'careers',
  'career',
  'job',
  'jobs',
];

const negativeIndicators = [
  'used',
  'used ',
  'used-',
  'jobs',
  'career',
  'careers',
  'login',
  'sign in',
  'support',
  'cookie',
  'privacy',
  'complaint',
  'sitemap',
  'disclaimer',
  'terms',
  'policy',
  'faq',
  'newsletter',
  'subscription',
  'unsubscribe',
];

const stopThemeWords = new Set([
  'for',
  'to',
  'with',
  'of',
  'and',
  'or',
  'your',
  'my',
  'our',
  'any',
  'in',
  'on',
  'near',
  'nearby',
  'best',
  'top',
  'cheap',
  'free',
  'online',
  'service',
  'services',
]);

export function normalizeKeywordText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeKeyword(value: string): string[] {
  if (!value) return [];
  return normalizeKeywordText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isOwnerStyleQuery(text: string): boolean {
  const normalized = normalizeKeywordText(text);
  if (!normalized) return false;
  if (/\bnear me\b/i.test(normalized)) return false;

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length < 2) return false;

  return /^(my|our)\b/i.test(normalized);
}

function hasMatch(text: string, haystack: string[]): number {
  let score = 0;
  for (const phrase of haystack) {
    if (!phrase) continue;
    const tokenPattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (tokenPattern.test(text)) {
      score += phrase.includes(' ') ? 3 : 2;
    }
  }
  return score;
}

function uniqueOrdered(items: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of items) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    ordered.push(item);
  }
  return ordered;
}

export function extractThemesFromText(text: string): string[] {
  const tokens = tokenizeKeyword(text);
  if (tokens.length === 0) return ['General'];

  const rawThemes: string[] = [];
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (stopThemeWords.has(token)) continue;
    rawThemes.push(token);
  }

  const phraseThemes: string[] = [];
  for (let index = 0; index < tokens.length - 1; index++) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if (!first || !second) continue;
    if (stopThemeWords.has(first) || stopThemeWords.has(second)) continue;
    phraseThemes.push(`${first} ${second}`);
  }

  if (rawThemes.length > 0) {
    const top = rawThemes[0];
    if (rawThemes.length >= 2) {
      const bigrams = phraseThemes.filter((phrase) => phrase.includes(top) || phrase.startsWith(top));
      if (bigrams.length > 0) {
        rawThemes.unshift(...bigrams.slice(0, 1));
      }
    }
  }

  const deduped = uniqueOrdered(rawThemes);
  if (deduped.length === 0) return ['General'];
  return deduped.slice(0, 3);
}

export function classifyKeywordIntent(text: string): Pick<KeywordSignal, 'intent' | 'intentConfidence' | 'intentReason'> {
  const normalized = normalizeKeywordText(text);
  if (!normalized) {
    return {
      intent: 'unknown',
      intentConfidence: 0,
      intentReason: 'No keyword text',
    };
  }

  const scores: Record<KeywordIntent, number> = {
    transactional: 0,
    commercial: 0,
    informational: 0,
    navigational: 0,
    unknown: 0,
  };

  scores.transactional += hasMatch(normalized, transactionalIndicators);
  scores.commercial += hasMatch(normalized, commercialIndicators) * 0.85;
  scores.informational += hasMatch(normalized, informationalIndicators) / 2;
  scores.navigational += hasMatch(normalized, navigationalIndicators) * 1.5;

  if (isOwnerStyleQuery(normalized)) {
    scores.informational += 3;
    scores.navigational = Math.max(0, scores.navigational - 1);
  }

  const commercialIntentPattern = /\b(agency|agencies|management|managed|consultant|consultants|company|companies|firm|specialist|specialists|expert|experts|provider|providers|service|services)\b/i;
  if (commercialIntentPattern.test(normalized)) {
    scores.commercial += 3;
  }

  if (/\bnear me\b/i.test(normalized) && commercialIntentPattern.test(normalized)) {
    scores.transactional += 2;
    scores.commercial += 2;
  }

  // "contact" is ambiguous: alone is often navigational, but intent can be transactional with service terms.
  if (/\bcontact\b/i.test(normalized)) {
    if (/\b(contact us|contact support)\b/i.test(normalized)) {
      scores.navigational += 2;
    } else if (commercialIntentPattern.test(normalized) || /\b(near me|quote|pricing|cost|hire|book)\b/i.test(normalized)) {
      scores.transactional += 1.5;
    } else {
      scores.navigational += 1;
    }
  }

  if (/\b(price|pricing|quote|cost|book now)\b/i.test(normalized)) {
    scores.transactional += 2;
  }

  let intent: KeywordIntent = 'unknown';
  let confidence = 0;
  let intentReason = 'No clear intent pattern matched';

  const highest = Object.entries(scores).reduce((current, [candidate, score]) => {
    return score > current[1] ? [candidate, score] : current;
  }, ['unknown', -1] as [string, number]);

  const highestIntent = highest[0] as KeywordIntent;
  const highestScore = highest[1];

  if (highestScore > 0) {
    intent = highestIntent;
    const maxPossible = 9;
    confidence = Math.min(1, highestScore / maxPossible);
    intentReason = `${intent} pattern score ${highestScore}`;
  }

  if (scores.navigational > 0 && scores.transactional > 0 && scores.transactional > scores.navigational) {
    intent = 'transactional';
    confidence = Math.min(1, (scores.transactional / 9));
    intentReason = 'combined transaction + navigation signals';
  }

  if (intent === 'unknown') {
    confidence = 0.15;
    intentReason = 'default fallback';
  }

  return { intent, intentConfidence: confidence, intentReason };
}

export function isCompetitorBrand(text: string, competitorNames: string[]): string | null {
  if (competitorNames.length === 0) return null;
  const normalized = normalizeKeywordText(text);
  for (const name of competitorNames) {
    const normalizedName = normalizeKeywordText(name);
    if (!normalizedName) continue;
    const pattern = new RegExp(`\\b${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalized)) return name;
  }
  return null;
}

export function analyzeKeywordSignals(text: string): KeywordSignal {
  const normalized = normalizeKeywordText(text);
  const intentResult = classifyKeywordIntent(text);
  const themes = extractThemesFromText(text);

  const negativeReasons: string[] = [];
  const negativeScore = hasMatch(normalized, negativeIndicators);
  const ownerStyle = isOwnerStyleQuery(normalized);
  const isNegativeCandidate = negativeScore > 0 || ownerStyle;
  if (isNegativeCandidate) {
    negativeReasons.push(ownerStyle ? 'Appears to be an owner/support-style query' : 'Contains navigational or non-service term pattern');
  }

  const tags: string[] = [];
  if (intentResult.intent === 'transactional') tags.push('high-intent');
  if (intentResult.intent === 'commercial') tags.push('commercial');
  if (intentResult.intent === 'informational') tags.push('top-funnel');
  if (intentResult.intent === 'navigational') tags.push('navigational');
  if (themes.includes('General')) tags.push('generic');

  if (normalized.includes(' - ')) {
    tags.push('variation');
  }

  if (normalized.match(/\b(near|in|at)\s+\w+/)) {
    tags.push('geo-aware');
  }

  return {
    intent: intentResult.intent,
    intentConfidence: Number(intentResult.intentConfidence.toFixed(2)),
    intentReason: intentResult.intentReason,
    themes,
    tags,
    isNegativeCandidate,
    negativeReasons,
  };
}
