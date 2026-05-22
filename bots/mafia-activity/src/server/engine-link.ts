// /engine WS — the discord bot connects here as a client. Auth via shared
// token from env (ENGINE_AUTH_TOKEN). Only one engine socket is tracked at
// a time (last-wins on reconnect).

import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '@bots/shared';
import type {
  EngineOutbound,
  EngineInbound,
} from '@bots/shared';
import { env } from './env.ts';
import {
  broadcastState,
  broadcastNoGame,
  broadcastEngineOffline,
  broadcastEngineOnline,
  setInstanceEndedEmitter,
} from './instances.ts';

const log = logger.scoped('mafia-activity:engine');

let engineSocket: WebSocket | null = null;

export function isEngineConnected(): boolean {
  return engineSocket?.readyState === WebSocket.OPEN;
}

export function sendToEngine(msg: EngineInbound): boolean {
  if (engineSocket?.readyState === WebSocket.OPEN) {
    engineSocket.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export function startEngineWs(): WebSocketServer {
  const wss = new WebSocketServer({ port: env.ENGINE_LISTEN_PORT });

  // Wire instances.ts to forward instance-ended events back to the bot.
  setInstanceEndedEmitter((channelId) => {
    sendToEngine({ kind: 'instance-ended', channelId });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token');
    if (token !== env.ENGINE_AUTH_TOKEN) {
      log.warn('engine socket rejected: bad token');
      ws.close(4401, 'unauthorized');
      return;
    }

    // Replace any previous bot connection (last-wins).
    if (engineSocket && engineSocket.readyState === WebSocket.OPEN) {
      log.info('engine socket replaced by new connection');
      try { engineSocket.close(4409, 'replaced'); } catch { /* noop */ }
    }
    engineSocket = ws;
    log.info('engine socket open');
    broadcastEngineOnline();

    ws.on('message', (data) => {
      let msg: EngineOutbound;
      try { msg = JSON.parse(data.toString()) as EngineOutbound; } catch {
        log.warn('engine sent malformed json');
        return;
      }
      switch (msg.kind) {
        case 'engine-hello':
          log.info(`engine handshake v${msg.version}`);
          break;
        case 'state':
          broadcastState(msg.channelId, msg.state);
          break;
        case 'no-game':
          broadcastNoGame(msg.channelId);
          break;
      }
    });

    ws.on('close', () => {
      if (engineSocket === ws) {
        engineSocket = null;
        log.warn('engine socket closed');
        broadcastEngineOffline();
      }
    });

    ws.on('error', (err) => log.warn('engine socket error', err));
  });

  log.info(`engine ws listening on :${env.ENGINE_LISTEN_PORT}`);
  return wss;
}
