import { getAllBalances } from '../gambling/wallet.ts';
import { loadWorld } from '../rpg/world.ts';

export interface LeaderboardEntry {
  userId: string;
  score: number;
  label?: string;
}

export type Category = 'coins' | 'rpg-xp' | 'rpg-kills' | 'rpg-coins';

export async function getLeaderboard(category: Category, guildId: string): Promise<LeaderboardEntry[]> {
  switch (category) {
    case 'coins': {
      const balances = await getAllBalances();
      return Object.entries(balances)
        .map(([userId, score]) => ({ userId, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }
    case 'rpg-xp': {
      const world = await loadWorld(guildId);
      if (!world) return [];
      return Object.values(world.chars)
        .map((c) => ({ userId: c.userId, score: c.xp, label: c.name }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }
    case 'rpg-kills': {
      const world = await loadWorld(guildId);
      if (!world) return [];
      return Object.values(world.chars)
        .map((c) => ({ userId: c.userId, score: c.kills, label: c.name }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }
    case 'rpg-coins': {
      const world = await loadWorld(guildId);
      if (!world) return [];
      return Object.values(world.chars)
        .map((c) => ({ userId: c.userId, score: c.coins, label: c.name }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }
  }
}
