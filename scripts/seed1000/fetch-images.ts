import fs from 'node:fs';
import path from 'node:path';

type Item = { name: string; url: string; source: string };
type Pool = Record<'main' | 'appetizer' | 'dessert' | 'drink', Item[]>;

const OUT = path.resolve('scripts/seed1000/image-pool.json');
const MEALDB_CATS: Record<string, 'main' | 'appetizer' | 'dessert'> = {
  Beef: 'main', Chicken: 'main', Seafood: 'main', Pork: 'main', Lamb: 'main',
  Goat: 'main', Pasta: 'main', Side: 'appetizer', Starter: 'appetizer', Dessert: 'dessert',
};
const COMMONS_QUERIES = [
  'iced coffee', 'vietnamese iced coffee', 'bubble tea', 'fruit juice glass',
  'mango smoothie', 'iced tea glass', 'orange juice cup', 'coconut water glass',
  'lemonade glass', 'grapefruit juice', 'milk tea drink', 'summer drink glass',
];

async function getJson(url: string, timeoutMs = 20000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 seed1000/1.0' } });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch { return null; }
  finally { clearTimeout(t); }
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    const ct = res.headers.get('content-type') ?? '';
    const len = Number(res.headers.get('content-length') ?? '0');
    return res.ok && /^image\//.test(ct) && len > 5000 && len < 600_000;
  } catch { return false; }
}

async function poolmap<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 8): Promise<Awaited<R>[]> {
  const out: Awaited<R>[] = new Array(items.length) as Awaited<R>[];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

async function main() {
  const pool: Pool = { main: [], appetizer: [], dessert: [], drink: [] };

  // TheMealDB — small variant (/small/) ≈ 12KB
  const cats = await poolmap(Object.entries(MEALDB_CATS), async ([cat, bucket]) => {
    const data = (await getJson(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${cat}`)) as { meals?: { strMeal: string; strMealThumb: string }[] } | null;
    if (!data?.meals) return [];
    return data.meals.map((m) => ({
      name: m.strMeal,
      url: m.strMealThumb.replace(/\/meals\//, '/meals/small/'),
      source: 'themealdb',
      bucket,
    }));
  });
  const mealdb = cats.flat();
  const buckets = await poolmap(
    mealdb,
    async (x) => ({ ...x, ok: await probe(x.url) }),
    10,
  );
  for (const x of buckets) if (x.ok) pool[x.bucket].push({ name: x.name, url: x.url, source: x.source });
  console.log('mealdb pooled:', { main: pool.main.length, appetizer: pool.appetizer.length, dessert: pool.dessert.length });

  // Wikimedia Commons — drinks, thumb 640px
  const commonsLists = await poolmap(COMMONS_QUERIES, async (q) => {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=30&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=640&format=json`;
    const data = (await getJson(api)) as {
      query?: { pages?: Record<string, { title: string; imageinfo?: { mime: string; thumburl?: string; size?: number }[] }> };
    } | null;
    if (!data?.query?.pages) return [];
    return Object.values(data.query.pages)
      .map((p) => ({ name: p.title.replace(/^File:/, '').replace(/\.(jpg|jpeg|png)$/i, ''), info: p.imageinfo?.[0] }))
      .filter((x): x is { name: string; info: { mime: string; thumburl?: string; size?: number } } => Boolean(x.info))
      .filter((x) => (x.info.mime === 'image/jpeg'))
      .map((x) => ({ name: x.name, url: x.info.thumburl!, source: 'commons' }));
  });
  const commons = [...new Map(commonsLists.flat().map((x) => [x.url, x])).values()];
  const drank = await poolmap(commons, async (x) => ({ ...x, ok: await probe(x.url) }), 10);
  const seenUrl = new Set<string>([...pool.main, ...pool.appetizer, ...pool.dessert].map((x) => x.url));
  let drinkCount = 0;
  for (const x of drank) if (x.ok && !seenUrl.has(x.url) && pool.drink.length < 220) { pool.drink.push({ name: x.name, url: x.url, source: x.source }); seenUrl.add(x.url); drinkCount++; }
  console.log('commons probed:', commons.length, '| drinks pooled:', drinkCount);

  fs.writeFileSync(OUT, JSON.stringify(pool, null, 1));
  console.log('pool total:', pool.main.length, '/', pool.appetizer.length, '/', pool.dessert.length, '/', pool.drink.length);
}

main();
