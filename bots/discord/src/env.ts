import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnv } from '@bots/shared';
import { missingJukeboxVars } from './jukebox/atrium/env-rule.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(here, '../.env');

/** An unset optional variable may arrive as `NAME=` from a copied `.env.example`. */
const optional = <T extends z.ZodType>(inner: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), inner.optional());

const schema = z
  .object({
    DISCORD_TOKEN: z.string().min(1),
    CLIENT_ID: z.string().regex(/^\d+$/, 'must be a numeric Discord snowflake'),
    GUILD_ID: z.string().regex(/^\d+$/, 'must be a numeric Discord snowflake'),
    OLLAMA_API_KEY: z.string().optional(),
    OLLAMA_HOST: z.string().url().default('https://ollama.com'),
    OLLAMA_MODEL: z.string().default('gpt-oss:120b'),
    // The Jukebox (briefs 25-27): atrium's music, signed in as the Bot account.
    JUKEBOX_ATRIUM_URL: optional(z.string().url()),
    JUKEBOX_WARD_URL: optional(z.string().url()),
    JUKEBOX_WARD_USERNAME: optional(z.string().min(1)),
    JUKEBOX_WARD_PASSWORD: optional(z.string().min(1)),
  })
  .superRefine((vars, ctx) => {
    const missing = missingJukeboxVars(vars);
    if (missing.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: [missing[0]],
        message: `the Jukebox needs all four JUKEBOX_* variables or none; missing: ${missing.join(', ')}`,
      });
    }
  });

export const env = loadEnv(schema, { path: envPath });
