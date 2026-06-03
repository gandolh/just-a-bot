import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { logger } from '@bots/shared';
import type { SpaOutbound, SpaInbound } from '@bots/shared';
import { verifySession, type Session } from './session.ts';
import { registerPlaySocket, unregisterPlaySocket } from './instances.ts';

const log = logger.scoped('dice-activity:ws');

export interface PlaySocket {
  ws: WebSocket;
  session: Session;
}

function send(ws: WebSocket, msg: SpaInbound): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// /play — SPA clients. First frame must be {kind:'hello', session}.
export function attachPlayWs(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/play') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      handlePlaySocket(ws);
    });
  });
}

function handlePlaySocket(ws: WebSocket): void {
  let registered: PlaySocket | null = null;

  const helloTimeout = setTimeout(() => {
    if (!registered) {
      send(ws, { kind: 'hello-error', reason: 'hello-timeout' });
      ws.close(4408, 'hello-timeout');
    }
  }, 10_000);

  ws.on('message', (data) => {
    let msg: SpaOutbound;
    try {
      msg = JSON.parse(data.toString()) as SpaOutbound;
    } catch {
      send(ws, { kind: 'rejected', reason: 'malformed-json' });
      return;
    }

    if (!registered) {
      if (msg.kind !== 'hello') {
        send(ws, { kind: 'hello-error', reason: 'expected-hello' });
        ws.close(4400, 'expected-hello');
        return;
      }
      const session = verifySession(msg.session);
      if (!session) {
        send(ws, { kind: 'hello-error', reason: 'invalid-session' });
        ws.close(4401, 'invalid-session');
        return;
      }
      clearTimeout(helloTimeout);
      registered = { ws, session };
      registerPlaySocket(registered);
      send(ws, {
        kind: 'hello-ack',
        user: { id: session.userId, username: session.username, avatar: session.avatar },
        channelId: session.channelId,
      });
      log.info(`play socket open: ${session.username} (${session.userId}) channel=${session.channelId}`);
      return;
    }

    // Post-hello messages are routed by the dispatcher (wired in M3).
    handlePostHello(registered, msg);
  });

  ws.on('close', () => {
    clearTimeout(helloTimeout);
    if (registered) {
      unregisterPlaySocket(registered);
      log.info(`play socket closed: ${registered.session.username}`);
    }
  });

  ws.on('error', (err) => log.warn('play socket error', err));
}

// Late-bound so dispatcher can be wired in M3 without circular imports.
type PostHelloHandler = (sock: PlaySocket, msg: SpaOutbound) => void;
let postHelloHandler: PostHelloHandler = (sock, msg) => {
  log.warn(`unhandled post-hello msg from ${sock.session.userId}: ${msg.kind}`);
  send(sock.ws, { kind: 'rejected', reason: 'not-implemented', originalKind: msg.kind });
};
export function setPostHelloHandler(fn: PostHelloHandler): void {
  postHelloHandler = fn;
}
function handlePostHello(sock: PlaySocket, msg: SpaOutbound): void {
  postHelloHandler(sock, msg);
}

export { send as sendToPlay };

// startEngineWs moved to engine-link.ts.
