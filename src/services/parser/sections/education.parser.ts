import { findSection } from '../parser.utils.js';
import type { EducationEntry } from '../../../modules/ingestion/ingestion.types.js';

// Phase 4 — Education parser.
// Splits the EDUCATION section into blocks and, per block, identifies the
// degree (keyword match), institution (keyword match), and year (4-digit).

const DEGREE_RE = /\b(?:ph\.?d|doctorate|m\.?b\.?a|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|b\.?sc|m\.?sc|b\.?a\.?|m\.?a\.?|b\.?com|m\.?com|bachelor(?:'?s)?|master(?:'?s)?|diploma|associate)\b[^\n,]*/i;
const INSTITUTION_RE = /\b(?:university|college|institute|institution|school|academy|polytechnic)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;

export function parseEducation(text: string): EducationEntry[] {
  const section = findSection(text, 'education');
  if (!section) return [];

  const blocks = splitIntoBlocks(section);
  const entries: EducationEntry[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const degree = matchInLines(lines, DEGREE_RE);
    const institution = matchInLines(lines, INSTITUTION_RE, true);
    const yearMatch = YEAR_RE.exec(block);
    const year = yearMatch ? yearMatch[0] : '';

    // Skip blocks that yielded nothing useful.
    if (!degree && !institution && !year) continue;

    entries.push({
      degree: degree || (lines[0] ?? ''),
      institution,
      year,
    });
  }

  return entries;
}

// Splits a section into blocks on blank lines; falls back to one block per
// line when the section is a flat list with no blank-line separators.
function splitIntoBlocks(section: string): string[] {
  if (/\n\s*\n/.test(section)) {
    return section.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  }
  return section.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Returns the first matching line. When `whole` is true, returns the entire
// line (e.g. institution name); otherwise returns the matched substring.
function matchInLines(lines: string[], re: RegExp, whole = false): string {
  for (const line of lines) {
    const m = re.exec(line);
    if (m) return (whole ? line : m[0]).trim();
  }
  return '';
}
