import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

type Item = { name: string; url: string };
type Bucket = 'main' | 'appetizer' | 'dessert' | 'drink';
type GroupEntry = { bucket: Bucket; key: string; query?: string; tokens?: string[] };

const GROUPS_RAW = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/group-pool.json'), 'utf8')) as Record<string, { query: string; items: Item[] }>;
const IMAGE_POOL = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/image-pool.json'), 'utf8')) as Record<Bucket, Item[]>;
const CREATED = JSON.parse(fs.readFileSync(path.resolve('scripts/seed1000/created-dishes.json'), 'utf8')) as { slugList: string[] };

// Thứ tự group dùng chung (bucket riêng, chỉ match group trong cùng bucket của món)
const GROUP_ORDER: { bucket: Bucket; key: string }[] = [
  { bucket: 'main', key: 'phở' }, { bucket: 'main', key: 'bún chả' }, { bucket: 'main', key: 'bún' },
  { bucket: 'main', key: 'cơm tấm' }, { bucket: 'main', key: 'cơm' }, { bucket: 'main', key: 'xôi' },
  { bucket: 'main', key: 'bánh mì' }, { bucket: 'main', key: 'lẩu' }, { bucket: 'main', key: 'canh chua' },
  { bucket: 'main', key: 'canh' }, { bucket: 'main', key: 'cháo' }, { bucket: 'main', key: 'hủ tiếu' },
  { bucket: 'main', key: 'mì quảng' }, { bucket: 'main', key: 'mì ý' }, { bucket: 'main', key: 'mì' },
  { bucket: 'main', key: 'pizza' }, { bucket: 'main', key: 'gà' }, { bucket: 'main', key: 'bò' },
  { bucket: 'main', key: 'sườn' }, { bucket: 'main', key: 'cá' }, { bucket: 'main', key: 'tôm' },
  { bucket: 'main', key: 'cua' }, { bucket: 'main', key: 'mực' }, { bucket: 'main', key: 'nghêu' },
  { bucket: 'main', key: 'ốc' }, { bucket: 'main', key: 'đậu hũ' }, { bucket: 'main', key: 'rau' },
  { bucket: 'appetizer', key: 'gỏi cuốn' }, { bucket: 'appetizer', key: 'chả giò' }, { bucket: 'appetizer', key: 'nem' },
  { bucket: 'appetizer', key: 'gỏi' }, { bucket: 'appetizer', key: 'nộm' }, { bucket: 'appetizer', key: 'há cảo' },
  { bucket: 'appetizer', key: 'súp' }, { bucket: 'appetizer', key: 'bánh bao' }, { bucket: 'appetizer', key: 'bánh tráng' },
  { bucket: 'appetizer', key: 'bánh' }, { bucket: 'appetizer', key: 'đậu hũ' }, { bucket: 'appetizer', key: 'chả' },
  { bucket: 'dessert', key: 'chè' }, { bucket: 'dessert', key: 'bánh flan' }, { bucket: 'dessert', key: 'bánh bông lan' },
  { bucket: 'dessert', key: 'bánh mousse' }, { bucket: 'dessert', key: 'pudding' }, { bucket: 'dessert', key: 'kem' },
  { bucket: 'dessert', key: 'yaourt' }, { bucket: 'dessert', key: 'trái cây' }, { bucket: 'dessert', key: 'bánh' },
  { bucket: 'drink', key: 'trà sữa' }, { bucket: 'drink', key: 'cà phê' }, { bucket: 'drink', key: 'espresso' },
  { bucket: 'drink', key: 'cappuccino' }, { bucket: 'drink', key: 'mocha' }, { bucket: 'drink', key: 'latte' },
  { bucket: 'drink', key: 'macchiato' }, { bucket: 'drink', key: 'cold brew' }, { bucket: 'drink', key: 'trà' },
  { bucket: 'drink', key: 'sinh tố' }, { bucket: 'drink', key: 'nước cam' }, { bucket: 'drink', key: 'nước dừa' },
  { bucket: 'drink', key: 'nước chanh' }, { bucket: 'drink', key: 'soda' }, { bucket: 'drink', key: 'nước' },
];

// Máy mocha espresso theo tên món: 'Cà phê mocha đá' — ưu tiên group cụ thể hơn 'cà phê'
// GROUP_ORDER đã sắp: trà sữa trước cà phê; rồi các cụm espresso/mocha... (cụ thể trước mặc định trà/sinh tố/soda).

async function main() {
  const dishes = await prisma.dish.findMany({
    where: { slug: { in: CREATED.slugList }, deletedAt: null },
    select: { id: true, name: true, category: true, imageUrl: true },
  });
  console.log('dishes to re-image:', dishes.length);

  // Backup URLs cũ để rollback
  fs.writeFileSync(
    path.resolve('scripts/seed1000/image-history.json'),
    JSON.stringify(dishes.map((d) => ({ id: d.id, name: d.name, oldUrl: d.imageUrl })), null, 1),
  );

  const cursor: Record<string, number> = {};
  const nextUrl = (k: string, fallback: Bucket): string => {
    const gk = GROUP_ORDER.find((g) => g.bucket === fallback && g.key === k);
    const groupItems = gk ? GROUPS_RAW[`${gk.bucket}:${gk.key}`]?.items ?? [] : [];
    const key = groupItems.length ? `${gk.bucket}:${gk.key}` : fallback;
    const arr = groupItems.length ? groupItems : (IMAGE_POOL[fallback] ?? IMAGE_POOL.main);
    cursor[key] = (cursor[key] ?? 0) % arr.length;
    return arr[cursor[key]++].url;
  };

  // Xác định group theo tên món (dùng GROUPS_RAW groups in same bucket, theo GROUP_ORDER)
  const updatePlan: { id: string; name: string; newUrl: string; group: string }[] = [];
  for (const d of dishes) {
    const name = d.name.toLowerCase();
    const bucket = d.category as Bucket;
    let matched = '';
    for (const g of GROUP_ORDER) {
      if (g.bucket !== bucket) continue;
      if (name.includes(g.key)) { matched = g.key; break; }
    }
    if (!matched) {
      // Fallback theo từ khóa hẹp thay cho category chung: main → nồi mì/buffet; appetizer → snack; dessert → bánh; drink → nước
      matched = bucket === 'main' ? 'mì' : bucket === 'appetizer' ? 'bánh' : bucket === 'dessert' ? 'bánh' : 'nước';
    }
    const gkKey = `${bucket}:${matched}`;
    const poolLength = GROUPS_RAW[gkKey]?.items.length ?? 0;
    const url = poolLength ? nextUrl(matched, bucket) : nextUrl(matched, bucket); // nextUrl fallback bucket when group empty
    updatePlan.push({ id: d.id, name: d.name, newUrl: url, group: gkKey });
  }

  const byGroup: Record<string, number> = {};
  for (const p of updatePlan) byGroup[p.group] = (byGroup[p.group] ?? 0) + 1;
  console.log('phân bố nhóm:', JSON.stringify(byGroup, null, 0));

  // Update theo chunk bằng SQL VALUES join cho nhanh
  const CHUNK = 100;
  for (let i = 0; i < updatePlan.length; i += CHUNK) {
    const ch = updatePlan.slice(i, i + CHUNK);
    const values = ch.map((p) => `('${p.id}', '${p.newUrl}')`).join(', ');
    await prisma.$executeRawUnsafe(`update dishes set image_url = v.url, updated_at = now() from (values ${values}) as v(id, url) where dishes.id::text = v.id`);
  }
  console.log('updated:', updatePlan.length, 'món');

  // Verify probe: chọn mẫu 60
  const sample = updatePlan.filter((_, i) => i % 16 === 0).slice(0, 60);
  let okImages = 0;
  for (const s of sample) {
    const row = await prisma.dish.findUnique({ where: { id: s.id }, select: { imageUrl: true } });
    const url = row?.imageUrl ?? s.newUrl;
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      if (res.ok && /^image\//.test(res.headers.get('content-type') ?? '')) okImages++;
      else console.log('BAD', s.group, url.slice(0, 90));
    } catch { console.log('ERR', s.group, url.slice(0, 90)); }
  }
  console.log('sample probe ok:', okImages, '/', sample.length);

  // Tình trạng toàn bộ imageUrl (kể cả 18 món cũ): HEAD 1000 ảnh? — sample nhẹ: 80 món random mọi dish
  const all = await prisma.dish.findMany({ select: { imageUrl: true }, where: { deletedAt: null } });
  const picks = all.filter((_, i) => i % 12 === 0);
  let allOk = 0; let bad = 0;
  for (const p of picks) {
    try {
      const res = await fetch(p.imageUrl!, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      if (res.ok && /^image\//.test(res.headers.get('content-type') ?? '')) allOk++;
      else bad++;
    } catch { bad++; }
  }
  console.log('whole-database sample:', allOk, 'ok /', bad, 'bad /', picks.length);

  await prisma.$disconnect();
}

main();
