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

// từ khóa "đúng chủ đề" theo family: tiêu đề ảnh phải chứa 1 trong những từ này
const TOPIC: Record<string, string[]> = {
  'Phở': ['pho', 'phở'], 'Bún bò': ['bún bò', 'bun bo'], 'Bún chả': ['bún chả', 'bun cha'],
  'Miến': ['miến', 'mien', 'cellophane', 'glass noodle', 'vermicelli'],
  'Bún': ['bún', 'bun', 'noodle'], 'Cơm tấm': ['cơm tấm', 'com tam', 'broken rice'],
  'Cơm': ['cơm', 'com', 'rice'], 'Xôi': ['xôi', 'xoi', 'sticky rice'],
  'Bánh canh': ['bánh canh'], 'Bánh mì': ['bánh mì', 'banh mi'], 'Hủ tiếu': ['hủ tiếu', 'hu tieu'],
  'Mì Quảng': ['mì quảng', 'mi quang'], 'Mì Ý': ['spaghetti', 'pasta'], 'Mì': ['noodle', 'mì', 'ramen', 'udon', 'men'],
  'Pizza': ['pizza'], 'Lẩu': ['hot pot', 'hotpot', 'lẩu', 'lau'], 'Canh chua': ['canh chua', 'sour soup'],
  'Canh': ['soup', 'canh'], 'Cháo': ['congee', 'porridge'], 'Gà': ['chicken', 'gà', 'poultry'],
  'Bò': ['beef', 'bò', 'steak'], 'Sườn': ['ribs', 'sườn', 'pork'], 'Cá': ['fish', 'cá', 'salmon', 'trout'],
  'Tôm': ['shrimp', 'tôm', 'prawn', 'praw'], 'Cua': ['crab', 'cua'], 'Mực': ['squid', 'mực', 'calamari'],
  'Nghêu': ['clam', 'nghêu', 'mussel', 'shellfish'], 'Ốc': ['snail', 'ốc', 'escargot', 'mitre', 'dutail'],
  'Đậu hũ': ['tofu', 'đậu hũ', 'bean curd'], 'Rau': ['vegetable', 'rau', 'stir'],
  'Gỏi cuốn': ['gỏi cuốn', 'spring roll', 'summer roll', 'goi cuon'], 'Chả giò': ['chả giò', 'spring roll'],
  'Nem': ['nem', 'spring roll'], 'Gỏi': ['gỏi', 'salad', 'goi'], 'Nộm': ['salad', 'nộm', 'papaya'],
  'Há cảo': ['dumpling', 'dim sum', 'har gow'], 'Súp': ['soup', 'súp', 'bisque'],
  'Bánh bao': ['bánh bao', 'bun', 'bao'], 'Bánh tráng': ['bánh tráng', 'rice paper'],
  'Bánh tôm': ['bánh tôm'], 'Bánh': ['bánh', 'cake', 'cracker'], 'Chả': ['chả', 'sausage', 'lụa'],
  'Chè': ['chè', 'sweet soup'], 'Bánh flan': ['flan', 'caramel', 'custard'],
  'Bánh bông lan': ['sponge cake', 'bông lan'], 'Bánh mousse': ['mousse'],
  'Bánh quy': ['cookie', 'biscuit'], 'Bánh dừa': ['coconut cake', 'coconut'],
  'Bánh kem': ['cheesecake', 'cake'], 'Bánh dày': ['bánh dày'], 'Bánh tiêu': ['bánh tiêu', 'donut'],
  'Bánh da lợn': ['bánh da lợn'], 'Pudding': ['pudding'], 'Kem': ['ice cream', 'gelato', 'sorbet', 'sherbet'],
  'Yaourt': ['yogurt', 'yoghurt'], 'Trái cây': ['fruit', 'trái'],
  'Trà sữa': ['bubble tea', 'boba', 'milk tea'], 'Bạc xỉu': ['xỉu', 'xiu', 'coffee', 'cà phê', 'ca phe'],
  'Cà phê': ['coffee', 'cà phê', 'ca phe'], 'Espresso': ['espresso'], 'Cappuccino': ['cappuccino'],
  'Mocha': ['mocha', 'coffee'], 'Latte': ['latte'], 'Macchiato': ['macchiato'], 'Cold brew': ['cold brew', 'iced coffee'],
  'Trà': ['tea', 'trà'], 'Sinh tố': ['smoothie', 'shake'], 'Nước cam': ['orange juice', 'cam', 'juice'],
  'Nước dừa': ['coconut water', 'coconut'], 'Nước chanh': ['lemonade', 'lemon', 'limeade'],
  'Soda': ['soda', 'sparkling', 'soft drink'], 'Nước ép': ['juice'], 'Nước': ['juice', 'water'],
};

// rác tuyệt đối: tiêu đề khớp → nhất thiết thay
const JUNK_RE = /(lccn|storefront|library|journal|book|portrait|grave|cemetery|monument|statue|street|building|architecture|map|flag|logo|concert|conference|university|school|hospital|passport|postage|stamp|vehicle|car |truck|aircraft|train |metro|manuscript|diagram|document|letter |sign\b|ad\.|advert|employee|waitress|waiter|kitchen interior|pantry|market|stall|signage|celebration|wrestler|painting|drawing|etching|grafting|propaganda|badge|medal|dairy|cream factory|preserving)/i;

function decodeTitle(url: string): string {
  try {
    const u = new URL(url);
    const _utm = u.search;
    const pathPart = decodeURIComponent(u.pathname);
    const m = /thumb\/[^/]+\/[^/]+\/(.+)$/.exec(pathPart) || /commons\/([^/]+\/[^/]+\/.+)\/?$/.exec(pathPart);
    let t = m ? m[1] : pathPart.split('/').pop() ?? '';
    t = t.replace(/\/960px-.*$/i, '').replace(/^[0-9]+px-/, '').replace(/\.(jpg|jpeg|jpe?g|png)$/i, '');
    return t.replaceAll('_', ' ').replace(/\+/g, ' ');
  } catch { return ''; }
}

function familyOf(name: string): string {
  const n = name.toLowerCase();
  return PREFIXES.find((p) => n.startsWith(p.toLowerCase())) ?? PREFIXES.find((p) => n.includes(p.toLowerCase())) ?? '';
}

function tokensOf(family: string, dishName: string): string[] {
  const base = TOPIC[family] ?? [family.toLowerCase()];
  const extra = family.split(/\s+/).map((w) => w.toLowerCase());
  return [...new Set([...base, ...extra])].filter(Boolean);
}

function titleOk(title: string, tokens: string[]): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (JUNK_RE.test(t)) return false;
  return tokens.some((w) => t.includes(w));
}

async function main() {
  const dishes = await prisma.dish.findMany({ where: { deletedAt: null }, select: { id: true, name: true, category: true, imageUrl: true }, orderBy: { name: 'asc' } });
  console.log('tổng món:', dishes.length);

  const used = new Set(dishes.map((d) => d.imageUrl));
  let iteration = 0;
  let replacedTotal = 0;
  let suspicious = 0;

  while (iteration < 3) {
    iteration++;
    const unmapped: { id: string; name: string }[] = [];
    const replacements: { id: string; url: string }[] = [];
    suspicious = 0;
    let okCount = 0;

    for (const d of dishes) {
      const fam = familyOf(d.name);
      const tokens = fam ? tokensOf(fam, d.name) : [];
      const title = decodeTitle(d.imageUrl ?? '');
      if (!title || JUNK_RE.test(title) || (fam && !titleOk(title, tokens))) {
        suspicious++;
        // tìm ảnh thay thế: chỉ nhận ảnh tiêu đề "đúng chủ đề"
        let it: Item | null = null;
        if (fam && basePool[fam]) {
          const cand = basePool[fam].items.filter((x) => titleOk(decodeTitle(x.url), tokens) && !used.has(x.url));
          if (cand.length) { it = cand[Math.floor(Math.random() * cand.length)]; }
        }
        if (!it && fam && basePool[fam]) {
          for (const gk of basePool[fam].v1Groups) {
            const cand = (groupPool[gk]?.items ?? []).filter((x) => titleOk(x.name, tokens) && !used.has(x.url));
            if (cand.length) { it = cand[Math.floor(Math.random() * cand.length)]; break; }
          }
        }
        if (it) { used.add(it.url); replacements.push({ id: d.id, url: it.url }); }
        else unmapped.push({ id: d.id, name: d.name });
      } else okCount++;
    }

    if (replacements.length) {
      console.log(`[vòng ${iteration}] nghi ngờ: ${suspicious} — thay được: ${replacements.length}, (${unmapped.length} chưa tìm được ảnh tốt)`);
      const CHUNK = 50;
      for (let i = 0; i < replacements.length; i += CHUNK) {
        const ch = replacements.slice(i, i + CHUNK);
        const values = ch.map((u) => `('${u.id}', '${u.url}')`).join(', ');
        await prisma.$executeRawUnsafe(`update dishes set image_url = v.url, updated_at = now() from (values ${values}) as v(id, url) where dishes.id::text = v.id`);
        // refresh local dishes imageUrl để vòng sau tính đúng
        for (const r of ch) { const d = dishes.find((x) => x.id === r.id); if (d) d.imageUrl = r.url; }
      }
      replacedTotal += replacements.length;
    } else {
      console.log(`[vòng ${iteration}] không còn thay thế — dừng`);
      break;
    }
  }

  // thống kê cuối + dùng preview mới
  const final = await prisma.dish.findMany({ where: { deletedAt: null }, select: { name: true, slug: true, imageUrl: true }, orderBy: { name: 'asc' } });
  let okFinal = 0;
  const warn: { name: string; title: string; fam: string }[] = [];
  for (const d of final) {
    const fam = familyOf(d.name);
    const tokens = fam ? tokensOf(fam, d.name) : [];
    const title = decodeTitle(d.imageUrl ?? '');
    if (title && !JUNK_RE.test(title) && (!fam || titleOk(title, tokens))) okFinal++;
    else warn.push({ name: d.name, title: title.slice(0, 70), fam: fam || '' });
  }
  console.log('KẾT QUẢ: đúng tiêu đề-chủ đề:', okFinal, '/', final.length, '| còn nghi ngờ:', warn.length, '| tổng đã thay:', replacedTotal);
  fs.writeFileSync(path.resolve('scripts/seed1000/warn-images.json'), JSON.stringify(warn, null, 1));
  const dom = final.map((d) => `<div class="card"><img src="${d.imageUrl}" loading="lazy" referrerpolicy="no-referrer"/><div><b>${d.name}</b><br/><small>${d.slug}</small></div></div>`).join('\n');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>Preview ảnh món ăn</title><style>body{font-family:system-ui;max-width:1400px;margin:20px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.card{border:1px solid #ddd;border-radius:8px;padding:6px}.card img{width:100%;height:140px;object-fit:cover;border-radius:6px}.card div{font-size:13px;margin-top:4px}</style></head><body><h1>Ảnh món ăn — sau check kỹ</h1><div class="grid">${dom}</div></body></html>`;
  fs.writeFileSync(path.resolve('scripts/seed1000/preview.html'), html);
  console.log('preview.html updated');

  await prisma.$disconnect();
}

main();
