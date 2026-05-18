import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

// drizzle-kit only auto-loads .env, not .env.local — load it explicitly so
// db:generate and db:migrate work without manual env sourcing in every shell.
config({ path: '.env.local' });

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
