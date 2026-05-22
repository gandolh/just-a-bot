import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnv } from '@bots/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(here, '../.env');

const schema = z.object({
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_ALLOWED_NUMBER: z.string().regex(/^\d+$/).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  GRAPH_API_VERSION: z.string().default('v21.0'),
});

export const env = loadEnv(schema, { path: envPath });
