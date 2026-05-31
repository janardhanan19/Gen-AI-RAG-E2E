import { findSection, extractDates } from '../parser.utils.js';
import type { ExperienceEntry } from '../../../modules/ingestion/ingestion.types.js';

// Phase 4 — Experience parser.
// Heuristic: the EXPERIENCE section is split into blocks (separated by blank
// lines). Each block is one job. Within a block we read the date range, then
// treat the first text line as the title, the next as the company, and the
// remainder as the description.

// Strips any inline date range from a line so titles/companies stay clean.
const INLINE_DATE_RE = /\(?\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}.*$/i;

export function parseExperience(text: string): ExperienceEntry[] {
  const section = findSection(text, 'experience');
  if (!section) return [];

  const blocks = splitIntoBlocks(section);
  const entries: ExperienceEntry[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const { startDate, endDate } = extractDates(block);

    // Lines that are *only* a date range carry no title/company text.
    const textLines = lines.filter((l) => !isDateOnlyLine(l));
    if (textLines.length === 0) continue;

    const title = stripInlineDate(textLines[0] ?? '');
    const company = textLines.length > 1 ? stripInlineDate(textLines[1] ?? '') : '';
    const description = textLines.slice(2).join(' ').trim();

    // Require at least a title to count as a real entry.
    if (!title) continue;

    entries.push({ title, company, startDate, endDate, description });
  }

  return entries;
}

// Splits a section into blocks on blank lines. If the section has no blank
// lines, fall back to treating each line that contains a date as a new block
// boundary so multiple jobs aren't merged into one.
function splitIntoBlocks(section: string): string[] {
  if (/\n\s*\n/.test(section)) {
    return section.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  }

  const lines = section.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    const hasDate = extractDates(line).startDate !== '';
    if (hasDate && current.length > 0) {
      current.push(line);
      blocks.push(current.join('\n').trim());
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join('\n').trim());
  return blocks.filter(Boolean);
}

function isDateOnlyLine(line: string): boolean {
  const { startDate } = extractDates(line);
  if (!startDate) return false;
  // Remove the date tokens and see if anything substantive remains.
  const residue = line
    .replace(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/present|current|ongoing/gi, '')
    .replace(/[-–—\/\s|.,()]+/g, '');
  return residue.length === 0;
}

function stripInlineDate(line: string): string {
  return line.replace(INLINE_DATE_RE, '').replace(/[\s|,-]+$/, '').trim();
}
