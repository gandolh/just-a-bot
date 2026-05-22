import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataFile = resolve(here, '../../data/wallets.json');

export const MAX_ADD = 100_000;

type WalletState = Record<string, number>;

let state: WalletState | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<WalletState> {
  if (state) return state;
  try {
    const raw = await readFile(dataFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    state = parsed && typeof parsed === 'object' ? (parsed as WalletState) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    state = {};
  }
  return state;
}

async function persist(): Promise<void> {
  const snapshot = JSON.stringify(state ?? {}, null, 2);
  writeChain = writeChain.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, snapshot, 'utf8');
  });
  await writeChain;
}

export async function getBalance(userId: string): Promise<number> {
  const s = await load();
  return s[userId] ?? 0;
}

export async function addCoins(userId: string, amount: number): Promise<number> {
  const s = await load();
  s[userId] = (s[userId] ?? 0) + amount;
  await persist();
  return s[userId];
}

export async function tryDebit(userId: string, amount: number): Promise<boolean> {
  const s = await load();
  const current = s[userId] ?? 0;
  if (current < amount) return false;
  s[userId] = current - amount;
  await persist();
  return true;
}

export async function credit(userId: string, amount: number): Promise<number> {
  return addCoins(userId, amount);
}

export async function getAllBalances(): Promise<Record<string, number>> {
  return load();
}
