import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';

export type SqliteDatabase = InstanceType<typeof Database>;
export type AppDatabase = SqliteDatabase | Pool;

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS candidate_profiles (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '[]'
  ) STRICT;

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY NOT NULL,
    company TEXT NOT NULL CHECK (length(trim(company)) > 0),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    location TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    application_url TEXT NOT NULL DEFAULT '',
    resume_name TEXT NOT NULL DEFAULT '',
    resume_uri TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Applied'
      CHECK (status IN ('Applied', 'Interview', 'Offer', 'Rejected')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS candidate_profiles (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY NOT NULL,
    company TEXT NOT NULL CHECK (length(trim(company)) > 0),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    location TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    application_url TEXT NOT NULL DEFAULT '',
    resume_name TEXT NOT NULL DEFAULT '',
    resume_uri TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Applied'
      CHECK (status IN ('Applied', 'Interview', 'Offer', 'Rejected')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
  CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at DESC);
  CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
`;

export function createDatabase(
  filePath = process.env.DATABASE_PATH ?? join(process.cwd(), 'server', 'data', 'jobtracker.sqlite'),
): SqliteDatabase {
  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const database = new Database(filePath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.exec(schema);

  const columns = database.prepare('PRAGMA table_info(jobs)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'user_id')) {
    database.exec('ALTER TABLE jobs ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
  }

  const jobColumns = database.prepare('PRAGMA table_info(jobs)').all() as { name: string }[];
  if (!jobColumns.some((column) => column.name === 'resume_name')) {
    database.exec('ALTER TABLE jobs ADD COLUMN resume_name TEXT NOT NULL DEFAULT \'\'');
  }
  if (!jobColumns.some((column) => column.name === 'resume_uri')) {
    database.exec('ALTER TABLE jobs ADD COLUMN resume_uri TEXT NOT NULL DEFAULT \'\'');
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
    CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
  `);

  return database;
}

export async function createPostgresDatabase(
  connectionString = process.env.DATABASE_URL,
): Promise<Pool> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required when using PostgreSQL.');
  }

  const database = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
  });

  try {
    await initializePostgresDatabase(database);
    return database;
  } catch (error) {
    await database.end();
    throw error;
  }
}

export async function initializePostgresDatabase(database: Pool): Promise<void> {
  await database.query('SELECT 1');
  await database.query(postgresSchema);
}

export function isSqliteDatabase(database: AppDatabase): database is SqliteDatabase {
  return database instanceof Database;
}
