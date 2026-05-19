import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { z, ZodTypeAny } from 'zod';

export interface LoadEnvOptions {
  path?: string;
}

export function loadEnv<Schema extends ZodTypeAny>(
  schema: Schema,
  options: LoadEnvOptions = {},
): z.infer<Schema> {
  const envPath = options.path ?? resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    config({ path: envPath });
  }

  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
