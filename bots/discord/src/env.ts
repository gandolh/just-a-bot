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
  YT_COOKIE: z.string().optional(),
  OLLAMA_API_KEY: z.string().optional(),
  OLLAMA_HOST: z.string().url().default('https://ollama.com'),
  OLLAMA_MODEL: z.string().default('gpt-oss:120b'),

  // /dicetable — voice-channel Activity. All optional: if unset, the slash
  // command still registers but reports "not configured" and the engine link
  // stays down.
  DICE_ACTIVITY_WS_URL: z.string().url().optional(),
  DICE_ACTIVITY_TOKEN: z.string().min(16).optional(),
  DICETABLE_ACTIVITY_URL: z.string().url().optional(),

  // /post — Instagram publishing. Optional: command still registers but reports
  // "not configured" if either is missing.
  IG_USER_ID: z.string().regex(/^\d+$/, 'must be a numeric IG Business account id').optional(),
  IG_ACCESS_TOKEN: z.string().min(20).optional(),
});

export const env = loadEnv(schema, { path: envPath });
