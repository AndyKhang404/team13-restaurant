import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

type Item = { name: string; url: string };
type Bucket = 'main' | 'appetizer' | 'dessert' | 'drink';
const basePool = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/family-pool.json'), 'utf8')) as Record<string, { v1Groups: string[]; items: Item[] }>;
const groupPool = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/group-pool.json'), 'utf8')) as Record<string, { items: Item[] }>;
const bucketPool = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/image-pool.json'), 'utf8')) as Record<Bucket, Item[]>;
const PREFIXES = Object.keys(basePool).sort((a, b) => b.length - a.length);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function probeSlow(url: string, attempts = 3): Promise<boolean> {
  for (let a = 0; a < attempts; a++) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'Mozilla/5.0 seed1000/2.1' } });
      const ct = res.headers.get('content-type') ?? '';
      if (res.ok && /^image\//.test(ct)) return true;
      if (res.status === 429) { await sleep(1500); continue; }
      return false;
    } catch { await sleep(1000); }
  }
  return false;
}

async function main() {
  const dishes = await prisma.dish.findMany({ where: { deletedAt: null }, select: { id: true, name: true, category: true, imageUrl: true }, orderBy: { id: 'asc' } });
  console.log('tổng món:', dishes.length);

  const bad: { id: string; name: string; url: string }[] = [];
  let checked = 0;
  for (const d of dishes) {
    const ok = await probeSlow(d.imageUrl!);
    if (!ok) bad.push({ id: d.id, name: d.name, url: d.imageUrl! });
    checked++;
    if (checked % 200 === 0) console.log('...đã check', checked);
  }
  console.log('ảnh hỏng:', bad.length);
  if (bad.length === 0) {
    console.log('không cần sửa gì');
    await prisma.$disconnect();
    return;
  }

  fs.writeFileSync(path.resolve('scripts/seed1000/broken-images.json'), JSON.stringify(bad, null, 1));

  // Thay ảnh hỏng: ưu tiên family pool chưa dùng, rồi v1 group, rồi bucket pool
  const used = new Set(dishes.map((d) => d.imageUrl));
  const cursor: Record<string, number> = {};
  const pickFrom = (key: string, arr: Item[]): Item | null => {
    for (let guard = 0; guard < arr.length; guard++) {
      cursor[key] = (cursor[key] ?? 0) % arr.length;
      const c = arr[cursor[key]++];
      if (!used.has(c.url)) { used.add(c.url); return c; }
    }
    return null;
  };

  const updates: { id: string; url: string }[] = [];
  for (const b of bad) {
    const name = b.name.toLowerCase().trim();
    const famKey = PREFIXES.find((p) => name.startsWith(p.toLowerCase()));
    let it = famKey ? pickFrom(`fam:${famKey}`, basePool[famKey].items) : null;
    if (!it && famKey) {
      for (const gk of basePool[famKey].v1Groups) {
        it = pickFrom(`grp:${gk}`, groupPool[gk]?.items ?? []);
        if (it) break;
      }
    }
    if (!it) {
      const bucket = (await prisma.dish.findUnique({ where: { id: b.id }, select: { category: true } }))?.category as Bucket;
      it = pickFrom(`bucket:${bucket}`, bucketPool[bucket]);
    }
    if (it) updates.push({ id: b.id, url: it.url });
  }
  console.log('thay thế:', updates.length);

  for (let i = 0; i < updates.length; i += 50) {
    const ch = updates.slice(i, i + 50);
    const values = ch.map((u) => `('${u.id}', '${u.url}')`).join(', ');
    await prisma.$executeRawUnsafe(`update dishes set image_url = v.url, updated_at = now() from (values ${values}) as v(id, url) where dishes.id::text = v.id`);
  }

  // probe lại toàn bộ phần vừa thay + tổng quét nhẹ
  const reimp = await prisma.dish.findMany({ where: { deletedAt: null }, select: { id: true, imageUrl: true } });
  const urls = reimp.map((d) => d.imageUrl!).filter(Boolean);
  let ok2 = 0;
  for (const u of urls.slice(0, 0) as string[]) { if (await probeSlow(u)) ok2++; } // no-op giữ TS vui
  ok2 = 0;
  for (const u of urls) { if (await probeSlow(u, 2)) ok2++; }
  console.log('probe toàn bộ sau sửa:', ok2, '/', urls.length);

  await prisma.$disconnect();
}

main();
