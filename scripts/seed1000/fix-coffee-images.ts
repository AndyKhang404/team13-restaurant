import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

type Item = { name: string; url: string };
const POOL = path.resolve('scripts/seed1000/group-pool.json');

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    const ct = res.headers.get('content-type') ?? '';
    return res.ok && /^image\//.test(ct);
  } catch { return false; }
}

async function main() {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=' + encodeURIComponent('iced coffee') + '&gsrnamespace=6&gsrlimit=30&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=800&format=json';
  const res = await fetch(api, { headers: { 'user-agent': 'Mozilla/5.0 seed1000/1.0' } });
  const data = await res.json() as { query?: { pages?: Record<string, { title: string; imageinfo?: { mime: string; thumburl?: string }[] }> } };
  const cands = Object.values(data.query?.pages ?? {})
    .map((p) => ({ name: p.title.replace(/^File:/, ''), info: p.imageinfo?.[0] }))
    .filter((x): x is { name: string; info: { mime: string; thumburl: string } } => Boolean(x?.info?.thumburl && x.info.mime === 'image/jpeg'))
    .filter((x) => /coffee|cà phê|cà phê/i.test(x.name) && !/latte|ice cream|sausage|pumpkin/i.test(x.name))
    .map((x) => ({ name: x.name, url: x.info.thumburl }));
  console.log('candidates:', cands.length);
  const ok: Item[] = [];
  for (const c of cands) if (await probe(c.url)) ok.push({ name: c.name, url: c.url });
  console.log('probed ok:', ok.length);

  const pool = JSON.parse(fs.readFileSync(POOL, 'utf8')) as Record<string, { query: string; items: Item[] }>;
  const existing = new Set(pool['drink:cà phê'].items.map((i) => i.url));
  pool['drink:cà phê'].items = [...pool['drink:cà phê'].items, ...ok.filter((i) => !existing.has(i.url))];
  fs.writeFileSync(POOL, JSON.stringify(pool, null, 1));
  console.log('drink:cà phê pool size:', pool['drink:cà phê'].items.length);

  const dishes = await prisma.dish.findMany({
    where: { deletedAt: null, name: { contains: 'cà phê', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  console.log('cà phê dishes:', dishes.length);
  let i = 0;
  for (const d of dishes) {
    const u = ok[i++ % ok.length]?.url;
    if (!u) continue;
    await prisma.dish.update({ where: { id: d.id }, data: { imageUrl: u } });
  }
  console.log('updated coffee dishes:', i);
  await prisma.$disconnect();
}

main();
