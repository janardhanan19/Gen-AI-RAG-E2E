import { parseContact } from './sections/contact.parser.js';
import { parseSkills } from './sections/skills.parser.js';
import { parseExperience } from './sections/experience.parser.js';
import { parseEducation } from './sections/education.parser.js';
import type { ParsedResume } from '../../modules/ingestion/ingestion.types.js';

// Phase 4 — Parser orchestrator (Step 5 in the architecture doc).
// Runs each section parser on the cleaned text and assembles a ParsedResume.

export interface ParseOutcome {
  parsed: ParsedResume;
  // Names of the top-level fields that were actually populated; logged as
  // `fieldsExtracted` per the architecture doc's logging table.
  fieldsExtracted: string[];
}

export class ParserService {
  static parse(cleanedText: string): ParseOutcome {
    const contact = parseContact(cleanedText);
    const skills = parseSkills(cleanedText);
    const experience = parseExperience(cleanedText);
    const education = parseEducation(cleanedText);

    const parsed: ParsedResume = {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      skills,
      experience,
      education,
    };

    return { parsed, fieldsExtracted: computeFieldsExtracted(parsed) };
  }
}

// A field counts as "extracted" when it has a non-empty value.
function computeFieldsExtracted(parsed: ParsedResume): string[] {
  const fields: string[] = [];
  if (parsed.name) fields.push('name');
  if (parsed.email) fields.push('email');
  if (parsed.phone) fields.push('phone');
  if (parsed.skills.length > 0) fields.push('skills');
  if (parsed.experience.length > 0) fields.push('experience');
  if (parsed.education.length > 0) fields.push('education');
  return fields;
}
