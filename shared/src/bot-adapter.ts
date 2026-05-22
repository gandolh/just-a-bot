export interface IncomingMessage {
  platform: 'discord' | 'telegram' | 'slack' | 'whatsapp';
  userId: string;
  channelId: string;
  text: string;
  raw: unknown;
}

export interface OutgoingMessage {
  channelId: string;
  text: string;
}

export interface BotAdapter {
  readonly platform: IncomingMessage['platform'];
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutgoingMessage): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void> | void): void;
}
