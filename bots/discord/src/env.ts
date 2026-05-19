import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnv } from '@bots/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(here, '../.env');

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().regex(/^\d+$/, 'must be a numeric Discord snowflake'),
  GUILD_ID: z.string().regex(/^\d+$/, 'must be a numeric Discord snowflake'),
});

export const env = loadEnv(schema, { path: envPath });
