import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const here = fileURLToPath(new URL('.', import.meta.url));
const distRoot = resolve(here, '../../dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const safe = normalize(join(distRoot, pathname));
  if (!safe.startsWith(distRoot)) {
    res.writeHead(403).end();
    return true;
  }

  try {
    const s = await stat(safe);
    if (!s.isFile()) return false;
  } catch {
    // index.html fallback for SPA-style 404s
    if (pathname !== '/index.html') {
      return await serveFile(res, join(distRoot, 'index.html'), '/index.html');
    }
    return false;
  }
  return await serveFile(res, safe, pathname);
}

async function serveFile(res: ServerResponse, file: string, urlPath: string): Promise<boolean> {
  const ext = extname(file).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  res.setHeader('Content-Type', type);

  // index.html must never be cached; everything else is content-hashed by Vite
  // and safe to cache aggressively. See docs/discord/dicetable/README.md.
  if (urlPath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  await new Promise<void>((done, fail) => {
    const stream = createReadStream(file);
    stream.on('error', fail);
    stream.on('end', () => done());
    stream.pipe(res);
  });
  return true;
}
