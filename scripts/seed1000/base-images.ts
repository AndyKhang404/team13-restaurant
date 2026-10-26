import fs from 'node:fs';
import path from 'node:path';

type Item = { name: string; url: string };
type Bucket = 'main' | 'appetizer' | 'dessert' | 'drink';
const OUT = path.resolve('scripts/seed1000/family-pool.json');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Family = từ khóa prefix đầu tên món → Commons Category (thử lần lượt candidates)
// fallback = group pool v1 (từ group-pool.json) dùng khi category không có ảnh
export const FAMILIES: { prefix: string; bucket: Bucket | 'any'; cats: string[]; v1Groups: string[] }[] = [
  // ===== main =====
  { prefix: 'Phở', bucket: 'main', cats: ['Pho'], v1Groups: ['main:phở'] },
  { prefix: 'Bún bò', bucket: 'main', cats: ['Bún bò Huế', 'Bun bo Hue'], v1Groups: ['main:bún'] },
  { prefix: 'Bún chả', bucket: 'main', cats: ['Bún chả', 'Bun cha'], v1Groups: ['main:bún chả'] },
  { prefix: 'Miến', bucket: 'main', cats: ['Cellophane noodles', 'Glass noodles'], v1Groups: ['main:mì'] },
  { prefix: 'Bún', bucket: 'main', cats: ['Bún'], v1Groups: ['main:bún'] },
  { prefix: 'Cơm tấm', bucket: 'main', cats: ['Cơm tấm', 'Com tam'], v1Groups: ['main:cơm tấm'] },
  { prefix: 'Cơm', bucket: 'main', cats: ['Vietnamese rice dishes'], v1Groups: ['main:cơm'] },
  { prefix: 'Xôi', bucket: 'main', cats: ['Xôi', 'Xoi (food)'], v1Groups: ['main:xôi', 'main:cơm'] },
  { prefix: 'Bánh canh', bucket: 'main', cats: ['Bánh canh'], v1Groups: ['main:mì'] },
  { prefix: 'Bánh mì', bucket: 'any', cats: ['Bánh mì', 'Banh mi'], v1Groups: ['main:bánh mì'] },
  { prefix: 'Hủ tiếu', bucket: 'main', cats: ['Hủ tiếu', 'Hu tieu'], v1Groups: ['main:hủ tiếu'] },
  { prefix: 'Mì Quảng', bucket: 'main', cats: ['Mì Quảng', 'Mi Quang'], v1Groups: ['main:mì quảng'] },
  { prefix: 'Mì Ý', bucket: 'main', cats: ['Spaghetti alla bolognese', 'Spaghetti', 'Pasta dishes'], v1Groups: ['main:mì ý'] },
  { prefix: 'Mì', bucket: 'main', cats: ['Noodle soups'], v1Groups: ['main:mì'] },
  { prefix: 'Pizza', bucket: 'main', cats: ['Pizza'], v1Groups: ['main:pizza'] },
  { prefix: 'Lẩu', bucket: 'main', cats: ['Hot pot'], v1Groups: ['main:lẩu'] },
  { prefix: 'Canh chua', bucket: 'main', cats: ['Canh chua'], v1Groups: ['main:canh chua'] },
  { prefix: 'Canh', bucket: 'main', cats: ['Vietnamese soups'], v1Groups: ['main:canh'] },
  { prefix: 'Cháo', bucket: 'main', cats: ['Congee'], v1Groups: ['main:cháo'] },
  { prefix: 'Gà', bucket: 'main', cats: ['Roast chicken', 'Chicken dishes'], v1Groups: ['main:gà'] },
  { prefix: 'Bò', bucket: 'main', cats: ['Beef dishes'], v1Groups: ['main:bò'] },
  { prefix: 'Sườn', bucket: 'main', cats: ['Pork ribs', 'Ribs (food)'], v1Groups: ['main:sườn'] },
  { prefix: 'Cá', bucket: 'main', cats: ['Fish dishes'], v1Groups: ['main:cá'] },
  { prefix: 'Tôm', bucket: 'main', cats: ['Shrimp dishes', 'Prawn dishes'], v1Groups: ['main:tôm'] },
  { prefix: 'Cua', bucket: 'main', cats: ['Crab dishes'], v1Groups: ['main:cua'] },
  { prefix: 'Mực', bucket: 'main', cats: ['Calamari'], v1Groups: ['main:mực'] },
  { prefix: 'Nghêu', bucket: 'main', cats: ['Clam dishes'], v1Groups: ['main:nghêu'] },
  { prefix: 'Ốc', bucket: 'main', cats: ['Snails as food', 'Escargots'], v1Groups: ['main:ốc'] },
  { prefix: 'Đậu hũ', bucket: 'any', cats: ['Tofu'], v1Groups: ['main:đậu hũ'] },
  { prefix: 'Rau', bucket: 'main', cats: ['Stir-fried vegetables'], v1Groups: ['main:rau'] },
  // ===== appetizer =====
  { prefix: 'Gỏi cuốn', bucket: 'appetizer', cats: ['Gỏi cuốn', 'Summer rolls'], v1Groups: ['appetizer:gỏi cuốn'] },
  { prefix: 'Chả giò', bucket: 'appetizer', cats: ['Chả giò', 'Spring rolls'], v1Groups: ['appetizer:chả giò'] },
  { prefix: 'Nem', bucket: 'appetizer', cats: ['Nem rán', 'Spring rolls'], v1Groups: ['appetizer:nem'] },
  { prefix: 'Gỏi', bucket: 'appetizer', cats: ['Vietnamese salads'], v1Groups: ['appetizer:gỏi'] },
  { prefix: 'Nộm', bucket: 'appetizer', cats: ['Vietnamese salads'], v1Groups: ['appetizer:nộm'] },
  { prefix: 'Há cảo', bucket: 'appetizer', cats: ['Har gow', 'Shrimp dumplings'], v1Groups: ['appetizer:há cảo'] },
  { prefix: 'Súp', bucket: 'appetizer', cats: ['Soups'], v1Groups: ['appetizer:súp'] },
  { prefix: 'Bánh bao', bucket: 'appetizer', cats: ['Bánh bao'], v1Groups: ['appetizer:bánh bao'] },
  { prefix: 'Bánh tráng', bucket: 'appetizer', cats: ['Bánh tráng', 'Rice paper'], v1Groups: ['appetizer:bánh tráng'] },
  { prefix: 'Bánh tôm', bucket: 'appetizer', cats: ['Bánh tôm'], v1Groups: ['appetizer:bánh'] },
  { prefix: 'Bánh', bucket: 'appetizer', cats: ['Vietnamese cakes'], v1Groups: ['appetizer:bánh'] },
  { prefix: 'Chả', bucket: 'appetizer', cats: ['Chả lụa', 'Vietnamese sausage'], v1Groups: ['appetizer:chả'] },
  // ===== dessert =====
  { prefix: 'Chè', bucket: 'dessert', cats: ['Chè'], v1Groups: ['dessert:chè'] },
  { prefix: 'Bánh flan', bucket: 'dessert', cats: ['Crème caramel'], v1Groups: ['dessert:bánh flan'] },
  { prefix: 'Bánh bông lan', bucket: 'dessert', cats: ['Sponge cakes'], v1Groups: ['dessert:bánh bông lan'] },
  { prefix: 'Bánh mousse', bucket: 'dessert', cats: ['Chocolate mousse', 'Mousse'], v1Groups: ['dessert:bánh mousse'] },
  { prefix: 'Bánh quy', bucket: 'dessert', cats: ['Butter cookies', 'Cookies'], v1Groups: ['dessert:bánh'] },
  { prefix: 'Bánh dừa', bucket: 'dessert', cats: ['Coconut cakes'], v1Groups: ['dessert:bánh'] },
  { prefix: 'Bánh kem', bucket: 'dessert', cats: ['Cheesecakes'], v1Groups: ['dessert:bánh'] },
  { prefix: 'Bánh dày', bucket: 'dessert', cats: ['Bánh dày'], v1Groups: ['dessert:bánh'] },
  { prefix: 'Bánh tiêu', bucket: 'dessert', cats: ['Bánh tiêu'], v1Groups: ['dessert:bánh'] },
  { prefix: 'Bánh da lợn', bucket: 'dessert', cats: ['Bánh da lợn'], v1Groups: ['dessert:bánh'] },
  { prefix: 'Bánh', bucket: 'dessert', cats: ['Vietnamese cakes'], v1Groups: ['dessert:bánh'] },
  { prefix: 'Pudding', bucket: 'dessert', cats: ['Puddings'], v1Groups: ['dessert:pudding'] },
  { prefix: 'Kem', bucket: 'dessert', cats: ['Ice cream'], v1Groups: ['dessert:kem'] },
  { prefix: 'Yaourt', bucket: 'dessert', cats: ['Yogurt'], v1Groups: ['dessert:yaourt'] },
  { prefix: 'Trái cây', bucket: 'dessert', cats: ['Fruit salads'], v1Groups: ['dessert:trái cây'] },
  // ===== drink =====
  { prefix: 'Trà sữa', bucket: 'drink', cats: ['Bubble tea'], v1Groups: ['drink:trà sữa'] },
  { prefix: 'Bạc xỉu', bucket: 'drink', cats: ['Vietnamese coffee'], v1Groups: ['drink:cà phê'] },
  { prefix: 'Cà phê', bucket: 'drink', cats: ['Vietnamese coffee', 'Ca phe sua da'], v1Groups: ['drink:cà phê'] },
  { prefix: 'Espresso', bucket: 'drink', cats: ['Espresso'], v1Groups: ['drink:espresso'] },
  { prefix: 'Cappuccino', bucket: 'drink', cats: ['Cappuccino'], v1Groups: ['drink:cappuccino'] },
  { prefix: 'Mocha', bucket: 'drink', cats: ['Caffè mocha'], v1Groups: ['drink:mocha'] },
  { prefix: 'Latte', bucket: 'drink', cats: ['Latte art', 'Caffè latte'], v1Groups: ['drink:latte'] },
  { prefix: 'Macchiato', bucket: 'drink', cats: ['Caffè macchiato'], v1Groups: ['drink:macchiato'] },
  { prefix: 'Cold brew', bucket: 'drink', cats: ['Cold brew coffee'], v1Groups: ['drink:cold brew'] },
  { prefix: 'Trà', bucket: 'drink', cats: ['Iced tea'], v1Groups: ['drink:trà'] },
  { prefix: 'Sinh tố', bucket: 'drink', cats: ['Smoothies'], v1Groups: ['drink:sinh tố'] },
  { prefix: 'Nước cam', bucket: 'drink', cats: ['Orange juice'], v1Groups: ['drink:nước cam'] },
  { prefix: 'Nước dừa', bucket: 'drink', cats: ['Coconut water'], v1Groups: ['drink:nước dừa'] },
  { prefix: 'Nước chanh', bucket: 'drink', cats: ['Lemonade'], v1Groups: ['drink:nước chanh'] },
  { prefix: 'Soda', bucket: 'drink', cats: ['Sparkling water'], v1Groups: ['drink:soda'] },
  { prefix: 'Nước ép', bucket: 'drink', cats: ['Juices'], v1Groups: ['drink:nước'] },
  { prefix: 'Nước', bucket: 'drink', cats: ['Juices'], v1Groups: ['drink:nước'] },
];

async function apiJson(url: string, attempts = 3): Promise< Record<string, unknown> | null> {
  let backoff = 1000;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'Mozilla/5.0 seed1000/2.0' } });
      if (res.ok) return (await res.json()) as Record<string, unknown>;
      console.log(`   HTTP ${res.status} (lần ${i + 1})`);
    } catch { console.log(`   net err (lần ${i + 1})`); }
    await sleep(backoff); backoff *= 2;
  }
  return null;
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    const ct = res.headers.get('content-type') ?? '';
    const len = Number(res.headers.get('content-length') ?? '0');
    return res.ok && /^image\//.test(ct) && len > 5000 && len < 600_000;
  } catch { return false; }
}

async function fetchCategoryMembers(cat: string): Promise<Item[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + cat)}&gcmtype=file&gcmlimit=50&prop=imageinfo&iiprop=url|mime&iiurlwidth=800&format=json`;
  const data = await apiJson(url);
  type Page = { title: string; imageinfo?: { mime: string; thumburl?: string }[] };
  const pages = Object.values((data?.query as { pages?: Record<string, Page> } | undefined)?.pages ?? {});
  return pages
    .map((p) => ({ name: p.title.replace(/^File:/, ''), info: p.imageinfo?.[0] }))
    .filter((x): x is { name: string; info: { mime: string; thumburl: string } } => Boolean(x?.info && x.info.mime === 'image/jpeg' && x.info.thumburl))
    .map((x) => ({ name: x.name, url: x.info.thumburl }));
}

async function main() {
  const global = new Set<string>();
  const result: Record<string, { bucket: Bucket | 'any'; cats: string[]; v1Groups: string[]; items: Item[] }> = {};
  for (const fam of FAMILIES) {
    const key = fam.prefix;
    if (result[key]) continue;
    const agg: Item[] = [];
    for (const cat of fam.cats) {
      const items = await fetchCategoryMembers(cat);
      for (const it of items) {
        if (global.has(it.url) || agg.some((a) => a.url === it.url)) continue;
        agg.push(it);
        global.add(it.url);
      }
      console.log(`${key.padEnd(14)} [${cat}] → ${items.length}`);
      if (agg.length >= 12) break;
      await sleep(500);
    }
    const probed: Item[] = [];
    for (const it of agg.slice(0, 15)) {
      if (await probe(it.url)) probed.push(it);
    }
    result[key] = { bucket: fam.bucket, cats: fam.cats, v1Groups: fam.v1Groups, items: probed };
    fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  }
  const noImage = Object.entries(result).filter(([, v]) => v.items.length === 0).map(([k]) => k);
  console.log('\nTOTAL ảnh:', Object.values(result).reduce((s, v) => s + v.items.length, 0), '| families đầy:', Object.keys(result).length, '| family hỏng:', JSON.stringify(noImage));
}

main();
