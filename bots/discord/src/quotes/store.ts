import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/quotes');

export interface Quote {
  id: string;
  guildId: string;
  authorId: string;
  authorTag: string;
  content: string;
  channelId: string;
  messageId: string;
  attachments: string[];
  savedBy: string;
  savedAt: string;
}

export interface QuoteBook {
  guildId: string;
  quotes: Quote[];
}

const cache = new Map<string, QuoteBook>();
const writeChains = new Map<string, Promise<void>>();

function pathFor(guildId: string): string {
  return resolve(dataDir, `${guildId}.json`);
}

export async function loadBook(guildId: string): Promise<QuoteBook> {
  if (cache.has(guildId)) return cache.get(guildId)!;
  try {
    const raw = await readFile(pathFor(guildId), 'utf8');
    const book = JSON.parse(raw) as QuoteBook;
    cache.set(guildId, book);
    return book;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const book: QuoteBook = { guildId, quotes: [] };
      cache.set(guildId, book);
      return book;
    }
    throw err;
  }
}

async function persist(guildId: string, book: QuoteBook): Promise<void> {
  cache.set(guildId, book);
  const snapshot = JSON.stringify(book);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(pathFor(guildId), snapshot, 'utf8');
  });
  writeChains.set(guildId, next);
  await next;
}

export function newQuoteId(): string {
  return randomUUID().slice(0, 8);
}

export async function appendQuote(
  guildId: string,
  data: Omit<Quote, 'id' | 'guildId' | 'savedAt'>,
): Promise<Quote> {
  const book = await loadBook(guildId);
  const quote: Quote = {
    id: newQuoteId(),
    guildId,
    savedAt: new Date().toISOString(),
    ...data,
  };
  book.quotes.push(quote);
  await persist(guildId, book);
  return quote;
}

export async function removeQuote(guildId: string, id: string): Promise<boolean> {
  const book = await loadBook(guildId);
  const idx = book.quotes.findIndex((q) => q.id === id);
  if (idx === -1) return false;
  book.quotes.splice(idx, 1);
  await persist(guildId, book);
  return true;
}

export async function getQuote(guildId: string, id: string): Promise<Quote | null> {
  const book = await loadBook(guildId);
  return book.quotes.find((q) => q.id === id) ?? null;
}
