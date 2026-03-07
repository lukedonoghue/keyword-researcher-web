import { normalizeKeywordText } from './keyword-signals';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanCompetitorName(value: string): string {
  return value
    .replace(/^\s*[-*•\d.)]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonCandidate(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = new Set<string>([
    trimmed,
    trimmed.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\t/g, ' '),
  ]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const firstBrace = Math.min(
        ...[candidate.indexOf('{'), candidate.indexOf('[')].filter((index) => index >= 0),
      );
      if (Number.isFinite(firstBrace) && firstBrace > 0) {
        try {
          return JSON.parse(candidate.slice(firstBrace));
        } catch {
          // Continue to the next fallback.
        }
      }
    }
  }

  return null;
}

function extractQuotedNames(raw: string): string[] {
  const normalized = raw.replace(/\\"/g, '"');
  const names: string[] = [];
  const matcher = /"name"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null = matcher.exec(normalized);

  while (match) {
    const cleaned = cleanCompetitorName(match[1] || '');
    if (cleaned) names.push(cleaned);
    match = matcher.exec(normalized);
  }

  return names;
}

function extractCompetitorNamesFromString(raw: string): string[] {
  const cleaned = cleanCompetitorName(raw);
  if (!cleaned) return [];

  const parsed = parseJsonCandidate(cleaned);
  if (parsed) {
    return extractCompetitorNamesFromUnknown(parsed);
  }

  const quotedNames = extractQuotedNames(cleaned);
  if (quotedNames.length > 0) {
    return quotedNames;
  }

  if (
    /"competitors"|\\?"name\\?"|\\?"domain\\?"|\\?"description\\?"|[{[\]}]/i.test(cleaned) &&
    cleaned.length > 40
  ) {
    return [];
  }

  return [cleaned];
}

export function extractCompetitorNamesFromUnknown(value: unknown): string[] {
  if (typeof value === 'string') {
    return extractCompetitorNamesFromString(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractCompetitorNamesFromUnknown(item));
  }

  if (isRecord(value)) {
    if (Array.isArray(value.competitors)) {
      return extractCompetitorNamesFromUnknown(value.competitors);
    }
    if (typeof value.name === 'string') {
      const names = extractCompetitorNamesFromString(value.name);
      if (names.length > 0) return names;
    }
  }

  return [];
}

export function normalizeCompetitorNames(values: unknown[]): string[] {
  const seen = new Set<string>();
  const normalizedNames: string[] = [];

  for (const value of values) {
    for (const candidate of extractCompetitorNamesFromUnknown(value)) {
      const cleaned = cleanCompetitorName(candidate);
      const normalized = normalizeKeywordText(cleaned);
      if (!cleaned || !normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      normalizedNames.push(cleaned);
    }
  }

  return normalizedNames;
}
