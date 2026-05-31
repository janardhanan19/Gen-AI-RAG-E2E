import { splitLines, isHeaderLine } from '../parser.utils.js';

// Phase 4 — Contact parser. Extracts name, email and phone from cleaned text.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Matches common phone formats: optional +country, separators, 7-15 digits.
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/;

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
}

export function parseContact(text: string): ContactInfo {
  return {
    name: extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
  };
}

function extractEmail(text: string): string {
  const m = EMAIL_RE.exec(text);
  return m ? m[0].toLowerCase() : '';
}

function extractPhone(text: string): string {
  const lines = splitLines(text);
  // Prefer scanning the top of the resume where contact details usually sit.
  const head = lines.slice(0, 15).join('\n');
  const m = PHONE_RE.exec(head) ?? PHONE_RE.exec(text);
  if (!m) return '';
  const digits = m[0].replace(/[^\d+]/g, '');
  // Require at least 7 digits to avoid matching years/zip codes.
  return digits.replace(/\D/g, '').length >= 7 ? m[0].trim() : '';
}

// Collapses runs of single letters separated by spaces (a PDF letter-spacing
// artifact) back into words, e.g. "J A B N E R" → "JABNER". Leaves normal
// multi-letter words untouched.
function repairLetterSpacing(line: string): string {
  return line.replace(/(?:\b[A-Za-z]\s){2,}[A-Za-z]\b/g, (run) => run.replace(/\s+/g, ''));
}

// Name heuristic: the first meaningful line that isn't a section header,
// contact detail, or obvious noise. Resume names appear at the very top.
function extractName(text: string): string {
  const lines = splitLines(text);
  for (const raw of lines.slice(0, 8)) {
    const line = repairLetterSpacing((raw ?? '').trim());
    if (!line) continue;
    if (isHeaderLine(line)) continue;
    if (EMAIL_RE.test(line) || /\d/.test(line)) continue; // skip emails/phones/addresses
    if (line.includes('@') || line.startsWith('http')) continue;
    const words = line.split(/\s+/).filter(Boolean);
    // A name is typically 1–5 alphabetic words.
    if (words.length < 1 || words.length > 5) continue;
    if (!/^[A-Za-z][A-Za-z.'\- ]+$/.test(line)) continue;
    return line.replace(/\s+/g, ' ').trim();
  }
  return '';
}
