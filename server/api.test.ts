import assert from 'node:assert/strict';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from './app';
import { extractCandidateProfile } from './candidate-profile';
import { createDatabase } from './database';
import { listJobs } from './jobs-repository';

type SessionResponse = {
  token: string;
  user: { id: string; email: string };
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function createTextPdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td ${lines
    .map((line) => `(${line.replace(/[\\()]/g, '\\$&')}) Tj 0 -18 Td`)
    .join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document);
}

test('authenticated jobs API preserves legacy data and isolates user accounts', async (context) => {
  assert.deepEqual(extractCandidateProfile([
    'Jane Doe',
    'jane.doe@example.com',
    '+1 415 555 0134',
    'Skills: TypeScript, React Native',
    'Experience',
    'Example Company',
  ].join('\n')), {
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+1 415 555 0134',
    skills: ['TypeScript', 'React Native'],
  });

  const directory = mkdtempSync(join(tmpdir(), 'jobtracker-api-'));
  const databasePath = join(directory, 'test.sqlite');
  const legacyDatabase = new Database(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY NOT NULL,
      company TEXT NOT NULL CHECK (length(trim(company)) > 0),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      location TEXT NOT NULL DEFAULT '',
      salary TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      application_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Applied'
        CHECK (status IN ('Applied', 'Interview', 'Offer', 'Rejected')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO jobs (id, company, title, created_at, updated_at)
    VALUES ('legacy-job-id', 'Legacy Co', 'Product Designer', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
  `);
  legacyDatabase.close();

  let database = createDatabase(databasePath);
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  context.after(async () => {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (database.open) database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const blockedOrigin = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'https://untrusted.example' },
  });
  assert.equal(blockedOrigin.status, 403);
  const allowedOrigin = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'http://localhost:8081' },
  });
  assert.equal(allowedOrigin.status, 200);
  assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'http://localhost:8081');

  const unauthenticated = await fetch(`${baseUrl}/jobs`);
  assert.equal(unauthenticated.status, 401);
  const unauthenticatedProfile = await fetch(`${baseUrl}/profile`);
  assert.equal(unauthenticatedProfile.status, 401);
  const unauthenticatedResumeParse = await fetch(`${baseUrl}/profile/parse-resume`, { method: 'POST' });
  assert.equal(unauthenticatedResumeParse.status, 401);

  const invalidRegistration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
  });
  assert.equal(invalidRegistration.status, 400);

  const registerResponse = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'First@Example.com', password: 'long-enough-password' }),
  });
  assert.equal(registerResponse.status, 201);
  const firstSession = await registerResponse.json() as SessionResponse;
  assert.equal(firstSession.user.email, 'first@example.com');
  assert.ok(firstSession.token.length >= 40);

  const storedToken = database.prepare('SELECT token_hash FROM sessions WHERE user_id = ?')
    .get(firstSession.user.id) as { token_hash: string };
  assert.notEqual(storedToken.token_hash, firstSession.token);
  assert.equal(storedToken.token_hash.length, 64);

  const savedProfileResponse = await fetch(`${baseUrl}/profile`, {
    method: 'PUT',
    headers: { ...authHeaders(firstSession.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1 415 555 0134',
      skills: ['TypeScript', 'React Native'],
    }),
  });
  assert.equal(savedProfileResponse.status, 200);
  const savedProfile = await savedProfileResponse.json() as { fullName: string; skills: string[] };
  assert.equal(savedProfile.fullName, 'Jane Doe');
  assert.deepEqual(savedProfile.skills, ['TypeScript', 'React Native']);
  const loadedProfile = await fetch(`${baseUrl}/profile`, { headers: authHeaders(firstSession.token) });
  assert.deepEqual(await loadedProfile.json(), {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+1 415 555 0134',
    skills: ['TypeScript', 'React Native'],
  });

  const resumeForm = new FormData();
  resumeForm.append('resume', new Blob([
    new Uint8Array(createTextPdf(['Jane Doe', 'jane.doe@example.com', '+1 415 555 0134', 'Skills: TypeScript, React Native'])),
  ], { type: 'application/pdf' }), 'jane-doe.pdf');
  const parsedResumeResponse = await fetch(`${baseUrl}/profile/parse-resume`, {
    method: 'POST',
    headers: authHeaders(firstSession.token),
    body: resumeForm,
  });
  assert.equal(parsedResumeResponse.status, 200);
  const parsedProfile = await parsedResumeResponse.json() as { fullName: string; email: string; skills: string[] };
  assert.equal(parsedProfile.fullName, 'Jane Doe');
  assert.equal(parsedProfile.email, 'jane.doe@example.com');
  assert.deepEqual(parsedProfile.skills, ['TypeScript', 'React Native']);

  const currentUser = await fetch(`${baseUrl}/auth/me`, { headers: authHeaders(firstSession.token) });
  assert.equal(currentUser.status, 200);
  assert.deepEqual((await currentUser.json() as { user: { id: string } }).user.id, firstSession.user.id);

  const duplicateRegistration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'FIRST@example.com', password: 'long-enough-password' }),
  });
  assert.equal(duplicateRegistration.status, 409);

  const legacyJobsResponse = await fetch(`${baseUrl}/jobs`, { headers: authHeaders(firstSession.token) });
  assert.equal(legacyJobsResponse.status, 200);
  const legacyJobs = await legacyJobsResponse.json() as { id: string }[];
  assert.deepEqual(legacyJobs.map((job) => job.id), ['legacy-job-id']);

  const invalid = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { ...authHeaders(firstSession.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: '', title: 'Engineer' }),
  });
  assert.equal(invalid.status, 400);

  const createdResponse = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { ...authHeaders(firstSession.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      title: 'Software Engineer',
      notes: 'Follow up next week',
      applicationUrl: 'https://example.com/jobs/1',
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { id: string; status: string };
  assert.equal(created.status, 'Applied');

  const secondRegisterResponse = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'second@example.com', password: 'another-long-password' }),
  });
  assert.equal(secondRegisterResponse.status, 201);
  const secondSession = await secondRegisterResponse.json() as SessionResponse;
  const secondProfileResponse = await fetch(`${baseUrl}/profile`, { headers: authHeaders(secondSession.token) });
  assert.deepEqual(await secondProfileResponse.json(), { fullName: '', email: '', phone: '', skills: [] });
  const secondUserJobs = await fetch(`${baseUrl}/jobs`, { headers: authHeaders(secondSession.token) });
  assert.equal(secondUserJobs.status, 200);
  assert.deepEqual(await secondUserJobs.json(), []);

  const crossAccountRead = await fetch(`${baseUrl}/jobs/${created.id}`, {
    headers: authHeaders(secondSession.token),
  });
  assert.equal(crossAccountRead.status, 404);
  const crossAccountDelete = await fetch(`${baseUrl}/jobs/${created.id}`, {
    method: 'DELETE',
    headers: authHeaders(secondSession.token),
  });
  assert.equal(crossAccountDelete.status, 404);

  const updateResponse = await fetch(`${baseUrl}/jobs/${created.id}/status`, {
    method: 'PATCH',
    headers: { ...authHeaders(firstSession.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Interview' }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json() as { status: string }).status, 'Interview');

  const editResponse = await fetch(`${baseUrl}/jobs/${created.id}`, {
    method: 'PUT',
    headers: { ...authHeaders(firstSession.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Acme',
      title: 'Senior Software Engineer',
      location: 'Remote',
      salary: '$140k',
      notes: 'Final round',
      applicationUrl: 'https://example.com/jobs/1',
      status: 'Offer',
    }),
  });
  assert.equal(editResponse.status, 200);
  assert.equal((await editResponse.json() as { title: string }).title, 'Senior Software Engineer');

  const importedResponse = await fetch(`${baseUrl}/jobs/import`, {
    method: 'POST',
    headers: { ...authHeaders(firstSession.token), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      id: 'legacy-import-id',
      company: 'Imported Co',
      title: 'Product Designer',
      location: '',
      salary: '',
      notes: '',
      applicationUrl: '',
      status: 'Applied',
      createdAt: '2025-01-01T00:00:00.000Z',
    }]),
  });
  assert.equal(importedResponse.status, 200);
  assert.equal((await importedResponse.json() as { imported: number }).imported, 1);
  const repeatedImport = await fetch(`${baseUrl}/jobs/import`, {
    method: 'POST',
    headers: { ...authHeaders(firstSession.token), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      id: 'legacy-import-id',
      company: 'Imported Co',
      title: 'Product Designer',
      location: '',
      salary: '',
      notes: '',
      applicationUrl: '',
      status: 'Applied',
      createdAt: '2025-01-01T00:00:00.000Z',
    }]),
  });
  assert.equal((await repeatedImport.json() as { imported: number }).imported, 0);

  const deleteResponse = await fetch(`${baseUrl}/jobs/${created.id}`, {
    method: 'DELETE',
    headers: authHeaders(firstSession.token),
  });
  assert.equal(deleteResponse.status, 204);
  const missingResponse = await fetch(`${baseUrl}/jobs/${created.id}`, {
    headers: authHeaders(firstSession.token),
  });
  assert.equal(missingResponse.status, 404);

  const invalidLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'first@example.com', password: 'wrong-password-long' }),
  });
  assert.equal(invalidLogin.status, 401);
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'FIRST@example.com', password: 'long-enough-password' }),
  });
  assert.equal(loginResponse.status, 200);
  const loggedInSession = await loginResponse.json() as SessionResponse;

  const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: authHeaders(firstSession.token),
  });
  assert.equal(logoutResponse.status, 204);
  const revokedSession = await fetch(`${baseUrl}/jobs`, { headers: authHeaders(firstSession.token) });
  assert.equal(revokedSession.status, 401);
  const activeLoginSession = await fetch(`${baseUrl}/jobs`, { headers: authHeaders(loggedInSession.token) });
  assert.equal(activeLoginSession.status, 200);

  database.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?')
    .run('2020-01-01T00:00:00.000Z', secondSession.user.id);
  const expiredSession = await fetch(`${baseUrl}/jobs`, { headers: authHeaders(secondSession.token) });
  assert.equal(expiredSession.status, 401);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  database.close();
  database = createDatabase(databasePath);
  assert.deepEqual(listJobs(database, firstSession.user.id).map((job) => job.id), [
    'legacy-import-id',
    'legacy-job-id',
  ]);
});
