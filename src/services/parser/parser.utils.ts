// Phase 4 — Shared parsing helpers.
// Heuristic, regex-based utilities used by the section parsers. The cleaned
// text (from CleanerService) uses `\n` line breaks and trimmed lines.

// Canonical resume sections mapped to the header keywords that introduce them.
// Used both to FIND a section and to know where the NEXT section begins.
export const SECTION_HEADERS: Record<string, string[]> = {
  summary: ['executive summary', 'professional summary', 'summary', 'profile', 'objective', 'about'],
  skills: ['technical skills', 'core competencies', 'skills', 'competencies', 'expertise'],
  experience: [
    'work experience',
    'professional experience',
    'employment history',
    'experience',
    'work history',
  ],
  education: ['education', 'academic background', 'qualifications', 'academics'],
  projects: ['projects', 'personal projects', 'academic projects'],
  certifications: ['certifications', 'certification', 'licenses', 'courses'],
  languages: ['languages'],
  interests: ['interests', 'hobbies'],
  references: ['references'],
};

// Flattened list of every header keyword, longest first so multi-word headers
// (e.g. "professional experience") match before their shorter substrings.
const ALL_HEADER_KEYWORDS: string[] = Object.values(SECTION_HEADERS)
  .flat()
  .sort((a, b) => b.length - a.length);

export function splitLines(text: string): string[] {
  return text.split('\n');
}

// A line is treated as a section header when, after stripping trailing
// punctuation/colons, it equals one of the known header keywords (case
// insensitive). Resume headers are typically short standalone lines.
export function isHeaderLine(line: string): string | null {
  const normalized = line.trim().replace(/[:|\-\s]+$/, '').toLowerCase();
  if (!normalized || normalized.length > 40) return null;
  for (const keyword of ALL_HEADER_KEYWORDS) {
    if (normalized === keyword) return keyword;
  }
  return null;
}

// Returns the block of text belonging to a section, starting after its header
// line and ending just before the next recognized header line. Returns '' when
// the section is not present.
export function findSection(text: string, sectionKey: keyof typeof SECTION_HEADERS): string {
  const keywords = SECTION_HEADERS[sectionKey] ?? [];
  const lines = splitLines(text);

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const matched = isHeaderLine(lines[i] ?? '');
    if (matched && keywords.includes(matched)) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return '';

  const collected: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (isHeaderLine(lines[i] ?? '')) break;
    collected.push(lines[i] ?? '');
  }
  return collected.join('\n').trim();
}

// Month names (full + abbreviated) for date detection.
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_TOKEN = `(?:${MONTH}\\.?\\s*)?\\d{4}|present|current|ongoing`;
const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|until)\\s*(${DATE_TOKEN})`,
  'i',
);
const SINGLE_DATE_RE = new RegExp(`(${DATE_TOKEN})`, 'i');

export interface DateRange {
  startDate: string;
  endDate: string;
}

// Extracts a { startDate, endDate } pair from a line/block. Falls back to a
// single date as the start when no explicit range is present. Empty strings
// when nothing matches.
export function extractDates(text: string): DateRange {
  const range = DATE_RANGE_RE.exec(text);
  if (range) {
    return { startDate: cleanDate(range[1]), endDate: cleanDate(range[2]) };
  }
  const single = SINGLE_DATE_RE.exec(text);
  if (single) {
    return { startDate: cleanDate(single[1]), endDate: '' };
  }
  return { startDate: '', endDate: '' };
}

function cleanDate(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim().replace(/\.$/, '');
  const lower = trimmed.toLowerCase();
  if (lower === 'present' || lower === 'current' || lower === 'ongoing') return 'Present';
  // Title-case a leading month abbreviation/name, keep the year as-is.
  return trimmed.replace(/^[a-z]+/i, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
}
