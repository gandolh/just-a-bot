import { Character, levelFor } from './world.ts';

interface BountyTier {
  goal: number;
  xp: number;
  coin: number;
  // Approximate combat tier; used to weight rolls vs. player level.
  tier: number;
}

const BOUNTY_TIERS: Record<string, BountyTier> = {
  slime:  { goal: 5, xp: 30,  coin: 15, tier: 1 },
  goblin: { goal: 4, xp: 60,  coin: 30, tier: 2 },
  wolf:   { goal: 4, xp: 90,  coin: 35, tier: 3 },
  bandit: { goal: 3, xp: 100, coin: 60, tier: 4 },
  orc:    { goal: 3, xp: 160, coin: 80, tier: 5 },
  troll:  { goal: 1, xp: 150, coin: 100, tier: 7 },
};

export function rollBounty(char: Character): void {
  const entries = Object.entries(BOUNTY_TIERS);
  const target = Math.max(1, char.level);
  const weighted = entries.map(([slug, t]) => {
    const gap = Math.abs(t.tier - target);
    return { slug, t, w: 1 / (1 + gap) };
  });
  const sum = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * sum;
  for (const w of weighted) {
    r -= w.w;
    if (r <= 0) {
      char.bounty = {
        target: w.slug,
        goal: w.t.goal,
        progress: 0,
        xpReward: w.t.xp,
        coinReward: w.t.coin,
        rolledAt: new Date().toISOString(),
      };
      return;
    }
  }
}

export interface BountyClaim {
  xp: number;
  coins: number;
  leveledUp: boolean;
  newLevel?: number;
  target: string;
}

// Called whenever a player kills a mob. If the kill counts toward an active
// bounty and completes it, awards XP + coins and clears the slot.
export function onKill(char: Character, mobKind: string): BountyClaim | null {
  if (!char.bounty) return null;
  if (char.bounty.target !== mobKind) return null;

  char.bounty.progress++;
  if (char.bounty.progress < char.bounty.goal) return null;

  const xp = char.bounty.xpReward;
  const coins = char.bounty.coinReward;
  const target = char.bounty.target;
  char.coins += coins;

  const beforeLevel = levelFor(char.xp);
  char.xp += xp;
  const afterLevel = levelFor(char.xp);
  const leveledUp = afterLevel > beforeLevel;
  if (leveledUp) {
    const gained = afterLevel - beforeLevel;
    char.level = afterLevel;
    char.maxHp += 4 * gained;
    char.atk += 1 * gained;
    char.def += 1 * gained;
    char.hp = char.maxHp;
  }
  char.bounty = null;
  return { xp, coins, leveledUp, newLevel: leveledUp ? afterLevel : undefined, target };
}
