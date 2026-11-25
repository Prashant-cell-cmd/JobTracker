import { createServer } from 'node:http';
import { createApp } from './app';
import { createDatabase, createPostgresDatabase, isSqliteDatabase } from './database';

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const host = process.env.API_HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT or API_PORT must be an integer between 1 and 65535.');
}

async function start() {
  const database = process.env.DATABASE_URL
    ? await createPostgresDatabase()
    : createDatabase();
  const server = createServer(createApp(database));

  server.listen(port, host, () => {
    console.log(`JobTracker API listening at http://${host}:${port}`);
    console.log(isSqliteDatabase(database)
      ? `SQLite database: ${process.env.DATABASE_PATH ?? 'server/data/jobtracker.sqlite'}`
      : 'PostgreSQL database: connected via DATABASE_URL');
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error('Failed to close the JobTracker API server:', error);
        process.exitCode = 1;
      }

      void (async () => {
        try {
          if (isSqliteDatabase(database)) database.close();
          else await database.end();
        } catch (closeError) {
          console.error('Failed to close the JobTracker database:', closeError);
          process.exitCode = 1;
        }
      })();
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void start().catch((error: unknown) => {
  console.error('Failed to start the JobTracker API:', error);
  process.exitCode = 1;
});
