import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnv } from '@bots/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(here, '../.env');

const schema = z.object({
  SLACK_BOT_TOKEN: z.string().regex(/^xoxb-/),
  SLACK_APP_TOKEN: z.string().regex(/^xapp-/),
  SLACK_SIGNING_SECRET: z.string().min(1).optional(),
});

export const env = loadEnv(schema, { path: envPath });
