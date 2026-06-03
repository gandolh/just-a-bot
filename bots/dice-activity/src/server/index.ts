import { createServer } from 'node:http';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { serveStatic } from './static.ts';
import { handleTokenExchange } from './auth.ts';
import { attachPlayWs } from './ws.ts';
import { startEngineWs } from './engine-link.ts';
import { installDispatcher } from './dispatcher.ts';

const log = logger.scoped('dice-activity');

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/api/token') {
      await handleTokenExchange(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }

    const served = await serveStatic(req, res);
    if (!served) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found. Run `npm run build` in bots/dice-activity first.');
    }
  } catch (err) {
    log.error('request failed', err);
    if (!res.headersSent) res.writeHead(500).end();
  }
});

installDispatcher();
attachPlayWs(server);
startEngineWs();

server.listen(env.HTTP_PORT, () => {
  log.info(`http + /play ws listening on :${env.HTTP_PORT}`);
});
