import 'dotenv/config';
import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { Role, DishCategory } from '../src/generated/prisma/enums.js';

const SeedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1, 'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required'),
  STORAGE_BUCKET: z.string().min(1, 'STORAGE_BUCKET is required'),
  SEED_ADMIN_EMAIL: z.email('SEED_ADMIN_EMAIL must be a valid email').trim(),
  SEED_ADMIN_PASSWORD: z
    .string()
    .trim()
    .min(6, 'SEED_ADMIN_PASSWORD must be at least 6 characters (Supabase Auth requirement)'),
});

function loadSeedEnv() {
  const parsed = SeedEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY:
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Missing or invalid environment variables for seed script:\n${issues}`);
  }

  return parsed.data;
}

const env = loadSeedEnv();

const databaseUrl = env.DATABASE_URL;
const supabaseUrl = env.SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
const bucketName = env.STORAGE_BUCKET;
const seedAdminEmail = env.SEED_ADMIN_EMAIL;
const seedAdminPassword = env.SEED_ADMIN_PASSWORD;

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
const supabaseAdmin = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Ensure storage bucket exists and is public
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === bucketName);
    if (!exists) {
      const { error: bucketErr } = await supabaseAdmin.storage.createBucket(bucketName, {
        public: true,
      });
      if (bucketErr) {
        console.warn(`⚠️ Could not create bucket "${bucketName}":`, bucketErr.message);
      } else {
        console.log(`✅ Created storage bucket "${bucketName}" (public)`);
      }
    } else {
      console.log(`ℹ️ Storage bucket "${bucketName}" already exists`);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('⚠️ Storage bucket check skipped:', message);
  }

  // 2. Create or find initial Admin in Supabase Auth
  let adminUserId: string;
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingAdmin = existingUsers?.users?.find((u) => u.email === seedAdminEmail);

  if (existingAdmin) {
    adminUserId = existingAdmin.id;
    console.log(`ℹ️ Admin user already exists in Supabase Auth (${adminUserId})`);
  } else {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: seedAdminEmail,
      password: seedAdminPassword,
      email_confirm: true,
      user_metadata: { display_name: 'Master Admin' },
    });
    if (error || !created.user) {
      throw new Error(`Failed to create admin in Supabase Auth: ${error?.message}`);
    }
    adminUserId = created.user.id;
    console.log(`✅ Created admin user in Supabase Auth (${adminUserId})`);
  }

  // 3. Upsert Admin Profile with ADMIN role
  await prisma.profile.upsert({
    where: { id: adminUserId },
    create: {
      id: adminUserId,
      email: seedAdminEmail,
      displayName: 'Master Admin',
      role: Role.ADMIN,
    },
    update: {
      role: Role.ADMIN,
    },
  });
  console.log(`✅ Upserted Admin profile with role ADMIN`);

  // 4. Seed Chefs
  const chefRamsay = await prisma.chef.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Gordon Ramsay',
      specialty: 'Món Âu & Steak',
      bio: 'Michelin-starred chef celebrated for culinary excellence and rigorous precision.',
      experienceYears: 25,
      phone: '+84 901 111 222',
      isActive: true,
      avatarUrl:
        'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80',
    },
    update: {},
  });

  const chefChristine = await prisma.chef.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Christine Hà',
      specialty: 'Món Việt Truyền Thống',
      bio: 'MasterChef winner celebrated for bringing soulful, modern Vietnamese dining to the world.',
      experienceYears: 12,
      phone: '+84 903 333 444',
      isActive: true,
      avatarUrl:
        'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=400&q=80',
    },
    update: {},
  });
  console.log(`✅ Seeded Chefs (${chefRamsay.name}, ${chefChristine.name})`);

  // 5. Seed Ingredients
  const ingredientsData = [
    { name: 'Thịt bò Úc', unit: 'g', stockQuantity: 15000, pricePerUnit: 450 },
    { name: 'Bánh phở tươi', unit: 'g', stockQuantity: 20000, pricePerUnit: 50 },
    { name: 'Nước dùng hầm xương', unit: 'ml', stockQuantity: 50000, pricePerUnit: 30 },
    { name: 'Cá hồi tươi Na Uy', unit: 'g', stockQuantity: 8000, pricePerUnit: 600 },
    { name: 'Hành hoa & Ngò gai', unit: 'g', stockQuantity: 3000, pricePerUnit: 40 },
    { name: 'Trà hoa cúc mật ong', unit: 'ml', stockQuantity: 10000, pricePerUnit: 80 },
    { name: 'Matcha kem tươi', unit: 'g', stockQuantity: 5000, pricePerUnit: 200 },
  ];

  const ingredientMap = new Map<string, string>();
  for (const ing of ingredientsData) {
    const item = await prisma.ingredient.upsert({
      where: { name: ing.name },
      create: {
        name: ing.name,
        unit: ing.unit,
        stockQuantity: ing.stockQuantity,
        pricePerUnit: ing.pricePerUnit,
        isAvailable: true,
      },
      update: {},
    });
    ingredientMap.set(ing.name, item.id);
  }
  console.log(`✅ Seeded ${ingredientsData.length} ingredients`);

  // 6. Seed Dishes
  const dishesData = [
    {
      name: 'Phở Bò Tái Lăn Thượng Hạng',
      slug: 'pho-bo-tai-lan-thuong-hang',
      description:
        'Phở bò tái lăn chuẩn vị truyền thống Hà Nội với nước dùng ngọt thanh hầm xương 24h, thịt bò mềm xào áp chảo thơm lừng cùng bánh phở tươi.',
      price: 85000,
      category: DishCategory.main,
      isAvailable: true,
      isFeatured: true,
      prepTimeMinutes: 15,
      chefId: chefChristine.id,
      imageUrl:
        'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=800&q=80',
      ingredients: [
        { name: 'Thịt bò Úc', quantity: 180, unit: 'g' },
        { name: 'Bánh phở tươi', quantity: 200, unit: 'g' },
        { name: 'Nước dùng hầm xương', quantity: 450, unit: 'ml' },
        { name: 'Hành hoa & Ngò gai', quantity: 30, unit: 'g' },
      ],
    },
    {
      name: 'Cá Hồi Na Uy Áp Chảo Sốt Bơ Tỏi',
      slug: 'ca-hoi-na-uy-ap-chao',
      description:
        'Phi lê cá hồi tươi nướng áp chảo da giòn, giữ trọn độ béo tự nhiên, hòa quyện sốt bơ tỏi thảo mộc thơm ngậy.',
      price: 220000,
      category: DishCategory.main,
      isAvailable: true,
      isFeatured: true,
      prepTimeMinutes: 20,
      chefId: chefRamsay.id,
      imageUrl:
        'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80',
      ingredients: [{ name: 'Cá hồi tươi Na Uy', quantity: 220, unit: 'g' }],
    },
    {
      name: 'Gỏi Cuốn Tôm Thịt Thanh Vị',
      slug: 'goi-cuon-tom-thit',
      description:
        'Món khai vị nhẹ nhàng thanh mát cuốn cùng rau sống tươi hái trong ngày, ăn kèm sốt tương đen đậu phộng béo bùi.',
      price: 45000,
      category: DishCategory.appetizer,
      isAvailable: true,
      isFeatured: true,
      prepTimeMinutes: 10,
      chefId: chefChristine.id,
      imageUrl:
        'https://images.unsplash.com/photo-1548946526-f69e2424cf45?auto=format&fit=crop&w=800&q=80',
      ingredients: [{ name: 'Hành hoa & Ngò gai', quantity: 50, unit: 'g' }],
    },
    {
      name: 'Panna Cotta Trà Xanh Kem Tươi',
      slug: 'panna-cotta-tra-xanh',
      description:
        'Tráng miệng mềm mịn ngọt ngào kết hợp vị đăng đắng nhẹ của bột trà xanh Uji cao cấp và mứt quả mọng chua ngọt.',
      price: 55000,
      category: DishCategory.dessert,
      isAvailable: true,
      isFeatured: false,
      prepTimeMinutes: 5,
      chefId: chefRamsay.id,
      imageUrl:
        'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
      ingredients: [{ name: 'Matcha kem tươi', quantity: 120, unit: 'g' }],
    },
    {
      name: 'Trà Cúc Mật Ong Hoa Quả',
      slug: 'tra-cuc-mat-ong',
      description:
        'Thức uống giải nhiệt ngọt dịu từ hoa cúc sấy tự nhiên và mật ong rừng nguyên chất, thơm mát thư giãn.',
      price: 40000,
      category: DishCategory.drink,
      isAvailable: true,
      isFeatured: false,
      prepTimeMinutes: 5,
      chefId: null,
      imageUrl:
        'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=800&q=80',
      ingredients: [{ name: 'Trà hoa cúc mật ong', quantity: 350, unit: 'ml' }],
    },
  ];

  for (const d of dishesData) {
    const dish = await prisma.dish.upsert({
      where: { slug: d.slug },
      create: {
        name: d.name,
        slug: d.slug,
        description: d.description,
        price: d.price,
        category: d.category,
        isAvailable: d.isAvailable,
        isFeatured: d.isFeatured,
        prepTimeMinutes: d.prepTimeMinutes,
        chefId: d.chefId,
        imageUrl: d.imageUrl,
      },
      update: {
        price: d.price,
        category: d.category,
        imageUrl: d.imageUrl,
      },
    });

    // Recreate ingredients mapping
    await prisma.dishIngredient.deleteMany({ where: { dishId: dish.id } });
    for (const item of d.ingredients) {
      const ingId = ingredientMap.get(item.name);
      if (ingId) {
        await prisma.dishIngredient.create({
          data: {
            dishId: dish.id,
            ingredientId: ingId,
            quantity: item.quantity,
            unit: item.unit,
          },
        });
      }
    }
  }
  console.log(`✅ Seeded ${dishesData.length} dishes with ingredients`);
  console.log('🎉 Database seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
