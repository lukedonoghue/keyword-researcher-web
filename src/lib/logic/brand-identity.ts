import { normalizeKeywordText } from './keyword-signals';

type BrandIdentityInput = {
  businessName?: string | null;
  targetDomain?: string | null;
  targetUrl?: string | null;
};

const commonDomainLabels = new Set([
  'www',
  'com',
  'co',
  'net',
  'org',
  'au',
  'uk',
  'us',
  'io',
  'app',
  'biz',
  'info',
]);

function toCollapsed(value: string): string {
  return normalizeKeywordText(value).replace(/\s+/g, '');
}

export function extractHostname(value?: string | null): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';

  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
  }
}

export function extractPrimaryDomainLabel(value?: string | null): string {
  const hostname = extractHostname(value);
  if (!hostname) return '';

  const labels = hostname
    .split('.')
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0] ?? '';

  const last = labels[labels.length - 1] ?? '';
  const secondLast = labels[labels.length - 2] ?? '';

  if (
    last.length === 2 &&
    ['co', 'com', 'net', 'org'].includes(secondLast) &&
    labels.length >= 3
  ) {
    return labels[labels.length - 3] ?? '';
  }

  return labels[labels.length - 2] ?? labels[0] ?? '';
}

export function getBrandIdentityAliases(input: BrandIdentityInput): string[] {
  const aliases = new Set<string>();

  const normalizedBusinessName = normalizeKeywordText(input.businessName ?? '');
  if (normalizedBusinessName.length >= 4) {
    aliases.add(normalizedBusinessName);
  }

  const primaryDomainLabel = extractPrimaryDomainLabel(input.targetDomain || input.targetUrl);
  const normalizedDomainLabel = normalizeKeywordText(primaryDomainLabel.replace(/[-_]+/g, ' '));
  if (normalizedDomainLabel.length >= 4) {
    aliases.add(normalizedDomainLabel);
  }

  const hostname = extractHostname(input.targetDomain || input.targetUrl);
  if (hostname) {
    const hostnameLabels = hostname
      .split('.')
      .map((label) => normalizeKeywordText(label.replace(/[-_]+/g, ' ')))
      .filter((label) => label.length >= 4 && !commonDomainLabels.has(label));

    for (const label of hostnameLabels) {
      aliases.add(label);
    }
  }

  return Array.from(aliases).sort((left, right) => right.length - left.length || left.localeCompare(right));
}

export function isSelfBrandName(candidateName: string, input: BrandIdentityInput): boolean {
  const normalizedCandidate = normalizeKeywordText(candidateName);
  const collapsedCandidate = toCollapsed(candidateName);
  if (!normalizedCandidate || !collapsedCandidate) return false;

  for (const alias of getBrandIdentityAliases(input)) {
    const collapsedAlias = toCollapsed(alias);
    if (!collapsedAlias) continue;

    if (collapsedCandidate === collapsedAlias) return true;
    if (collapsedCandidate.includes(collapsedAlias) && collapsedAlias.length >= 6) return true;
    if (collapsedAlias.includes(collapsedCandidate) && collapsedCandidate.length >= 6) return true;

    if (normalizedCandidate === alias) return true;
    if (normalizedCandidate.includes(alias) && alias.length >= 8) return true;
  }

  return false;
}

export function isSelfBrandCompetitor(
  competitor: { name?: string | null; domain?: string | null },
  input: BrandIdentityInput,
): boolean {
  const competitorHostname = extractHostname(competitor.domain);
  const targetHostname = extractHostname(input.targetDomain || input.targetUrl);

  if (competitorHostname && targetHostname && competitorHostname === targetHostname) {
    return true;
  }

  const competitorPrimaryLabel = extractPrimaryDomainLabel(competitor.domain);
  const targetPrimaryLabel = extractPrimaryDomainLabel(input.targetDomain || input.targetUrl);
  if (competitorPrimaryLabel && targetPrimaryLabel && competitorPrimaryLabel === targetPrimaryLabel) {
    return true;
  }

  return isSelfBrandName(competitor.name ?? '', input);
}

export function filterOutSelfCompetitorNames(names: string[], input: BrandIdentityInput): string[] {
  return names.filter((name) => !isSelfBrandName(name, input));
}

export function filterOutSelfCompetitors<T extends { name?: string | null; domain?: string | null }>(
  competitors: T[],
  input: BrandIdentityInput,
): T[] {
  return competitors.filter((competitor) => !isSelfBrandCompetitor(competitor, input));
}
