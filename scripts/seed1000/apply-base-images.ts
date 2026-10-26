import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

type Item = { name: string; url: string };
type Bucket = 'main' | 'appetizer' | 'dessert' | 'drink';
const basePool = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/family-pool.json'), 'utf8')) as Record<string, { bucket: Bucket | 'any'; v1Groups: string[]; items: Item[] }>;
const groupPool = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/group-pool.json'), 'utf8')) as Record<string, { items: Item[] }>;
const bucketPool = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/image-pool.json'), 'utf8')) as Record<Bucket, Item[]>;

// danh sách family prefixes sắp theo độ dài giảm dần để longest-match
const PREFIXES = Object.keys(basePool).sort((a, b) => b.length - a.length);

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
    return res.ok && /^image\//.test(res.headers.get('content-type') ?? '');
  } catch { return false; }
}

async function probeAll(urls: string[]): Promise<number> {
  let ok = 0;
  let i = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (i < urls.length) {
      const u = urls[i++];
      if (await probe(u)) ok++;
    }
  }));
  return ok;
}

async function main() {
  const dishes = await prisma.dish.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, category: true, imageUrl: true },
    orderBy: { id: 'asc' },
  });
  console.log('tổng món:', dishes.length);

  // Backup URL hiện tại (v2) để rollback từng bước
  fs.writeFileSync(
    path.resolve('scripts/seed1000/image-history-v2.json'),
    JSON.stringify(dishes.map((d) => ({ id: d.id, name: d.name, oldUrl: d.imageUrl })), null, 1),
  );

  const cursor: Record<string, number> = {};
  const nextFrom = (key: string, arr: Item[]): Item | null => {
    if (!arr.length) return null;
    cursor[key] = (cursor[key] ?? 0) % arr.length;
    return arr[cursor[key]++];
  };

  const plan: { id: string; name: string; newUrl: string; source: string }[] = [];
  const srcCount: Record<string, number> = {};
  for (const d of dishes) {
    const name = d.name.toLowerCase().trim();
    let familyKey = PREFIXES.find((p) => name.startsWith(p.toLowerCase()));
    if (!familyKey) familyKey = PREFIXES.find((p) => name.includes(p.toLowerCase()));
    let url: string | null = null;
    let source = '';
    if (familyKey && basePool[familyKey].items.length) {
      const it = nextFrom(`fam:${familyKey}`, basePool[familyKey].items);
      if (it) { url = it.url; source = `family:${familyKey}`; }
    }
    if (!url && familyKey) {
      // family pool rỗng — theo thứ tự v1Groups của family, hợp lệ nhất group có ảnh
      const fam = basePool[familyKey];
      for (const gk of fam.v1Groups) {
        const it = nextFrom(`grp:${gk}`, groupPool[gk]?.items ?? []);
        if (it) { url = it.url; source = `v1group:${gk}`; break; }
      }
    }
    if (!url) {
      // khớp v1 group theo token trong tên همچ (groop) — scan group ORDER rút từ GROUP_ORDER tên 'bucket:key' chứa keyword tên món
      const bucket = d.category as Bucket;
      const gkHit = Object.keys(groupPool)
        .filter((gk) => gk.startsWith(bucket + ':') && name.includes(gk.split(':')[1]))
        .find((gk) => groupPool[gk].items.length);
      if (gkHit) {
        const it = nextFrom(`grp:${gkHit}`, groupPool[gkHit].items);
        if (it) { url = it.url; source = `group-match:${gkHit}`; }
      }
    }
    if (!url) {
      const it = nextFrom(`bucket:${d.category}`, bucketPool[d.category as Bucket]);
      if (it) { url = it.url; source = `bucket:${d.category}`; }
    }
    if (url && url !== d.imageUrl) plan.push({ id: d.id, name: d.name, newUrl: url, source });
    srcCount[source || 'invalid'] = (srcCount[source || 'invalid'] ?? 0) + 1;
  }

  console.log('cần cập nhật:', plan.length, '| nguồn:', JSON.stringify(srcCount, null, 0));

  const CHUNK = 100;
  for (let i = 0; i < plan.length; i += CHUNK) {
    const ch = plan.slice(i, i + CHUNK);
    const values = ch.map((p) => `('${p.id}', '${p.newUrl.replace(/'/g, "''")}')`).join(', ');
    await prisma.$executeRawUnsafe(`update dishes set image_url = v.url, updated_at = now() from (values ${values}) as v(id, url) where dishes.id::text = v.id`);
  }
  console.log('updated!', plan.length);

  // probe ĐẦY ĐỦ 1000
  const all = await prisma.dish.findMany({ where: { deletedAt: null }, select: { imageUrl: true } });
  const urls = all.map((d) => d.imageUrl!).filter(Boolean);
  const okCount = await probeAll(urls);
  console.log('probe toàn bộ:', okCount, '/', urls.length);

  // sinh preview.html để lướt kiểm
  const rows = await prisma.dish.findMany({ where: { deletedAt: null }, select: { name: true, slug: true, imageUrl: true }, orderBy: { name: 'asc' } });
  const dom = rows.map((d) =>
    `<div class="card"><img src="${d.imageUrl}" loading="lazy" referrerpolicy="no-referrer"/><div><b>${d.name}</b><br/><small>${d.slug}</small></div></div>`,
  ).join('\n');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>Preview ảnh món ăn (1000)</title><style>body{font-family:system-ui;max-width:1400px;margin:20px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.card{border:1px solid #ddd;border-radius:8px;padding:6px;overflow:hidden}.card img{width:100%;height:140px;object-fit:cover;border-radius:6px}.card div{font-size:13px;margin-top:4px}</style></head><body><h1>Ảnh món ăn — kiểm tra khớp tên</h1><div class="grid">${dom}</div></body></html>`;
  fs.writeFileSync(path.resolve('scripts/seed1000/preview.html'), html);
  console.log('preview: scripts/seed1000/preview.html', rows.length, 'món');

  await prisma.$disconnect();
}

main();
