import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool, withTransaction } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

export async function runMigrations(): Promise<string[]> {
  const pool = getPool();

  // Ensure schema_migrations exists before querying it
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const appliedRes = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations'
  );
  const appliedVersions = new Set(appliedRes.rows.map((r) => r.version));

  const entries = await readdir(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();

  const newlyApplied: string[] = [];

  for (const file of sqlFiles) {
    if (appliedVersions.has(file)) {
      continue;
    }

    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = await readFile(fullPath, 'utf8');

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
        [file]
      );
    });

    newlyApplied.push(file);
    console.log(`[migrate] Applied migration: ${file}`);
  }

  if (newlyApplied.length === 0) {
    console.log('[migrate] Database schema is up to date.');
  }

  return newlyApplied;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runMigrations()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[migrate] Migration failed:', err);
      await closePool();
      process.exit(1);
    });
}
