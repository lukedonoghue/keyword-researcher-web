import type { LandingCandidate } from '../types/index';

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function extractInternalLinkCandidates(markdown: string, targetUrl: string): LandingCandidate[] {
  const safeTarget = normalizeUrl(targetUrl);
  const targetHost = new URL(safeTarget).hostname.toLowerCase();
  const candidates: LandingCandidate[] = [];

  for (const match of markdown.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
    const anchorText = (match[1] || '').trim();
    const href = (match[2] || '').trim();
    if (!href) continue;
    try {
      const absolute = href.startsWith('/') ? new URL(href, safeTarget).toString() : href;
      const url = new URL(absolute);
      if (url.hostname.toLowerCase() !== targetHost) continue;
      const normalizedUrl = url.href.replace(/[#?].*$/, '').replace(/\/$/, '');
      candidates.push({
        url: normalizedUrl || url.origin,
        path: url.pathname.toLowerCase(),
        anchorText,
      });
    } catch {
      // ignore malformed links
    }
  }

  for (const match of markdown.matchAll(/https?:\/\/[^\s)\]}]+/g)) {
    const href = (match[0] || '').trim();
    if (!href) continue;
    try {
      const url = new URL(href);
      if (url.hostname.toLowerCase() !== targetHost) continue;
      const normalizedUrl = url.href.replace(/[#?].*$/, '').replace(/\/$/, '');
      candidates.push({
        url: normalizedUrl || url.origin,
        path: url.pathname.toLowerCase(),
        anchorText: '',
      });
    } catch {
      // ignore malformed urls
    }
  }

  const deduped = new Map<string, LandingCandidate>();
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.url);
    if (!existing || (!existing.anchorText && candidate.anchorText)) {
      deduped.set(candidate.url, candidate);
    }
  }
  return Array.from(deduped.values());
}

export function extractDomainBase(domain: string): string {
  return domain.replace(/\.(com|co\.uk|net|org|io)$/i, '').replace(/[^a-z0-9]/gi, ' ').trim();
}

export function normalizeItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const value = item.trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeMatchText(value: string): string[] {
  return normalizeMatchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function extractContextTerms(markdown: string): string[] {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'our', 'you', 'are', 'was', 'were', 'have', 'has',
    'about', 'home', 'contact', 'privacy', 'terms', 'policy', 'services', 'service', 'page', 'pages', 'more', 'read',
    'learn', 'click', 'menu', 'navigation', 'blog', 'news', 'help', 'support', 'login', 'signup',
  ]);
  const tokens = markdown
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([token]) => token);
}
