import { findSection } from '../parser.utils.js';

// Phase 4 — Skills parser.
// Two complementary strategies:
//   1. Parse the explicit SKILLS section, splitting on common delimiters.
//   2. Match a curated keyword dictionary across the whole resume to catch
//      skills mentioned only inside experience/projects text.

// Curated dictionary. Canonical casing here is preserved in the output.
const SKILL_DICTIONARY: string[] = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
  'Swift', 'Kotlin', 'Scala', 'SQL', 'NoSQL', 'HTML', 'CSS', 'Sass',
  'Node.js', 'Express', 'React', 'Angular', 'Vue', 'Next.js', 'Redux', 'jQuery',
  'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot', '.NET', 'Rails',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch', 'Oracle', 'SQLite', 'DynamoDB',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'CI/CD',
  'Git', 'GitHub', 'GitLab', 'Linux', 'Bash', 'GraphQL', 'REST', 'gRPC', 'Kafka', 'RabbitMQ',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'NLP',
  'Tableau', 'Power BI', 'Excel', 'Jira', 'Figma', 'Agile', 'Scrum',
  'Marketing', 'SEO', 'Operations', 'Project Management', 'Leadership', 'Communication',
  'Salesforce', 'HubSpot', 'Google Analytics',
];

// Delimiters that separate skills inside a skills section.
const SKILL_DELIMITERS = /[,;|•·\u2022\n\t]+/;

export function parseSkills(text: string): string[] {
  const found = new Map<string, string>(); // lowercase → canonical

  // Strategy 1: explicit SKILLS section.
  const section = findSection(text, 'skills');
  if (section) {
    for (const token of section.split(SKILL_DELIMITERS)) {
      const skill = token.trim().replace(/^[-\s]+|[-\s]+$/g, '');
      if (isPlausibleSkill(skill)) {
        const key = skill.toLowerCase();
        if (!found.has(key)) found.set(key, skill);
      }
    }
  }

  // Strategy 2: dictionary keyword matching across the whole resume.
  for (const skill of SKILL_DICTIONARY) {
    const re = new RegExp(`(?:^|[^a-z0-9+#.])${escapeRegExp(skill)}(?:$|[^a-z0-9+#.])`, 'i');
    if (re.test(text)) {
      const key = skill.toLowerCase();
      if (!found.has(key)) found.set(key, skill);
    }
  }

  return Array.from(found.values());
}

// Filters out section noise: keep short-ish, mostly-alphabetic tokens.
function isPlausibleSkill(skill: string): boolean {
  if (skill.length < 2 || skill.length > 40) return false;
  const words = skill.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false; // likely a sentence, not a skill
  return /[a-z]/i.test(skill);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
