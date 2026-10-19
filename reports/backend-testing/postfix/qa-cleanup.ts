import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const DISH_WHERE = {
  OR: [
    { name: { contains: 'QA Test', mode: 'insensitive' as const } },
    { slug: { startsWith: 'qa-test' } },
  ],
};

async function main() {
  const dishes = await prisma.dish.findMany({ where: DISH_WHERE, select: { id: true, name: true, chefId: true } });
  const ingredients = await prisma.ingredient.findMany({
    where: { name: { contains: 'QA Test', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  const chefs = await prisma.chef.findMany({
    where: { name: { contains: 'QA Test', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  const profiles = await prisma.profile.findMany({
    where: { email: { startsWith: 'qa.test' } },
    select: { id: true, email: true },
  });

  const dishIds = dishes.map((d) => d.id);
  const qaChefIds = new Set(chefs.map((c) => c.id));
  const dangling = dishes.filter((d) => d.chefId && qaChefIds.has(d.chefId));
  if (dangling.length) throw new Error(`QA dish still references QA chef — unexpected: ${dangling.map((d) => d.id)}`);

  console.log(`plan: ${dishes.length} dishes, ${ingredients.length} ingredients, ${chefs.length} chefs, ${profiles.length} profiles`);

  const links = await prisma.dishIngredient.deleteMany({ where: { dishId: { in: dishIds } } });
  console.log(`dishIngredient deleted: ${links.count}`);

  const delDish = await prisma.dish.deleteMany({ where: { id: { in: dishIds } } });
  console.log(`dish deleted: ${delDish.count}`);

  const delIng = await prisma.ingredient.deleteMany({ where: { id: { in: ingredients.map((i) => i.id) } } });
  console.log(`ingredient deleted: ${delIng.count}`);

  const delChef = await prisma.chef.deleteMany({ where: { id: { in: chefs.map((c) => c.id) } } });
  console.log(`chef deleted: ${delChef.count}`);

  const delProfile = await prisma.profile.deleteMany({ where: { id: { in: profiles.map((p) => p.id) } } });
  console.log(`profile deleted: ${delProfile.count}`);

  if (profiles.length > 0) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY missing — cannot delete auth users');
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const p of profiles) {
      const { error } = await supabase.auth.admin.deleteUser(p.id);
      console.log(`supabase auth deleteUser ${p.email}: ${error ? 'ERROR ' + error.message : 'OK'}`);
    }
  }

  const [rd, ri, rc, rp] = await Promise.all([
    prisma.dish.count({ where: DISH_WHERE }),
    prisma.ingredient.count({ where: { name: { contains: 'QA Test', mode: 'insensitive' } } }),
    prisma.chef.count({ where: { name: { contains: 'QA Test', mode: 'insensitive' } } }),
    prisma.profile.count({ where: { email: { startsWith: 'qa.test' } } }),
  ]);
  console.log(`VERIFY after cleanup — dish:${rd} ingredient:${ri} chef:${rc} profile:${rp} (must all be 0)`);
}
main().finally(() => prisma.$disconnect());
