export interface CleanResult {
  cleaned: string;
  originalLength: number;
  cleanedLength: number;
}

// Matches lines that are only a page marker, e.g. "Page 2", "Page 2 of 5",
// "2 / 5", or a bare standalone number on its own line.
const PAGE_NUMBER_LINE = /^\s*(?:page\s+)?\d+(?:\s*(?:of|\/)\s*\d+)?\s*$/i;

export class CleanerService {
  // Step 4 — Clean Text. Takes raw text from PdfService and returns a
  // normalized string ready for parsing: unicode-normalized, page numbers
  // stripped, irrelevant symbols removed, whitespace collapsed.
  static clean(rawText: string): CleanResult {
    const originalLength = rawText.length;

    let text = rawText;

    // 1. Normalize unicode (compatibility form) and line endings.
    text = text.normalize('NFKC');
    text = text.replace(/\r\n?/g, '\n');

    // 2. Replace common typographic characters with plain ASCII equivalents.
    text = text
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // single quotes
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // double quotes
      .replace(/[\u2013\u2014]/g, '-') // en/em dashes
      .replace(/[\u2022\u25CF\u25AA\u00B7]/g, '-') // bullets → hyphen
      .replace(/\u00A0/g, ' '); // non-breaking space

    // 3. Strip control characters (keep \n and \t) and the replacement char.
    text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, '');

    // 4. Remove page-number / header-footer marker lines.
    text = text
      .split('\n')
      .filter((line) => !PAGE_NUMBER_LINE.test(line))
      .join('\n');

    // 5. Collapse whitespace: tabs/repeated spaces → single space; trim each
    //    line; collapse 3+ blank lines down to a single blank line.
    text = text
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { cleaned: text, originalLength, cleanedLength: text.length };
  }
}
