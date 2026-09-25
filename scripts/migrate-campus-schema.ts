import { Pool } from 'pg';

import { ensureCampusSchema } from '../lib/persistence/campus-schema';

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await ensureCampusSchema(pool);
    console.info('Campus schema is up to date.');
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('Campus schema migration failed:', error);
  process.exitCode = 1;
});
