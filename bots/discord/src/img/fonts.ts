import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { Font } from 'satori';

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = resolve(here, 'fonts');

export const fonts: Font[] = [
  {
    name: 'Inter',
    data: readFileSync(resolve(dir, 'Inter-Regular.ttf')),
    weight: 400,
    style: 'normal',
  },
  {
    name: 'Inter',
    data: readFileSync(resolve(dir, 'Inter-Bold.ttf')),
    weight: 700,
    style: 'normal',
  },
  {
    name: 'Anton',
    data: readFileSync(resolve(dir, 'Anton-Regular.woff')),
    weight: 400,
    style: 'normal',
  },
];
