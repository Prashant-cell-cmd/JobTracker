import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import { z } from 'zod';

import type { AppDatabase } from './database';
import { parseResume } from './candidate-profile';
import {
  createJob,
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteJob,
  deleteSession,
  getJob,
  getCandidateProfile,
  getUserByEmail,
  getUserBySession,
  importJobs,
  listJobs,
  updateJob,
  updateJobStatus,
  saveCandidateProfile,
  type User,
} from './jobs-repository';
import { jobStatuses, type ImportedJob, type JobInput } from './types';

const scryptAsync = promisify(scrypt);
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;

const jobInputSchema = z.object({
  company: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  location: z.string().trim().max(160).default(''),
  salary: z.string().trim().max(100).default(''),
  notes: z.string().trim().max(5000).default(''),
  applicationUrl: z.string()
    .trim()
    .max(2048)
    .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), 'Must be a valid HTTP(S) URL')
    .default(''),
  resumeName: z.string().trim().max(255).default(''),
  resumeUri: z.string().trim().max(4096).default(''),
  status: z.enum(jobStatuses).default('Applied'),
}).strict();

const importedJobSchema = jobInputSchema.extend({
  id: z.string().min(1).max(128),
  createdAt: z.string().datetime(),
}).strict();

const statusSchema = z.object({ status: z.enum(jobStatuses) }).strict();
const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
}).strict();
const candidateProfileSchema = z.object({
  fullName: z.string().trim().max(160),
  email: z.string().trim().email().max(254).or(z.literal('')),
  phone: z.string().trim().max(40),
  skills: z.array(z.string().trim().min(1).max(60)).max(40),
}).strict();
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = file.originalname.toLowerCase().split('.').pop();
    if (extension !== 'pdf' && extension !== 'docx') {
      callback(new Error('Choose a PDF or DOCX resume.'));
      return;
    }
    callback(null, true);
  },
}).single('resume');
const allowedOrigins = new Set(
  (process.env.EXPO_WEB_ORIGINS ?? 'http://localhost:8081,http://127.0.0.1:8081')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function parseBody<T>(
  schema: z.ZodType<T>,
  request: Request,
  response: Response,
): T | undefined {
  const result = schema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: 'Invalid request data.',
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return undefined;
  }
  return result.data;
}

function readId(request: Request, response: Response): string | undefined {
  const { id } = request.params;
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    response.status(400).json({ error: 'Invalid application ID.' });
    return undefined;
  }
  return id;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string, salt = randomBytes(16).toString('hex')): Promise<string> {
  const derivedKey = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'));

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex || !/^[a-f0-9]+$/i.test(keyHex)) return false;
  const storedKey = Buffer.from(keyHex, 'hex');
  if (storedKey.length !== PASSWORD_KEY_LENGTH) return false;
  const derivedKey = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return timingSafeEqual(storedKey, derivedKey);
}

async function issueSession(database: AppDatabase, user: User) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  await deleteExpiredSessions(database, now.toISOString());
  await createSession(database, hashToken(token), user.id, expiresAt, now.toISOString());
  return { token, expiresAt, user };
}

function getAuthenticatedUser(response: Response): User {
  const user = response.locals.authenticatedUser as User | undefined;
  if (!user) throw new Error('Authenticated user is missing from request context.');
  return user;
}

export function createApp(database: AppDatabase) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use((request, response, next) => {
    const origin = request.get('origin');
    if (origin && !allowedOrigins.has(origin)) {
      response.status(403).json({ error: 'This origin is not allowed.' });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.vary('Origin');
    }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_request, response) => {
      response.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
    },
  });

  const requireAuth: express.RequestHandler = async (request, response, next) => {
    const authorization = request.get('authorization');
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
    if (!match) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const user = await getUserBySession(database, hashToken(match[1]), new Date().toISOString());
    if (!user) {
      response.status(401).json({ error: 'Your session is invalid or has expired. Please sign in again.' });
      return;
    }
    response.locals.authenticatedUser = user;
    response.locals.sessionTokenHash = hashToken(match[1]);
    next();
  };

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post('/api/auth/register', authRateLimit, async (request, response) => {
    const credentials = parseBody(credentialsSchema, request, response);
    if (!credentials) return;

    const user = await createUser(database, {
      id: randomUUID(),
      email: credentials.email,
      passwordHash: await hashPassword(credentials.password),
      createdAt: new Date().toISOString(),
    });
    if (!user) {
      response.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    response.status(201).json(await issueSession(database, user));
  });

  app.post('/api/auth/login', authRateLimit, async (request, response) => {
    const credentials = parseBody(credentialsSchema, request, response);
    if (!credentials) return;

    const userWithPassword = await getUserByEmail(database, credentials.email);
    const storedHash = userWithPassword?.passwordHash ?? await dummyPasswordHash;
    const validPassword = await verifyPassword(credentials.password, storedHash);
    if (!userWithPassword || !validPassword) {
      response.status(401).json({ error: 'Email or password is incorrect.' });
      return;
    }

    const { passwordHash: _passwordHash, ...user } = userWithPassword;
    response.json(await issueSession(database, user));
  });

  app.get('/api/auth/me', requireAuth, (_request, response) => {
    response.json({ user: getAuthenticatedUser(response) });
  });

  app.get('/api/profile', requireAuth, async (_request, response) => {
    response.json(await getCandidateProfile(database, getAuthenticatedUser(response).id));
  });

  app.put('/api/profile', requireAuth, async (request, response) => {
    const profile = parseBody(candidateProfileSchema, request, response);
    if (!profile) return;
    response.json(await saveCandidateProfile(database, getAuthenticatedUser(response).id, profile));
  });

  app.post('/api/profile/parse-resume', requireAuth, (request, response, next) => {
    resumeUpload(request, response, (error) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        response.status(413).json({ error: 'Resume files must be 5 MB or smaller.' });
        return;
      }
      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      next();
    });
  }, async (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: 'Select a PDF or DOCX resume to parse.' });
      return;
    }
    try {
      response.json(await parseResume(request.file.buffer, request.file.originalname));
    } catch (error) {
      response.status(422).json({
        error: error instanceof Error ? error.message : 'Could not parse this resume.',
      });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (_request, response) => {
    await deleteSession(database, response.locals.sessionTokenHash as string);
    response.sendStatus(204);
  });

  app.use('/api/jobs', requireAuth);

  app.get('/api/jobs', async (_request, response) => {
    response.json(await listJobs(database, getAuthenticatedUser(response).id));
  });

  app.post('/api/jobs', async (request, response) => {
    const input = parseBody<JobInput>(jobInputSchema, request, response);
    if (!input) return;

    const now = new Date().toISOString();
    const job = await createJob(database, getAuthenticatedUser(response).id, {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    });
    response.status(201).json(job);
  });

  app.post('/api/jobs/import', async (request, response) => {
    const schema = z.array(importedJobSchema).max(500);
    const jobs = parseBody<ImportedJob[]>(schema, request, response);
    if (!jobs) return;

    const userId = getAuthenticatedUser(response).id;
    const imported = await importJobs(database, userId, jobs);
    response.status(200).json({ imported, jobs: await listJobs(database, userId) });
  });

  app.get('/api/jobs/:id', async (request, response) => {
    const id = readId(request, response);
    if (!id) return;

    const job = await getJob(database, id, getAuthenticatedUser(response).id);
    if (!job) {
      response.status(404).json({ error: 'Application not found.' });
      return;
    }
    response.json(job);
  });

  app.put('/api/jobs/:id', async (request, response) => {
    const id = readId(request, response);
    if (!id) return;

    const details = parseBody<JobInput>(jobInputSchema, request, response);
    if (!details) return;

    const job = await updateJob(database, id, getAuthenticatedUser(response).id, details, new Date().toISOString());
    if (!job) {
      response.status(404).json({ error: 'Application not found.' });
      return;
    }
    response.json(job);
  });

  app.patch('/api/jobs/:id/status', async (request, response) => {
    const id = readId(request, response);
    if (!id) return;

    const body = parseBody<{ status: (typeof jobStatuses)[number] }>(statusSchema, request, response);
    if (!body) return;

    const job = await updateJobStatus(
      database,
      id,
      getAuthenticatedUser(response).id,
      body.status,
      new Date().toISOString(),
    );
    if (!job) {
      response.status(404).json({ error: 'Application not found.' });
      return;
    }
    response.json(job);
  });

  app.delete('/api/jobs/:id', async (request, response) => {
    const id = readId(request, response);
    if (!id) return;

    if (!await deleteJob(database, id, getAuthenticatedUser(response).id)) {
      response.status(404).json({ error: 'Application not found.' });
      return;
    }
    response.sendStatus(204);
  });

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found.' });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Request body must be valid JSON.' });
      return;
    }
    console.error('JobTracker API error:', error);
    response.status(500).json({ error: 'An unexpected server error occurred.' });
  };
  app.use(errorHandler);

  return app;
}
