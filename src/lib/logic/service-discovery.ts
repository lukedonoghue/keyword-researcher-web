import type { LandingCandidate, ScoredServiceCandidate, ScrapedSource, SeedKeyword } from '../types/index';
import {
  normalizeUrl,
  extractInternalLinkCandidates,
  extractDomainBase,
  normalizeMatchText,
  tokenizeMatchText,
} from './url-utils';

/**
 * Locally-defined type matching the shape returned by
 * ServiceExtractor.extractServiceCandidates (which is not exported).
 */
type ServiceCandidateInput = {
  text: string;
  score: number;
  source: 'heading' | 'list' | 'link' | 'url';
  path?: string;
};

export const SERVICE_DISCOVERY_HINTS = [
  'service',
  'services',
  'solution',
  'solutions',
  'course',
  'courses',
  'lesson',
  'lessons',
  'class',
  'classes',
  'training',
  'program',
  'google-ads',
  'ppc',
  'seo',
  'sem',
  'ads',
  'management',
  'consult',
  'audit',
  'strategy',
  'pricing',
  'packages',
];

export const WEAK_DISCOVERY_HINTS = [
  'privacy',
  'terms',
  'cookie',
  'policy',
  'contact',
  'about',
  'blog',
  'news',
  'faq',
  'help',
  'support',
  'login',
  'signup',
  'register',
  'career',
  'careers',
];

export function rankServiceDiscoveryUrls(candidateUrls: string[], targetUrl: string, contextTerms: string[], limit: number = 8): string[] {
  const safeTarget = normalizeUrl(targetUrl);
  const targetHost = new URL(safeTarget).hostname.toLowerCase();
  const contextSet = new Set(contextTerms.map((term) => normalizeMatchText(term)).filter(Boolean));

  const ranked = candidateUrls
    .map((candidateUrl) => {
      try {
        const rawCandidate = candidateUrl.trim();
        if (!rawCandidate) return null;
        const normalizedCandidate = /^https?:\/\//i.test(rawCandidate)
          ? rawCandidate
          : rawCandidate.startsWith('/')
            ? rawCandidate
            : `/${rawCandidate}`;
        const parsed = new URL(normalizedCandidate.startsWith('/') ? new URL(normalizedCandidate, safeTarget).toString() : normalizedCandidate);
        if (parsed.hostname.toLowerCase() !== targetHost) return null;
        const path = parsed.pathname.toLowerCase() || '/';
        if (path === '/') return null;
        if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|doc|docx)$/i.test(path)) return null;

        const pathTokens = tokenizeMatchText(path.replace(/\//g, ' '));
        const depth = path.split('/').filter(Boolean).length;
        const contextOverlap = pathTokens.filter((token) => contextSet.has(token)).length;
        const hasServiceHint = SERVICE_DISCOVERY_HINTS.some((hint) => path.includes(hint));
        const isWeak = WEAK_DISCOVERY_HINTS.some((hint) => path.includes(hint));
        let score = 0;

        if (hasServiceHint) score += 14;
        if (contextOverlap > 0) score += Math.min(9, contextOverlap * 3);
        if (depth >= 1 && depth <= 3) score += 2;
        if (depth > 4) score -= 3;
        if (isWeak) score -= 16;
        if (!hasServiceHint && contextOverlap === 0) score -= 20;

        const url = parsed.href.replace(/[#?].*$/, '').replace(/\/$/, '') || parsed.origin;
        return { url, score, depth };
      } catch {
        return null;
      }
    })
    .filter((item): item is { url: string; score: number; depth: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || a.depth - b.depth);

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const item of ranked) {
    if (item.score < 4) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    selected.push(item.url);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function selectServiceDiscoveryUrls(markdown: string, targetUrl: string, contextTerms: string[], limit: number = 8): string[] {
  const candidates = extractInternalLinkCandidates(markdown, targetUrl).map((candidate) => candidate.url);
  return rankServiceDiscoveryUrls(candidates, targetUrl, contextTerms, limit);
}

export function mergeDiscoveryUrls(primary: string[], secondary: string[], limit: number): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const url of [...primary, ...secondary]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    merged.push(url);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function collectServiceCandidates(
  scoreMap: Map<string, ScoredServiceCandidate>,
  candidates: ServiceCandidateInput[],
  sourceUrl: string,
  weightBoost: number = 0
) {
  const sourcePath = (() => {
    try {
      return new URL(normalizeUrl(sourceUrl)).pathname.toLowerCase();
    } catch {
      return '/';
    }
  })();
  const sourceHasServiceHint = SERVICE_DISCOVERY_HINTS.some((hint) => sourcePath.includes(hint));

  for (const candidate of candidates) {
    const key = candidate.text.toLowerCase();
    const sourceWeight = candidate.source === 'url' ? 4 : candidate.source === 'link' ? 3 : candidate.source === 'list' ? 1 : 0;
    const currentScore = candidate.score + weightBoost + sourceWeight + (sourceHasServiceHint ? 2 : 0);
    const existing = scoreMap.get(key);

    if (!existing) {
      scoreMap.set(key, {
        name: candidate.text,
        score: currentScore,
        bestSourceUrl: sourceUrl,
        evidenceCount: 1,
        sourceCounts: {
          heading: candidate.source === 'heading' ? 1 : 0,
          list: candidate.source === 'list' ? 1 : 0,
          link: candidate.source === 'link' ? 1 : 0,
          url: candidate.source === 'url' ? 1 : 0,
        },
        supportingUrls: [sourceUrl],
      });
      continue;
    }

    const nextScore = Math.max(existing.score, currentScore) + 1;
    scoreMap.set(key, {
      ...existing,
      score: nextScore,
      bestSourceUrl: currentScore >= existing.score ? sourceUrl : existing.bestSourceUrl,
      evidenceCount: existing.evidenceCount + 1,
      sourceCounts: {
        heading: existing.sourceCounts.heading + (candidate.source === 'heading' ? 1 : 0),
        list: existing.sourceCounts.list + (candidate.source === 'list' ? 1 : 0),
        link: existing.sourceCounts.link + (candidate.source === 'link' ? 1 : 0),
        url: existing.sourceCounts.url + (candidate.source === 'url' ? 1 : 0),
      },
      supportingUrls: existing.supportingUrls.includes(sourceUrl)
        ? existing.supportingUrls
        : [...existing.supportingUrls, sourceUrl],
    });
  }
}

export function filterDetectedServices(scoredServices: Map<string, ScoredServiceCandidate>): ScoredServiceCandidate[] {
  const ranked = Array.from(scoredServices.values())
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const strict = ranked.filter((entry) => {
    const strongEvidence = entry.sourceCounts.link + entry.sourceCounts.url;
    return entry.score >= 12 || entry.evidenceCount >= 2 || strongEvidence >= 2;
  });

  const selected = strict.length > 0 ? strict : ranked.slice(0, 8);
  return selected.slice(0, 20);
}

export function extractLandingPage(markdown: string, targetUrl: string): string {
  const safeTarget = normalizeUrl(targetUrl);
  const candidates = extractInternalLinkCandidates(markdown, safeTarget);
  if (candidates.length === 0) return safeTarget;

  const ignoredPathHints = ['privacy', 'terms', 'cookie', 'policy', 'login', 'register', 'signup', 'support', 'help'];
  const weakPathHints = ['blog', 'article', 'resource', 'news', 'case-study', 'contact', 'about', 'careers', 'faq'];
  const servicePathHints = ['service', 'services', 'solution', 'ppc', 'seo', 'google-ads', 'management', 'consult', 'audit', 'strategy'];

  const ranked = candidates
    .map((candidate) => {
      const path = candidate.path || '/';
      const depth = path === '/' ? 0 : path.split('/').filter(Boolean).length;
      let score = 0;

      if (depth === 0) score += 20;
      score += Math.abs(depth - 2) * 2;
      if (ignoredPathHints.some((hint) => path.includes(`/${hint}`))) score += 60;
      if (weakPathHints.some((hint) => path.includes(`/${hint}`))) score += 18;
      if (servicePathHints.some((hint) => path.includes(hint))) score -= 18;

      const anchor = normalizeMatchText(candidate.anchorText);
      if (servicePathHints.some((hint) => anchor.includes(hint))) score -= 8;
      if (/\b(client|testimonial|learn more|read more)\b/i.test(anchor)) score += 8;

      return {
        url: candidate.url,
        score,
        depth,
      };
    })
    .sort((a, b) => a.score - b.score || a.depth - b.depth);

  return ranked[0]?.url || safeTarget;
}

export function extractServiceLandingPages(sources: ScrapedSource[], targetUrl: string, services: string[], fallback: string): Map<string, string> {
  const mappings = new Map<string, string>();
  const allCandidates: LandingCandidate[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const sourceUrl = normalizeUrl(source.url);
    const sourcePath = new URL(sourceUrl).pathname.toLowerCase();
    if (!seen.has(sourceUrl)) {
      seen.add(sourceUrl);
      allCandidates.push({
        url: sourceUrl,
        path: sourcePath,
        anchorText: '',
      });
    }
    const sourceCandidates = extractInternalLinkCandidates(source.markdown, targetUrl);
    for (const candidate of sourceCandidates) {
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      allCandidates.push(candidate);
    }
  }

  if (allCandidates.length === 0) {
    for (const service of services) mappings.set(service, fallback);
    return mappings;
  }

  const neutralTokens = new Set(['service', 'services', 'agency', 'company', 'firm', 'solution', 'solutions']);
  const weakPathHints = ['blog', 'article', 'resource', 'news', 'contact', 'about', 'privacy', 'terms', 'case-study'];

  for (const service of services) {
    const serviceTokens = tokenizeMatchText(service).filter((token) => token.length > 2 && !neutralTokens.has(token));
    let best = { url: fallback, score: Number.NEGATIVE_INFINITY };

    for (const candidate of allCandidates) {
      const path = normalizeMatchText(candidate.path || '/');
      const anchor = normalizeMatchText(candidate.anchorText || '');
      let score = 0;

      for (const token of serviceTokens) {
        if (path.includes(token)) score += 4;
        if (anchor.includes(token)) score += 3;
      }

      if (candidate.path === '/') score -= 3;
      if (weakPathHints.some((hint) => (candidate.path || '').includes(hint))) score -= 4;
      if (/\b(service|services|management|consulting|agency)\b/i.test(path)) score += 1;

      if (score > best.score) {
        best = { url: candidate.url, score };
      }
    }

    mappings.set(service, best.score >= 1 ? best.url : fallback);
  }

  return mappings;
}

export function generateServiceSeeds(services: string[], domain: string, contextTerms: string[]): SeedKeyword[] {
  const seeds: SeedKeyword[] = [];
  const seen = new Set<string>();

  const ppcSuffixes = [
    '',
    'near me',
    'best',
    'cost',
    'pricing',
    'services',
    'company',
    'agency',
  ];

  const domainBase = extractDomainBase(domain);

  for (const service of services) {
    const normalizedService = service.toLowerCase().trim();
    if (!normalizedService) continue;

    for (const suffix of ppcSuffixes) {
      const text = suffix ? `${normalizedService} ${suffix}` : normalizedService;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({
        text,
        volume: 0,
        cpc: 0,
        source: 'service_discovery',
      });
    }

    // Add domain-qualified variation if domain base differs from service name
    if (domainBase && !normalizedService.includes(domainBase)) {
      const domainVariation = `${domainBase} ${normalizedService}`;
      const key = domainVariation.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        seeds.push({
          text: domainVariation,
          volume: 0,
          cpc: 0,
          source: 'service_discovery',
        });
      }
    }
  }

  // Add top context terms as seeds too (limited)
  for (const term of contextTerms.slice(0, 10)) {
    const key = term.toLowerCase();
    if (seen.has(key) || key.length < 4) continue;
    seen.add(key);
    seeds.push({
      text: term,
      volume: 0,
      cpc: 0,
      source: 'service_discovery',
    });
  }

  return seeds;
}
