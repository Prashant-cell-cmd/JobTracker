import type { SqliteDatabase } from './database';
import type { ImportedJob, Job, JobInput, JobStatus } from './types';
import type { CandidateProfile } from '../src/types/candidate-profile';

export type User = {
  id: string;
  email: string;
  createdAt: string;
};

export function getCandidateProfile(database: SqliteDatabase, userId: string): CandidateProfile {
  const row = database.prepare(`
    SELECT full_name, email, phone, skills FROM candidate_profiles WHERE user_id = ?
  `).get(userId) as { full_name: string; email: string; phone: string; skills: string } | undefined;
  return row
    ? { fullName: row.full_name, email: row.email, phone: row.phone, skills: JSON.parse(row.skills) as string[] }
    : { fullName: '', email: '', phone: '', skills: [] };
}

export function saveCandidateProfile(
  database: SqliteDatabase,
  userId: string,
  profile: CandidateProfile,
): CandidateProfile {
  database.prepare(`
    INSERT INTO candidate_profiles (user_id, full_name, email, phone, skills)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone,
      skills = excluded.skills
  `).run(userId, profile.fullName, profile.email, profile.phone, JSON.stringify(profile.skills));
  return profile;
}

type JobRow = {
  id: string;
  company: string;
  title: string;
  location: string;
  salary: string;
  notes: string;
  application_url: string;
  resume_name: string;
  resume_uri: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string;
  created_at: string;
};

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    location: row.location,
    salary: row.salary,
    notes: row.notes,
    applicationUrl: row.application_url,
    resumeName: row.resume_name ?? '',
    resumeUri: row.resume_uri ?? '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function getUserByEmail(database: SqliteDatabase, email: string): (User & { passwordHash: string }) | undefined {
  const row = database.prepare(`
    SELECT id, email, password_hash, created_at
    FROM users WHERE email = ?
  `).get(email) as (UserRow & { password_hash: string }) | undefined;
  return row ? { ...toUser(row), passwordHash: row.password_hash } : undefined;
}

export function createUser(
  database: SqliteDatabase,
  user: User & { passwordHash: string },
): User | undefined {
  const register = database.transaction((newUser: User & { passwordHash: string }) => {
    if (getUserByEmail(database, newUser.email)) return undefined;

    database.prepare(`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(newUser.id, newUser.email, newUser.passwordHash, newUser.createdAt);

    const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (userCount.count === 1) {
      database.prepare('UPDATE jobs SET user_id = ? WHERE user_id IS NULL').run(newUser.id);
    }

    return {
      id: newUser.id,
      email: newUser.email,
      createdAt: newUser.createdAt,
    };
  });

  return register.immediate(user);
}

export function createSession(
  database: SqliteDatabase,
  tokenHash: string,
  userId: string,
  expiresAt: string,
  createdAt: string,
): void {
  database.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt, createdAt);
}

export function getUserBySession(
  database: SqliteDatabase,
  tokenHash: string,
  now: string,
): User | undefined {
  const row = database.prepare(`
    SELECT users.id, users.email, users.created_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, now) as UserRow | undefined;
  if (!row) {
    database.prepare('DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?').run(tokenHash, now);
    return undefined;
  }
  return toUser(row);
}

export function deleteSession(database: SqliteDatabase, tokenHash: string): void {
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function deleteExpiredSessions(database: SqliteDatabase, now: string): void {
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

export function listJobs(database: SqliteDatabase, userId: string): Job[] {
  const rows = database
    .prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(userId) as unknown as JobRow[];
  return rows.map(toJob);
}

export function getJob(database: SqliteDatabase, id: string, userId: string): Job | undefined {
  const row = database.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(id, userId) as JobRow | undefined;
  return row ? toJob(row) : undefined;
}

export function createJob(database: SqliteDatabase, userId: string, job: Job): Job {
  database.prepare(`
    INSERT INTO jobs (
      id, company, title, location, salary, notes, application_url,
      resume_name, resume_uri, status, created_at, updated_at, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.company,
    job.title,
    job.location,
    job.salary,
    job.notes,
    job.applicationUrl,
    job.resumeName,
    job.resumeUri,
    job.status,
    job.createdAt,
    job.updatedAt,
    userId,
  );
  return job;
}

export function updateJob(
  database: SqliteDatabase,
  id: string,
  userId: string,
  details: JobInput,
  updatedAt: string,
): Job | undefined {
  const result = database.prepare(`
    UPDATE jobs
    SET company = ?, title = ?, location = ?, salary = ?, notes = ?,
        application_url = ?, resume_name = ?, resume_uri = ?, status = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    details.company,
    details.title,
    details.location,
    details.salary,
    details.notes,
    details.applicationUrl,
    details.resumeName,
    details.resumeUri,
    details.status,
    updatedAt,
    id,
    userId,
  );
  return result.changes ? getJob(database, id, userId) : undefined;
}

export function updateJobStatus(
  database: SqliteDatabase,
  id: string,
  userId: string,
  status: JobStatus,
  updatedAt: string,
): Job | undefined {
  const result = database
    .prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(status, updatedAt, id, userId);
  return result.changes ? getJob(database, id, userId) : undefined;
}

export function deleteJob(database: SqliteDatabase, id: string, userId: string): boolean {
  return database.prepare('DELETE FROM jobs WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function importJobs(database: SqliteDatabase, userId: string, jobs: ImportedJob[]): number {
  const insert = database.prepare(`
    INSERT INTO jobs (
      id, company, title, location, salary, notes, application_url,
      resume_name, resume_uri, status, created_at, updated_at, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const importTransaction = database.transaction((applications: ImportedJob[]) => {
    let imported = 0;
    for (const job of applications) {
      const result = insert.run(
        job.id,
        job.company,
        job.title,
        job.location,
        job.salary,
        job.notes,
        job.applicationUrl,
        job.resumeName,
        job.resumeUri,
        job.status,
        job.createdAt,
        job.createdAt,
        userId,
      );
      imported += result.changes;
    }
    return imported;
  });

  return importTransaction(jobs);
}
