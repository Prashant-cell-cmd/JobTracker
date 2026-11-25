import type { Pool, QueryResultRow } from 'pg';
import type { CandidateProfile } from '../src/types/candidate-profile';
import { isSqliteDatabase, type AppDatabase, type SqliteDatabase } from './database';
import type { ImportedJob, Job, JobInput, JobStatus } from './types';

export type User = {
  id: string;
  email: string;
  createdAt: string;
};

type JobRow = QueryResultRow & {
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

type UserRow = QueryResultRow & {
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

export async function getCandidateProfile(database: AppDatabase, userId: string): Promise<CandidateProfile> {
  if (isSqliteDatabase(database)) {
    const row = database.prepare(`
      SELECT full_name, email, phone, skills FROM candidate_profiles WHERE user_id = ?
    `).get(userId) as { full_name: string; email: string; phone: string; skills: string } | undefined;
    return row
      ? { fullName: row.full_name, email: row.email, phone: row.phone, skills: JSON.parse(row.skills) as string[] }
      : { fullName: '', email: '', phone: '', skills: [] };
  }

  const { rows } = await database.query<{
    full_name: string;
    email: string;
    phone: string;
    skills: string;
  }>(`
    SELECT full_name, email, phone, skills FROM candidate_profiles WHERE user_id = $1
  `, [userId]);
  const row = rows[0];
  return row
    ? { fullName: row.full_name, email: row.email, phone: row.phone, skills: JSON.parse(row.skills) as string[] }
    : { fullName: '', email: '', phone: '', skills: [] };
}

export async function saveCandidateProfile(
  database: AppDatabase,
  userId: string,
  profile: CandidateProfile,
): Promise<CandidateProfile> {
  if (isSqliteDatabase(database)) {
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

  await database.query(`
    INSERT INTO candidate_profiles (user_id, full_name, email, phone, skills)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      skills = EXCLUDED.skills
  `, [userId, profile.fullName, profile.email, profile.phone, JSON.stringify(profile.skills)]);
  return profile;
}

export async function getUserByEmail(
  database: AppDatabase,
  email: string,
): Promise<(User & { passwordHash: string }) | undefined> {
  if (isSqliteDatabase(database)) {
    const row = database.prepare(`
      SELECT id, email, password_hash, created_at
      FROM users WHERE email = ?
    `).get(email) as (UserRow & { password_hash: string }) | undefined;
    return row ? { ...toUser(row), passwordHash: row.password_hash } : undefined;
  }

  const { rows } = await database.query<UserRow & { password_hash: string }>(`
    SELECT id, email, password_hash, created_at
    FROM users WHERE LOWER(email) = LOWER($1)
  `, [email]);
  const row = rows[0];
  return row ? { ...toUser(row), passwordHash: row.password_hash } : undefined;
}

export async function createUser(
  database: AppDatabase,
  user: User & { passwordHash: string },
): Promise<User | undefined> {
  if (isSqliteDatabase(database)) {
    const register = database.transaction((newUser: User & { passwordHash: string }) => {
      if (database.prepare('SELECT id FROM users WHERE email = ?').get(newUser.email)) return undefined;

      database.prepare(`
        INSERT INTO users (id, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
      `).run(newUser.id, newUser.email, newUser.passwordHash, newUser.createdAt);

      const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
      if (userCount.count === 1) {
        database.prepare('UPDATE jobs SET user_id = ? WHERE user_id IS NULL').run(newUser.id);
      }

      return { id: newUser.id, email: newUser.email, createdAt: newUser.createdAt };
    });

    return register.immediate(user);
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<UserRow & { password_hash: string }>(`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, password_hash, created_at
    `, [user.id, user.email, user.passwordHash, user.createdAt]);
    const createdUser = rows[0];
    if (!createdUser) {
      await client.query('ROLLBACK');
      return undefined;
    }

    const userCount = await client.query<{ count: string } & QueryResultRow>(
      'SELECT COUNT(*) AS count FROM users',
    );
    if (Number(userCount.rows[0].count) === 1) {
      await client.query('UPDATE jobs SET user_id = $1 WHERE user_id IS NULL', [user.id]);
    }
    await client.query('COMMIT');
    return toUser(createdUser);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createSession(
  database: AppDatabase,
  tokenHash: string,
  userId: string,
  expiresAt: string,
  createdAt: string,
): Promise<void> {
  if (isSqliteDatabase(database)) {
    database.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(tokenHash, userId, expiresAt, createdAt);
    return;
  }

  await database.query(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES ($1, $2, $3, $4)
  `, [tokenHash, userId, expiresAt, createdAt]);
}

export async function getUserBySession(
  database: AppDatabase,
  tokenHash: string,
  now: string,
): Promise<User | undefined> {
  if (isSqliteDatabase(database)) {
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

  const { rows } = await database.query<UserRow>(`
    SELECT users.id, users.email, users.created_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
  `, [tokenHash, now]);
  const row = rows[0];
  if (!row) {
    await database.query('DELETE FROM sessions WHERE token_hash = $1 AND expires_at <= $2', [tokenHash, now]);
    return undefined;
  }
  return toUser(row);
}

export async function deleteSession(database: AppDatabase, tokenHash: string): Promise<void> {
  if (isSqliteDatabase(database)) {
    database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return;
  }
  await database.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteExpiredSessions(database: AppDatabase, now: string): Promise<void> {
  if (isSqliteDatabase(database)) {
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    return;
  }
  await database.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
}

export async function listJobs(database: AppDatabase, userId: string): Promise<Job[]> {
  if (isSqliteDatabase(database)) {
    const rows = database
      .prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(userId) as unknown as JobRow[];
    return rows.map(toJob);
  }

  const { rows } = await database.query<JobRow>(
    'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
    [userId],
  );
  return rows.map(toJob);
}

export async function getJob(database: AppDatabase, id: string, userId: string): Promise<Job | undefined> {
  if (isSqliteDatabase(database)) {
    const row = database.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(id, userId) as JobRow | undefined;
    return row ? toJob(row) : undefined;
  }

  const { rows } = await database.query<JobRow>(
    'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0] ? toJob(rows[0]) : undefined;
}

export async function createJob(database: AppDatabase, userId: string, job: Job): Promise<Job> {
  const values = [
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
  ];
  if (isSqliteDatabase(database)) {
    database.prepare(`
      INSERT INTO jobs (
        id, company, title, location, salary, notes, application_url,
        resume_name, resume_uri, status, created_at, updated_at, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...values);
    return job;
  }

  await database.query(`
    INSERT INTO jobs (
      id, company, title, location, salary, notes, application_url,
      resume_name, resume_uri, status, created_at, updated_at, user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `, values);
  return job;
}

export async function updateJob(
  database: AppDatabase,
  id: string,
  userId: string,
  details: JobInput,
  updatedAt: string,
): Promise<Job | undefined> {
  const values = [
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
  ];
  if (isSqliteDatabase(database)) {
    const result = database.prepare(`
      UPDATE jobs
      SET company = ?, title = ?, location = ?, salary = ?, notes = ?,
          application_url = ?, resume_name = ?, resume_uri = ?, status = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(...values);
    return result.changes ? getJob(database, id, userId) : undefined;
  }

  const result = await database.query(`
    UPDATE jobs
    SET company = $1, title = $2, location = $3, salary = $4, notes = $5,
        application_url = $6, resume_name = $7, resume_uri = $8, status = $9, updated_at = $10
    WHERE id = $11 AND user_id = $12
  `, values);
  return result.rowCount ? getJob(database, id, userId) : undefined;
}

export async function updateJobStatus(
  database: AppDatabase,
  id: string,
  userId: string,
  status: JobStatus,
  updatedAt: string,
): Promise<Job | undefined> {
  if (isSqliteDatabase(database)) {
    const result = database
      .prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(status, updatedAt, id, userId);
    return result.changes ? getJob(database, id, userId) : undefined;
  }

  const result = await database.query(
    'UPDATE jobs SET status = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
    [status, updatedAt, id, userId],
  );
  return result.rowCount ? getJob(database, id, userId) : undefined;
}

export async function deleteJob(database: AppDatabase, id: string, userId: string): Promise<boolean> {
  if (isSqliteDatabase(database)) {
    return database.prepare('DELETE FROM jobs WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  }
  const result = await database.query('DELETE FROM jobs WHERE id = $1 AND user_id = $2', [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function importJobs(database: AppDatabase, userId: string, jobs: ImportedJob[]): Promise<number> {
  if (jobs.length === 0) return 0;

  const columns = `
    id, company, title, location, salary, notes, application_url,
    resume_name, resume_uri, status, created_at, updated_at, user_id
  `;
  const valuesForJob = (job: ImportedJob) => [
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
  ];

  if (isSqliteDatabase(database)) {
    const insert = database.prepare(`
      INSERT INTO jobs (${columns})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    const importTransaction = database.transaction((applications: ImportedJob[]) => {
      let imported = 0;
      for (const job of applications) {
        imported += insert.run(...valuesForJob(job)).changes;
      }
      return imported;
    });
    return importTransaction(jobs);
  }

  const parameters = jobs.flatMap(valuesForJob);
  const placeholders = jobs.map((_, jobIndex) => {
    const firstParameter = jobIndex * 13 + 1;
    return `(${Array.from({ length: 13 }, (_value, index) => `$${firstParameter + index}`).join(', ')})`;
  }).join(', ');
  const result = await database.query(`
    INSERT INTO jobs (${columns})
    VALUES ${placeholders}
    ON CONFLICT(id) DO NOTHING
  `, parameters);
  return result.rowCount ?? 0;
}
