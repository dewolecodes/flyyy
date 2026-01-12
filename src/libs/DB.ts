import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PHASE_PRODUCTION_BUILD } from 'next/dist/shared/lib/constants';
import { Client } from 'pg';

import * as schema from '@/models/Schema';

import { Env } from './Env';

let client;
let drizzle;

// Need a database for production? Check out https://www.prisma.io/?via=saasboilerplatesrc
// Tested and compatible with Next.js Boilerplate
// Prefer an explicit DATABASE_URL in non-build phases, but treat obvious
// placeholder values as "not provided" to avoid DNS errors during local dev
// (e.g. someone left DATABASE_URL=YOUR_LOCAL_DB_URL in their env).
const hasDatabaseUrl = Boolean(Env.DATABASE_URL) && !/YOUR_LOCAL_DB_URL/i.test(String(Env.DATABASE_URL));

if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD && hasDatabaseUrl) {
  try {
    client = new Client({
      connectionString: String(Env.DATABASE_URL),
    });
    await client.connect();

    drizzle = drizzlePg(client, { schema });
    await migratePg(drizzle, {
      migrationsFolder: path.join(process.cwd(), 'migrations'),
    });
  } catch (e) {
    // If connecting to the configured DATABASE_URL fails (DNS, auth, etc.),
    // fall back to the embedded PGlite instance so the dev server remains usable.
    // Log a minimal console message to help debugging.
    // eslint-disable-next-line no-console
    console.warn('Falling back to embedded DB because connecting to DATABASE_URL failed:', String(e));
    client = undefined;
  }
}

if (!drizzle) {
  // Stores the db connection in the global scope to prevent multiple instances due to hot reloading with Next.js
  const global = globalThis as unknown as { client: PGlite; drizzle: PgliteDatabase<typeof schema> };

  if (!global.client) {
    global.client = new PGlite();
    await global.client.waitReady;

    global.drizzle = drizzlePglite(global.client, { schema });
  }

  drizzle = global.drizzle;
  await migratePglite(global.drizzle, {
    migrationsFolder: path.join(process.cwd(), 'migrations'),
  });
}

export const db = drizzle;
