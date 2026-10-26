import fs from 'node:fs';
import path from 'node:path';

type Item = { name: string; url: string };
type GroupKey = string; // "bucket:key"
const OUT = path.resolve('scripts/seed1000/group-pool.json');

// token = từ khóa dùng để chấm tính liên quan của tiêu đề ảnh (Commons)
export const GROUPS: { bucket: 'main' | 'appetizer' | 'dessert' | 'drink'; key: string; query: string; tokens: string[] }[] = [
  { bucket: 'main', key: 'phở', query: 'pho noodle soup bowl', tokens: ['pho', 'phở'] },
  { bucket: 'main', key: 'bún chả', query: 'bun cha hanoi', tokens: ['bun cha', 'bún chả'] },
  { bucket: 'main', key: 'bún', query: 'vietnamese rice vermicelli noodle', tokens: ['bun', 'bún', 'vermicelli'] },
  { bucket: 'main', key: 'cơm tấm', query: 'com tam broken rice', tokens: ['com tam', 'cơm tấm', 'broken rice'] },
  { bucket: 'main', key: 'cơm', query: 'vietnamese rice dish plate', tokens: ['com', 'cơm', 'rice plate'] },
  { bucket: 'main', key: 'xôi', query: 'sticky rice plate vietnamese', tokens: ['xoi', 'xôi', 'sticky rice'] },
  { bucket: 'main', key: 'bánh mì', query: 'banh mi sandwich', tokens: ['banh mi', 'bánh mì'] },
  { bucket: 'main', key: 'lẩu', query: 'vietnamese hot pot', tokens: ['lau', 'lẩu', 'hot pot'] },
  { bucket: 'main', key: 'canh chua', query: 'vietnamese sour soup', tokens: ['canh chua', 'sour soup'] },
  { bucket: 'main', key: 'canh', query: 'vietnamese soup bowl', tokens: ['canh', 'soup'] },
  { bucket: 'main', key: 'cháo', query: 'rice congee bowl', tokens: ['chao', 'cháo', 'congee', 'porridge'] },
  { bucket: 'main', key: 'hủ tiếu', query: 'hu tieu noodle bowl', tokens: ['hu tieu', 'hủ tiếu'] },
  { bucket: 'main', key: 'mì quảng', query: 'mi quang noodle', tokens: ['mi quang', 'mì quảng'] },
  { bucket: 'main', key: 'mì ý', query: 'spaghetti plate', tokens: ['spaghetti', 'pasta'] },
  { bucket: 'main', key: 'mì', query: 'noodle soup bowl', tokens: ['noodle', 'mì'] },
  { bucket: 'main', key: 'pizza', query: 'pizza slice plate', tokens: ['pizza'] },
  { bucket: 'main', key: 'gà', query: 'roasted chicken dish plate', tokens: ['chicken', 'gà'] },
  { bucket: 'main', key: 'bò', query: 'beef dish plate', tokens: ['beef', 'bò'] },
  { bucket: 'main', key: 'sườn', query: 'grilled pork ribs plate', tokens: ['ribs', 'sườn', 'pork'] },
  { bucket: 'main', key: 'cá', query: 'fried fish dish plate', tokens: ['fish', 'cá'] },
  { bucket: 'main', key: 'tôm', query: 'shrimp dish plate', tokens: ['shrimp', 'tôm', 'prawn'] },
  { bucket: 'main', key: 'cua', query: 'crab dish plate', tokens: ['crab', 'cua'] },
  { bucket: 'main', key: 'mực', query: 'fried squid plate', tokens: ['squid', 'mực', 'calamari'] },
  { bucket: 'main', key: 'nghêu', query: 'clams dish plate', tokens: ['clam', 'nghêu'] },
  { bucket: 'main', key: 'ốc', query: 'snails dish plate', tokens: ['snail', 'ốc'] },
  { bucket: 'main', key: 'đậu hũ', query: 'tofu dish plate', tokens: ['tofu', 'đậu hũ'] },
  { bucket: 'main', key: 'rau', query: 'sauteed vegetables plate', tokens: ['vegetable', 'rau', 'stir'] },
  // ===== appetizer =====
  { bucket: 'appetizer', key: 'gỏi cuốn', query: 'vietnamese spring rolls', tokens: ['gỏi cuốn', 'goi cuon', 'spring roll', 'gỏi'] },
  { bucket: 'appetizer', key: 'chả giò', query: 'fried spring rolls', tokens: ['chả giò', 'cha gio', 'spring roll'] },
  { bucket: 'appetizer', key: 'nem', query: 'vietnamese nem spring roll', tokens: ['nem', 'spring roll'] },
  { bucket: 'appetizer', key: 'gỏi', query: 'vietnamese salad', tokens: ['gỏi', 'goi', 'salad'] },
  { bucket: 'appetizer', key: 'nộm', query: 'vietnamese papaya salad', tokens: ['nộm', 'nom', 'salad'] },
  { bucket: 'appetizer', key: 'há cảo', query: 'dim sum dumplings', tokens: ['há cảo', 'dumpling', 'dim sum'] },
  { bucket: 'appetizer', key: 'súp', query: 'cream soup bowl', tokens: ['súp', 'soup'] },
  { bucket: 'appetizer', key: 'bánh bao', query: 'steamed bun banh bao', tokens: ['bánh bao', 'bun'] },
  { bucket: 'appetizer', key: 'bánh tráng', query: 'vietnamese rice paper snack', tokens: ['bánh tráng'] },
  { bucket: 'appetizer', key: 'bánh', query: 'vietnamese snack plate', tokens: ['bánh'] },
  { bucket: 'appetizer', key: 'đậu hũ', query: 'fried tofu plate', tokens: ['tofu'] },
  { bucket: 'appetizer', key: 'chả', query: 'vietnamese sausage plate', tokens: ['chả', 'sausage'] },
  // ===== dessert =====
  { bucket: 'dessert', key: 'chè', query: 'vietnamese che sweet soup', tokens: ['chè', 'che', 'sweet soup'] },
  { bucket: 'dessert', key: 'bánh flan', query: 'creme caramel dessert', tokens: ['flan', 'caramel', 'custard'] },
  { bucket: 'dessert', key: 'bánh bông lan', query: 'sponge cake slice', tokens: ['sponge cake', 'bông lan'] },
  { bucket: 'dessert', key: 'bánh mousse', query: 'mousse cake slice', tokens: ['mousse'] },
  { bucket: 'dessert', key: 'pudding', query: 'milk pudding dessert', tokens: ['pudding'] },
  { bucket: 'dessert', key: 'kem', query: 'ice cream dessert bowl', tokens: ['ice cream', 'kem'] },
  { bucket: 'dessert', key: 'yaourt', query: 'fruit yogurt bowl', tokens: ['yogurt', 'yaourt'] },
  { bucket: 'dessert', key: 'trái cây', query: 'fruit dessert plate', tokens: ['fruit', 'trái cây'] },
  { bucket: 'dessert', key: 'bánh', query: 'vietnamese dessert cake', tokens: ['cake', 'bánh'] },
  // ===== drink =====
  { bucket: 'drink', key: 'trà sữa', query: 'bubble milk tea cup', tokens: ['bubble', 'milk tea', 'boba'] },
  { bucket: 'drink', key: 'cà phê', query: 'vietnamese iced coffee glass', tokens: ['coffee', 'cà phê'] },
  { bucket: 'drink', key: 'espresso', query: 'espresso cup', tokens: ['espresso'] },
  { bucket: 'drink', key: 'cappuccino', query: 'cappuccino cup', tokens: ['cappuccino'] },
  { bucket: 'drink', key: 'mocha', query: 'mocha coffee cup', tokens: ['mocha'] },
  { bucket: 'drink', key: 'latte', query: 'latte coffee cup', tokens: ['latte'] },
  { bucket: 'drink', key: 'macchiato', query: 'macchiato cup', tokens: ['macchiato'] },
  { bucket: 'drink', key: 'cold brew', query: 'cold brew coffee', tokens: ['cold brew', 'coffee'] },
  { bucket: 'drink', key: 'trà', query: 'iced tea glass', tokens: ['tea', 'trà'] },
  { bucket: 'drink', key: 'sinh tố', query: 'fruit smoothie glass', tokens: ['smoothie', 'minh tố', 'shake'] },
  { bucket: 'drink', key: 'nước cam', query: 'fresh orange juice glass', tokens: ['orange juice', 'cam'] },
  { bucket: 'drink', key: 'nước dừa', query: 'coconut water glass', tokens: ['coconut'] },
  { bucket: 'drink', key: 'nước chanh', query: 'lemonade glass', tokens: ['lemonade', 'lemon juice'] },
  { bucket: 'drink', key: 'soda', query: 'soda drink glass', tokens: ['soda'] },
  { bucket: 'drink', key: 'nước', query: 'fresh fruit juice glass', tokens: ['juice'] },
];

const LIMIT = 30;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function getJsonRetry(url: string, attempts = 4): Promise<{ query?: { pages?: Record<string, { title: string; imageinfo?: { mime: string; thumburl?: string }[] }> } } | null> {
  let backoff = 1200;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'Mozilla/5.0 seed1000/1.0' } });
      if (res.ok) return (await res.json()) as { query?: { pages?: Record<string, { title: string; imageinfo?: { mime: string; thumburl?: string }[] }> } } | null;
      console.log(`   HTTP ${res.status} (attempt ${i + 1}) — chờ ${backoff}ms`);
    } catch { console.log(`   network err (attempt ${i + 1}) — chờ ${backoff}ms`); }
    await sleep(backoff);
    backoff *= 2;
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

async function poolmap<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 5): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

function relevant(title: string, tokens: string[]): boolean {
  const t = title.toLowerCase();
  return tokens.some((k) => t.includes(k.toLowerCase()));
}

async function main() {
  const pool: Record<GroupKey, { query: string; items: Item[] }> = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, 'utf8')) as Record<GroupKey, { query: string; items: Item[] }>
    : {};
  const dedupe = new Set<string>(Object.values(pool).flatMap((v) => v.items.map((x) => x.url)));

  for (const g of GROUPS) {
    const gk = `${g.bucket}:${g.key}`;
    if (pool[gk]?.items?.length) { console.log(`${gk.padEnd(22)} — giữ ${pool[gk].items.length} ảnh cũ`); continue; }
    const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(g.query)}&gsrnamespace=6&gsrlimit=${LIMIT}&prop=imageinfo&iiprop=url|mime&iiurlwidth=800&format=json`;
    const data = await getJsonRetry(api);
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    let junk = 0;
    const relevantCands = pages
      .map((p) => ({ name: p.title.replace(/^File:/, ''), info: p.imageinfo?.[0] }))
      .filter((x): x is { name: string; info: { mime: string; thumburl?: string } } => Boolean(x?.info))
      .filter((x) => x.info.mime === 'image/jpeg' && x.info.thumburl)
      .map((x) => ({ name: x.name, url: x.info.thumburl! }));
    if (relevantCands.length < pages.length) junk = pages.length - relevantCands.length;
    const relFiltered = relevantCands.filter((c) => relevant(c.name, g.tokens));
    if (relFiltered.length === 0 && relevantCands.length > 0) { console.log(`   ${gk}: 0 liên quan (junk/jpeg=${junk}) — dùng toàn bộ ${relevantCands.length}`); }
    const cands = relFiltered.length > 0 ? relFiltered : relevantCands;
    const ok = await poolmap(cands, (c) => probe(c.url).then((alive) => ({ ...c, alive })));
    const items: Item[] = [];
    for (const c of ok) {
      if (!c.alive || dedupe.has(c.url)) continue;
      dedupe.add(c.url);
      items.push({ name: c.name, url: c.url });
    }
    pool[gk] = { query: g.query, items };
    console.log(`${gk.padEnd(22)} → ${items.length} ảnh`);
    fs.writeFileSync(OUT, JSON.stringify(pool, null, 1));
    await sleep(650);
  }

  const total = Object.values(pool).reduce((s, v) => s + v.items.length, 0);
  console.log('TOTAL pool ảnh theo nhóm:', total, '| Nhóm:', Object.keys(pool).length);
}

main();
