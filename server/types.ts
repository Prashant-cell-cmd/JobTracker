export const jobStatuses = ['Applied', 'Interview', 'Offer', 'Rejected'] as const;

export type JobStatus = (typeof jobStatuses)[number];

export type Job = {
  id: string;
  company: string;
  title: string;
  location: string;
  salary: string;
  notes: string;
  applicationUrl: string;
  resumeName: string;
  resumeUri: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
};

export type JobInput = Omit<Job, 'id' | 'createdAt' | 'updatedAt'>;

export type ImportedJob = Omit<Job, 'updatedAt'>;
