import type { ChatInputCommandInteraction } from 'discord.js';

export interface TriviaSession {
  id: string;
  channelId: string;
  messageId: string;
  question: string;
  options: string[];
  correctIdx: number;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  startedAt: number;
  expiresAt: number;
  winner: string | null;
  // Stored so the expiry timer can edit the original reply.
  // Interaction tokens last 15 minutes; the 20-second timer is well within that window.
  interaction: ChatInputCommandInteraction;
}

export const sessions = new Map<string, TriviaSession>();
