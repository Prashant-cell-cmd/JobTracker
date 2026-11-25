import { createServer } from 'node:http';
import { createApp } from './app';
import { createDatabase } from './database';

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535.');
}

const database = createDatabase();
const server = createServer(createApp(database));

server.listen(port, host, () => {
  console.log(`JobTracker API listening at http://${host}:${port}`);
  console.log(`SQLite database: ${process.env.DATABASE_PATH ?? 'server/data/jobtracker.sqlite'}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
