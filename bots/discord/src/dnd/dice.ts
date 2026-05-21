export type AdvMode = 'normal' | 'adv' | 'dis';

export interface RollResult {
  total: number;
  detail: string;
}

export interface DiceExpr {
  count: number;
  sides: number;
  mod: number;
}

const EXPR_RE = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i;

export function parseDice(expr: string): DiceExpr | null {
  const m = expr.match(EXPR_RE);
  if (!m) return null;
  const count = m[1] === '' ? 1 : parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
  if (count < 1 || count > 50) return null;
  if (sides < 2 || sides > 1000) return null;
  return { count, sides, mod };
}

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function rollExpr(expr: DiceExpr, mode: AdvMode = 'normal'): RollResult {
  // Advantage/disadvantage only applies meaningfully to a single die.
  if (mode !== 'normal' && expr.count === 1) {
    const a = rollDie(expr.sides);
    const b = rollDie(expr.sides);
    const chosen = mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
    const total = chosen + expr.mod;
    const pair = mode === 'adv' ? `[${bold(a, chosen)}, ${dim(b, chosen)}]` : `[${dim(a, chosen)}, ${bold(b, chosen)}]`;
    return {
      total,
      detail: `${pair}${fmtMod(expr.mod)} = **${total}** (${mode === 'adv' ? 'advantage' : 'disadvantage'})`,
    };
  }

  const rolls: number[] = [];
  for (let i = 0; i < expr.count; i++) rolls.push(rollDie(expr.sides));
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + expr.mod;
  const list = rolls.map((r) => `${r}`).join(', ');
  const piece = expr.count > 1 ? `(${list})` : `[${list}]`;
  return { total, detail: `${piece}${fmtMod(expr.mod)} = **${total}**` };
}

export function rollD20Mod(mod: number, mode: AdvMode = 'normal'): RollResult {
  return rollExpr({ count: 1, sides: 20, mod }, mode);
}

export function rollDamage(expr: string): RollResult | null {
  const parsed = parseDice(expr);
  if (!parsed) return null;
  return rollExpr(parsed, 'normal');
}

function fmtMod(mod: number): string {
  if (mod === 0) return '';
  return mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`;
}

function bold(n: number, chosen: number): string {
  return n === chosen ? `**${n}**` : `${n}`;
}

function dim(n: number, chosen: number): string {
  return n === chosen ? `**${n}**` : `~~${n}~~`;
}
