import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';

type Bucket = 'main' | 'appetizer' | 'dessert' | 'drink';
type PoolItem = { name: string; url: string; source: string };
const pool: Record<Bucket, PoolItem[]> = JSON.parse(
  fs.readFileSync(path.resolve('scripts/seed1000/image-pool.json'), 'utf8'),
);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

// Deterministic RNG (reproducible seeding)
let seed = 20260226;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const roundP = (x: number) => Math.round(x / 1000) * 1000;

const slugify = (s: string) => {
  const a = 'àáảãạăằắẳẵặâầấẩẫậđeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ';
  const b = 'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiiiooooooooooooooouuuuuuuuuuyyyyyyyy';
  let out = s.toLowerCase();
  for (let i = 0; i < a.length; i++) out = out.replaceAll(a[i], b[i]);
  return out.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
};

// ===== Tên món: tiếng Việt 100% =====
const BASE: Record<Bucket, string[]> = {
  main: [
    'Phở bò', 'Phở gà', 'Phở cá lóc', 'Phở sốt vang', 'Bún bò Huế', 'Bún chả Hà Nội', 'Bún thịt nướng', 'Bún mắm',
    'Bún mọc', 'Bún xào giòn', 'Cơm gà Hội An', 'Cơm cháy chà bông', 'Cơm cá kho tộ', 'Cơm vò tiêu',
    'Cơm gà xối mỡ', 'Bánh mì bò kho', 'Bánh mì chả lụa', 'Bánh mì pate', 'Hủ tiếu Nam Vang', 'Hủ tiếu sa tế',
    'Mì Quảng', 'Miến gà', 'Miến lươn', 'Xôi mặn', 'Xôi sườn nướng', 'Bánh canh cua', 'Bánh canh chả cá',
    'Lẩu Thái', 'Lẩu cá kèo', 'Lẩu gà nấm', 'Canh chua cá lóc', 'Canh chua sườn', 'Cháo sườn', 'Cháo gà',
    'Bò bít tết', 'Bò kho mật ong', 'Bò lúc lắc', 'Bò xào lăn', 'Gà nướng mật ong', 'Gà chiên giòn', 'Gà rang muối',
    'Gà om sấu', 'Gà hấp sả', 'Gà xào sả ớt', 'Sườn nướng mắm', 'Sườn chua ngọt', 'Cá lóc kho tộ',
    'Cá nướng muối ớt', 'Cá kho cà chua', 'Cá hấp gừng', 'Cá chiên nước mắm', 'Tôm rang muối', 'Tôm hấp lá chanh',
    'Tôm xào rau muống', 'Cua rang me', 'Cua sốt cà chua', 'Mực chiên nước mắm', 'Mực xào cay', 'Nghêu hấp sả',
    'Ốc hương nướng tiêu', 'Ốc xào sa tế', 'Đậu hũ nhồi thịt', 'Đậu hũ sốt cà chua',
    'Rau muống xào tỏi', 'Rau lang xào tỏi', 'Canh chua cà tím', 'Bún bò nước dừa', 'Hủ tiếu Mỹ Tho',
    'Cơm vịt nếp', 'Mì xào thập cẩm', 'Mì xào rau củ', 'Hủ tiếu gà', 'Bún bò sa tế', 'Canh chua đậu hũ',
    'Cháo trứng', 'Cháo tim gà', 'Pizza margherita', 'Pizza hải sản', 'Mì Ý bằm', 'Mì Ý kem nấm',
  ],
  appetizer: [
    'Gỏi cuốn tôm thịt', 'Gỏi cuốn chay', 'Gỏi cuốn bò', 'Gỏi xoài cá cơm', 'Gỏi gà hành', 'Gỏi bò lá lốt',
    'Gỏi ngó sen tôm', 'Gỏi cá ngừ', 'Nộm chuối đậu xanh', 'Chả giò tôm cua', 'Chả giò chay',
    'Chả giò bề bề', 'Chả giò cá', 'Nem nướng Nha Trang', 'Nem rán chua ngọt', 'Chả lụa chiên',
    'Chả thịt chiên giòn', 'Chả cua viên', 'Há cảo tôm', 'Há cảo thịt', 'Há cảo chay',
    'Chả cá viên chiên', 'Súp bí đỏ', 'Súp kem ngô', 'Súp gà nấm', 'Súp xương hầm', 'Súp hải sản',
    'Bánh bao nhân trứng muối', 'Bánh bao thanh cua', 'Bánh bao nhân thịt', 'Bánh mì nướng pate',
    'Bánh tráng nướng bò khô', 'Bánh tráng mè chả bông', 'Đậu hũ chiên phủ phô mai', 'Đậu hũ chiên giòn',
    'Chả cốm', 'Bánh tôm chiên', 'Tôm bọc trứng chiên giòn',
  ],
  dessert: [
    'Chè đậu xanh', 'Chè ba màu', 'Chè hạt lựu', 'Chè cốm', 'Chè lòng trắng trứng', 'Chè hạt sen long nhãn',
    'Chè hạt sen dừa', 'Chè khoai môn', 'Chè đậu đỏ', 'Chè thái', 'Chè xoài kem dừa',
    'Chè dừa non', 'Chè mè đen', 'Chè khúc bạch', 'Bánh flan', 'Bánh bông lan trà xanh',
    'Bánh bông lan dừa', 'Bánh tiêu', 'Bánh da lợn', 'Bánh dày nhân xoài', 'Bánh dày nhân đậu',
    'Bánh dừa lá dứa', 'Bánh quy bơ', 'Bánh mousse xoài', 'Bánh mousse sầu riêng',
    'Bánh mousse dâu', 'Bánh mousse socola', 'Bánh mousse lá dứa', 'Bánh kem phô mai',
    'Pudding xoài', 'Pudding dừa', 'Pudding sầu riêng', 'Pudding socola', 'Pudding lá dứa',
    'Kem dừa', 'Kem vani', 'Kem socola', 'Kem chuối que', 'Yaourt dâu', 'Yaourt xoài',
    'Yaourt phúc bồn tử', 'Yaourt kiwi', 'Trái cây dầm', 'Chè khoai môn dừa',
  ],
  drink: [
    'Cà phê sữa đá', 'Cà phê đen', 'Cà phê trứng', 'Cà phê muối', 'Cà phê kem trứng', 'Bạc xỉu',
    'Cà phê sữa nóng', 'Espresso', 'Cold brew cam sành', 'Mocha đá', 'Cappuccino', 'Latte matcha',
    'Macchiato', 'Trà chanh', 'Trà đào', 'Trà vải', 'Trà gừng', 'Trà tắc', 'Trà quế', 'Trà atiso',
    'Trà sữa trân châu', 'Trà sữa matcha', 'Trà sữa khoai môn', 'Trà sữa socola', 'Trà sữa hazelnut',
    'Trà sữa thạch đá', 'Sinh tố xoài', 'Sinh tố bơ', 'Sinh tố đu đủ', 'Sinh tố dâu', 'Sinh tố dứa',
    'Sinh tố sầu riêng', 'Sinh tố dưa hấu', 'Sinh tố chanh dây', 'Sinh tố mâm xôi', 'Sinh tố nha đam',
    'Nước cam ép', 'Nước dừa', 'Nước chanh muối', 'Nước ép dứa', 'Nước ép táo', 'Nước ép mãng cầu',
    'Nước ép dưa lưới', 'Nước ép cà rốt cam', 'Nước ép cần tây táo', 'Soda chanh',
    'Soda dâu', 'Soda chanh dây', 'Soda dứa', 'Soda đào', 'Soda việt quốc', 'Soda bạc hà',
    'Soda cherry', 'Soda mâm xôi',
  ],
};

// Variant đọc được tự nhiên khi ghép "base + variant"
const VARIANTS: Record<Bucket, string[]> = {
  main: ['thập cẩm', 'chay', 'size nhỏ', 'sốt riêng', 'kho tiêu', 'nướng mật ong', 'hấp sả', 'om sấu', 'sốt tiêu đen'],
  appetizer: ['đặc biệt', 'chay', 'size lớn', 'kiểu Huế', 'kiểu Sài Gòn', 'sốt tỏi'],
  dessert: ['đặc biệt', 'size lớn', 'kiểu Huế', 'kiểu miền Nam', 'chay', 'thêm kem dừa'],
  drink: ['size L', 'size M', 'đá nhạt', 'ít đường', 'đặc biệt'],
};

const PRICES: Record<Bucket, [number, number]> = {
  main: [45000, 250000], appetizer: [25000, 85000], dessert: [20000, 70000], drink: [12000, 65000],
};
const PREP: Record<Bucket, [number, number]> = {
  main: [12, 45], appetizer: [5, 20], dessert: [8, 30], drink: [3, 10],
};
const UNITS = ['g', 'ml', 'cái', 'muỗng', 'lá', 'chén'];
const TARGET: Record<Bucket, number> = { main: 541, appetizer: 178, dessert: 138, drink: 125 };

type NewDish = { name: string; slug: string; description: string; imageUrl: string; price: number; category: Bucket; chefId: string | null; prepTimeMinutes: number; isAvailable: boolean; isFeatured: boolean };

async function main() {
  console.log('pool:', { main: pool.main.length, appetizer: pool.appetizer.length, dessert: pool.dessert.length, drink: pool.drink.length });

  const [chefs, ingredients, existingSlugs] = await Promise.all([
    prisma.chef.findMany({ select: { id: true } }),
    prisma.ingredient.findMany({ select: { id: true } }),
    prisma.dish.findMany({ select: { slug: true } }).then((r) => new Set(r.map((x) => x.slug))),
  ]);
  const chefIds = chefs.map((c) => c.id);
  const ingredientIds = ingredients.map((i) => i.id);
  console.log('db: chefs', chefIds.length, '| ingredients', ingredientIds.length, '| existing slugs', existingSlugs.size);

  const usedSlugs = new Set(existingSlugs);
  const poolCursor: Record<Bucket, number> = { main: 0, appetizer: 0, dessert: 0, drink: 0 };
  const nextImage = (b: Bucket) => {
    const p = pool[b];
    const url = p[poolCursor[b] % p.length].url;
    poolCursor[b]++;
    return url;
  };

  const dishes: NewDish[] = [];
  const countIn = (b: Bucket) => dishes.filter((d) => d.category === b).length;
  for (const bucket of Object.keys(TARGET) as Bucket[]) {
    let variant = 0;
    while (countIn(bucket) < TARGET[bucket]) {
      for (const base of BASE[bucket]) {
        if (countIn(bucket) >= TARGET[bucket]) break;
        const v = VARIANTS[bucket][variant % VARIANTS[bucket].length];
        const name = v ? `${base} ${v}` : base;
        let slug = slugify(name);
        let guard = 0;
        while (usedSlugs.has(slug) && guard++ < 50) slug = `${slugify(base)}-${ri(1000, 9999)}`;
        if (usedSlugs.has(slug)) continue;
        usedSlugs.add(slug);
        const [pmin, pmax] = PRICES[bucket];
        const [np, nx] = PREP[bucket];
        dishes.push({
          name,
          slug,
          description: `${base}${v ? ` (${v})` : ''} — chế biến trực tiếp tại bếp, nguyên liệu tươi chọn lọc mỗi ngày, trình bày gọn gàng.`,
          imageUrl: nextImage(bucket),
          price: roundP(ri(pmin, pmax) + Math.floor(rnd() * 10) * 500),
          category: bucket,
          chefId: rnd() < 0.85 ? pick(chefIds) : null,
          prepTimeMinutes: ri(np, nx),
          isAvailable: rnd() > 0.05,
          isFeatured: rnd() < 0.10,
        });
      }
      variant++;
    }
  }
  console.log('generated:', dishes.length);

  const created: { id: string; slug: string; name: string; category: string }[] = [];
  const CHUNK = 120;
  for (let i = 0; i < dishes.length; i += CHUNK) {
    const ch = dishes.slice(i, i + CHUNK);
    await prisma.dish.createMany({ data: ch, skipDuplicates: true });
    const back = await prisma.dish.findMany({ where: { slug: { in: ch.map((d) => d.slug) } }, select: { id: true, slug: true, name: true, category: true } });
    created.push(...back);
    console.log('batch', Math.floor(i / CHUNK) + 1, 'inserted — running total', created.length);
  }

  const links: { dishId: string; ingredientId: string; quantity: number; unit: string }[] = [];
  for (const d of created) {
    const n = ri(1, 3);
    const used = new Set<string>();
    for (let j = 0; j < n; j++) {
      const ing = pick(ingredientIds);
      if (used.has(ing)) continue;
      used.add(ing);
      links.push({ dishId: d.id, ingredientId: ing, quantity: ri(10, 300), unit: pick(UNITS) });
    }
  }
  for (let i = 0; i < links.length; i += 400) {
    await prisma.dishIngredient.createMany({ data: links.slice(i, i + 400), skipDuplicates: true });
  }
  console.log('dish_ingredients links:', links.length);

  fs.writeFileSync('scripts/seed1000/created-dishes.json', JSON.stringify({ created, slugList: created.map((c) => c.slug) }, null, 1));
  const byCat: Record<string, number> = {};
  for (const c of created) byCat[c.category] = (byCat[c.category] ?? 0) + 1;
  const total = await prisma.dish.count();
  console.log('SUMMARY created:', JSON.stringify(byCat), '| dishes total now:', total, '| created rows:', created.length);
  await prisma.$disconnect();
}

main();
