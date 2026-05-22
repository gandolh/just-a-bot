import type { SpaInbound, SpaOutbound } from '@bots/shared';

export type WsListener = (msg: SpaInbound) => void;

export class PlayClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<WsListener>();
  private reconnectAttempts = 0;
  private closedByUser = false;

  constructor(private readonly session: string) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
  }

  on(fn: WsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(msg: SpaOutbound): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/play`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      ws.send(JSON.stringify({ kind: 'hello', session: this.session } satisfies SpaOutbound));
    });
    ws.addEventListener('message', (e) => {
      let msg: SpaInbound;
      try { msg = JSON.parse(String(e.data)) as SpaInbound; } catch { return; }
      for (const fn of this.listeners) fn(msg);
    });
    ws.addEventListener('close', () => {
      this.ws = null;
      if (this.closedByUser) return;
      this.reconnectAttempts += 1;
      const backoff = Math.min(15_000, 500 * 2 ** Math.min(this.reconnectAttempts, 5));
      setTimeout(() => this.open(), backoff);
    });
    ws.addEventListener('error', () => {
      try { ws.close(); } catch { /* noop */ }
    });
  }
}
