// Phase 4 — Resume Parsing types.
// These interfaces describe the structured object produced by ParserService
// from cleaned resume text. They mirror the `resumes` collection shape in
// resume-ingestion-architecture.md (section 6), minus the storage/embedding
// fields that are added in later phases.

export interface ExperienceEntry {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year: string;
}

export interface ParsedResume {
  // Contact
  name: string;
  email: string;
  phone: string;

  // Skills
  skills: string[];

  // Experience / Education
  experience: ExperienceEntry[];
  education: EducationEntry[];
}
