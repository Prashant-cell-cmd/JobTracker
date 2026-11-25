import type { ImportedJob, Job, JobInput, JobStatus } from '../types/job';
import type { CandidateProfile } from '../types/candidate-profile';
import type { DocumentPickerAsset } from 'expo-document-picker';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api')
  .replace(/\/+$/, '');

export type AuthUser = {
  id: string;
  email: string;
  createdAt: string;
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Can't reach the JobTracker API at ${API_BASE_URL}. Start the backend and check the API URL.`);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) ? body.error : `The API request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return await response.json() as T;
}

function jsonBody(value: unknown): Pick<RequestInit, 'headers' | 'body'> {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  };
}

export function register(email: string, password: string): Promise<AuthSession> {
  return request<AuthSession>('/auth/register', { method: 'POST', ...jsonBody({ email, password }) });
}

export function login(email: string, password: string): Promise<AuthSession> {
  return request<AuthSession>('/auth/login', { method: 'POST', ...jsonBody({ email, password }) });
}

export function getCurrentUser(token: string): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/auth/me', undefined, token);
}

export function logout(token: string): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' }, token);
}

export function getJobs(token: string): Promise<Job[]> {
  return request<Job[]>('/jobs', undefined, token);
}

export function createJob(token: string, input: JobInput): Promise<Job> {
  return request<Job>('/jobs', { method: 'POST', ...jsonBody(input) }, token);
}

export function updateJob(token: string, id: string, input: JobInput): Promise<Job> {
  return request<Job>(`/jobs/${encodeURIComponent(id)}`, { method: 'PUT', ...jsonBody(input) }, token);
}

export function updateJobStatus(token: string, id: string, status: JobStatus): Promise<Job> {
  return request<Job>(`/jobs/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    ...jsonBody({ status }),
  }, token);
}

export function deleteJob(token: string, id: string): Promise<void> {
  return request<void>(`/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

export function importLegacyJobs(token: string, jobs: ImportedJob[]): Promise<{ imported: number; jobs: Job[] }> {
  return request<{ imported: number; jobs: Job[] }>('/jobs/import', {
    method: 'POST',
    ...jsonBody(jobs),
  }, token);
}

export function getCandidateProfile(token: string): Promise<CandidateProfile> {
  return request<CandidateProfile>('/profile', undefined, token);
}

export function saveCandidateProfile(
  token: string,
  profile: CandidateProfile,
): Promise<CandidateProfile> {
  return request<CandidateProfile>('/profile', {
    method: 'PUT',
    ...jsonBody(profile),
  }, token);
}

export async function parseResume(
  token: string,
  asset: DocumentPickerAsset,
): Promise<CandidateProfile> {
  const file = asset.file ?? new (await import('expo-file-system')).File(asset.uri);
  const formData = new FormData();
  formData.append('resume', file, asset.name);
  return request<CandidateProfile>('/profile/parse-resume', {
    method: 'POST',
    body: formData,
  }, token);
}
