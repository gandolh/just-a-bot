import { decodeHtml } from './decode.ts';
import { fallbackQuestions } from './fallback.ts';

export interface TriviaQuestion {
  question: string;
  options: string[];   // length 4, shuffled
  correctIdx: number;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// Mapping from slash-option values to OpenTDB category IDs
export const CATEGORIES: Record<string, { label: string; id: number }> = {
  general:       { label: 'General Knowledge', id: 9 },
  books:         { label: 'Books',              id: 10 },
  film:          { label: 'Film',               id: 11 },
  music:         { label: 'Music',              id: 12 },
  science:       { label: 'Science & Nature',   id: 17 },
  computers:     { label: 'Computers',          id: 18 },
  maths:         { label: 'Mathematics',        id: 19 },
  sports:        { label: 'Sports',             id: 21 },
  geography:     { label: 'Geography',          id: 22 },
  history:       { label: 'History',            id: 23 },
  animals:       { label: 'Animals',            id: 27 },
  vehicles:      { label: 'Vehicles',           id: 28 },
  celebrities:   { label: 'Celebrities',        id: 26 },
  comics:        { label: 'Comics',             id: 29 },
  gadgets:       { label: 'Gadgets',            id: 30 },
  anime:         { label: 'Anime & Manga',      id: 31 },
  cartoons:      { label: 'Cartoon & Animations', id: 32 },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fromFallback(category?: string, difficulty?: string): TriviaQuestion {
  let pool = fallbackQuestions;
  if (difficulty) pool = pool.filter((q) => q.difficulty === difficulty);
  if (category) {
    const label = CATEGORIES[category]?.label ?? category;
    const filtered = pool.filter((q) => q.category.toLowerCase() === label.toLowerCase());
    if (filtered.length > 0) pool = filtered;
  }
  if (pool.length === 0) pool = fallbackQuestions;

  const item = pool[Math.floor(Math.random() * pool.length)];
  const all = shuffle([item.correct, ...item.incorrect]);
  const correctIdx = all.indexOf(item.correct);
  return {
    question: item.question,
    options: all,
    correctIdx,
    category: item.category,
    difficulty: item.difficulty as 'easy' | 'medium' | 'hard',
  };
}

interface OpenTDBResult {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

interface OpenTDBResponse {
  response_code: number;
  results: OpenTDBResult[];
}

export async function fetchQuestion(category?: string, difficulty?: string): Promise<TriviaQuestion> {
  try {
    const params = new URLSearchParams({ amount: '1', type: 'multiple' });
    if (category && CATEGORIES[category]) params.set('category', String(CATEGORIES[category].id));
    if (difficulty) params.set('difficulty', difficulty);

    const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`);
    if (!res.ok) return fromFallback(category, difficulty);

    const data = (await res.json()) as OpenTDBResponse;
    if (data.response_code !== 0 || !data.results.length) return fromFallback(category, difficulty);

    const r = data.results[0];
    const correct = decodeHtml(r.correct_answer);
    const incorrect = r.incorrect_answers.map(decodeHtml);
    const all = shuffle([correct, ...incorrect]);
    const correctIdx = all.indexOf(correct);

    return {
      question: decodeHtml(r.question),
      options: all,
      correctIdx,
      category: decodeHtml(r.category),
      difficulty: r.difficulty as 'easy' | 'medium' | 'hard',
    };
  } catch {
    return fromFallback(category, difficulty);
  }
}
