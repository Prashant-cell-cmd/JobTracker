import type { CandidateProfile } from '../src/types/candidate-profile';

const sectionHeading = /^(?:education|experience|work experience|employment|projects|certifications|certificates|languages|interests|summary|professional summary|profile|references|awards|publications)\b/i;
const ignoredName = /^(?:resume|curriculum vitae|cv|contact|about me|skills|experience|education)\b/i;

export function extractCandidateProfile(text: string): CandidateProfile {
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[\s•●▪*-]+/, '').trim())
    .filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  const phone = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}/)?.[0]?.trim() ?? '';
  const fullName = lines.find((line) => {
    if (line.length > 80 || ignoredName.test(line) || line.includes('@') || /https?:\/\//i.test(line)) {
      return false;
    }
    const words = line.split(/\s+/);
    return words.length >= 2 && words.length <= 4 && words.every((word) => /^[A-Z][\p{L}'-]+$/u.test(word));
  }) ?? '';

  const skillHeadingIndex = lines.findIndex((line) => /^(?:technical )?skills\b[:\s]*/i.test(line));
  const skillLines: string[] = [];
  if (skillHeadingIndex >= 0) {
    const headingContents = lines[skillHeadingIndex]?.replace(/^(?:technical )?skills\b[:\s]*/i, '').trim();
    if (headingContents) skillLines.push(headingContents);
    for (const line of lines.slice(skillHeadingIndex + 1)) {
      if (sectionHeading.test(line)) break;
      skillLines.push(line);
    }
  }
  const skills = [...new Set(
    skillLines
      .join(',')
      .split(/[,;|•]/)
      .map((skill) => skill.replace(/^[\s•●▪*-]+/, '').trim())
      .filter((skill) => (
        skill.length > 1 &&
        skill.length <= 60 &&
        !/^(?:--\s*)?\d+\s+of\s+\d+\s*--$/i.test(skill)
      )),
  )].slice(0, 40);

  return { fullName, email, phone, skills };
}

export async function parseResume(buffer: Buffer, fileName: string): Promise<CandidateProfile> {
  const extension = fileName.toLowerCase().split('.').pop();
  let text: string;

  if (extension === 'pdf' && buffer.subarray(0, 5).toString() === '%PDF-') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer, isEvalSupported: false });
    try {
      text = (await parser.getText({ first: 10 })).text;
    } finally {
      await parser.destroy();
    }
  } else if (extension === 'docx' && buffer.subarray(0, 2).toString() === 'PK') {
    const mammoth = await import('mammoth');
    const parsed = await mammoth.extractRawText({ buffer });
    text = parsed.value;
  } else {
    throw new Error('This file is not a valid PDF or DOCX resume.');
  }

  const profile = extractCandidateProfile(text);
  if (!profile.fullName && !profile.email && !profile.phone && profile.skills.length === 0) {
    throw new Error('No profile details could be detected. Try a text-based PDF or DOCX file.');
  }
  return profile;
}
