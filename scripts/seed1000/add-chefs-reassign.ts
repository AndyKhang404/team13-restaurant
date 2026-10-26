import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

// Deterministic RNG
let seed = 20260301;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;

const NEW_CHEFS: { name: string; specialty: string; bio: string }[] = [
  { name: 'Ngô Đình Bảo', specialty: 'Món Việt', bio: '20 năm kinh nghiệm, chuyên các món kho và hầm của Nam Bộ.' },
  { name: 'Phan Thanh Lâm', specialty: 'Hải sản', bio: 'Chuyên hải sản tươi sống và các món rau củ nướng.' },
  { name: 'Đặng Ngọc Ánh', specialty: 'Món Việt', bio: 'Ga失效 bếp của các quán ăn vùng miền nổi tiếng.' },
  { name: 'Vũ Hà Vy', specialty: 'Bánh ngọt', bio: 'Chuyên bánh mousse, pudding và panna cotta.' },
  { name: 'Tạ Đình Khoa', specialty: 'Món Nhật', bio: 'Chuyên sashimi và ramen, gừng vang tại Tokyo.' },
  { name: 'Hồ Thu Hằng', specialty: 'Món chay', bio: 'Chuyên nấu ăn chay thực dưỡng và phở chay.' },
  { name: 'Đoàn Quang Huy', specialty: 'Lẩu', bio: 'Bếp lẩu nước dùng nấu 12 tiếng.' },
  { name: 'Lâm Chính Thắng', specialty: 'Món Việt', bio: 'Chuyên cơm tấm và bún thịt nướng Sài Gòn.' },
  { name: 'Nguyễn Đình Phát', specialty: 'Hải sản', bio: 'Chuyên ngành ngao nghêu và ốc biển.' },
  { name: 'Đỗ Phương Trinh', specialty: 'Bánh ngọt', bio: 'Chuyên cheesecake và bánh kem version nhỏ.' },
  { name: 'Chu Việt An', specialty: 'Món Á', bio: 'Chuyên há cảo và bánh bao chuẩn Hong Kong.' },
  { name: 'Trịnh Bảo Ngọc', specialty: 'Món Việt', bio: 'Chuyên canh chua miền Nam và gỏi cuốn tôm thịt.' },
  { name: 'Lê Trung Kiên', specialty: 'Món Âu', bio: 'Trưởng bộ phận món Âu, xoài pan và sconvoltre.' },
];

const AVATARS = [
  'https://randomuser.me/api/portraits/men/32.jpg', 'https://randomuser.me/api/portraits/women/44.jpg',
  'https://randomuser.me/api/portraits/men/46.jpg', 'https://randomuser.me/api/portraits/women/68.jpg',
  'https://randomuser.me/api/portraits/men/71.jpg', 'https://randomuser.me/api/portraits/women/12.jpg',
  'https://randomuser.me/api/portraits/men/22.jpg', 'https://randomuser.me/api/portraits/women/79.jpg',
  'https://randomuser.me/api/portraits/men/85.jpg', 'https://randomuser.me/api/portraits/women/33.jpg',
  'https://randomuser.me/api/portraits/men/57.jpg', 'https://randomuser.me/api/portraits/women/21.jpg',
  'https://randomuser.me/api/portraits/men/14.jpg',
];

async function main() {
  const existing = await prisma.chef.findMany({ select: { id: true, name: true } });
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const toAdd = NEW_CHEFS.filter((c) => !existingNames.has(c.name.toLowerCase()));
  console.log('existing chefs:', existing.length, '| to add:', toAdd.length);

  async function probe(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(12000) });
      return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
    } catch { return false; }
  }
  const avatars = await Promise.all(AVATARS.map((u) => probe(u).then((ok) => (ok ? u : null))));
  const usableAvatars = avatars.filter((x): x is string => x !== null);
  console.log('usable avatars:', usableAvatars.length);

  const data = toAdd.map((c, i) => ({
    name: c.name,
    avatarUrl: usableAvatars.length ? usableAvatars[i % usableAvatars.length] : null,
    specialty: c.specialty,
    bio: c.bio,
    experienceYears: ri(4, 20),
    phone: `09${String(ri(1, 99)).padStart(2, '0')}${String(ri(0, 9999999)).padStart(7, '0')}`,
    isActive: true,
  }));

  const created: { id: string; name: string; avatarUrl: string | null }[] = [];
  for (let i = 0; i < data.length; i += 5) {
    await prisma.chef.createMany({ data: data.slice(i, i + 5), skipDuplicates: true });
    const names = data.slice(i, i + 5).map((d) => d.name);
    const back = await prisma.chef.findMany({ where: { name: { in: names } }, select: { id: true, name: true, avatarUrl: true } });
    created.push(...back);
  }
  console.log('created chefs:', created.length);

  // Chia lại random MỌI món đang hoạt động cho các đầu bếp còn hoạt động
  // (round-robin trên thứ tự random — phân bổ gần đều, dùng SQL để tránh N lệnh update)
  const CH_SQL = `with r as (
      select d.id as dish_id, row_number() over (order by random()) - 1 as rn from dishes d where deleted_at is null
    ), cr as (
      select c.id, row_number() over (order by random()) - 1 as rn,
             (select count(*) from chefs where deleted_at is null) as n
      from chefs c where c.deleted_at is null
    )
    update dishes d set chef_id = cr.id
    from r join cr on (r.rn % cr.n) = cr.rn
    where d.id = r.dish_id`;
  await prisma.$executeRawUnsafe(CH_SQL);
  const dishes = await prisma.dish.findMany({ where: { deletedAt: null }, select: { id: true } });

  const perChef = await prisma.chef.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, _count: { select: { dishes: true } } },
    orderBy: { name: 'asc' },
  });
  console.log('reassigned dishes:', dishes.length, 'across', perChef.length, 'active chefs');
  console.log('per-chef dish counts:', JSON.stringify(perChef.map((p) => ({ chef: p.name, dishes: p._count.dishes })), null, 0));

  fs.writeFileSync(path.resolve('scripts/seed1000/created-chefs.json'), JSON.stringify({ created }, null, 1));
  await prisma.$disconnect();
}

main();
