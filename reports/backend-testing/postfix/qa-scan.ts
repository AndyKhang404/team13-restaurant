import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const dishes = await prisma.dish.findMany({
    where: { OR: [{ name: { contains: 'QA Test', mode: 'insensitive' } }, { slug: { startsWith: 'qa-test' } }] },
    select: { id: true, name: true, slug: true, deletedAt: true, createdAt: true },
  });
  const ingredients = await prisma.ingredient.findMany({
    where: { name: { contains: 'QA Test', mode: 'insensitive' } },
    select: { id: true, name: true, deletedAt: true },
  });
  const chefs = await prisma.chef.findMany({
    where: { name: { contains: 'QA Test', mode: 'insensitive' } },
    select: { id: true, name: true, deletedAt: true },
  });
  const di = await prisma.dishIngredient.findMany({
    where: { dish: { OR: [{ name: { contains: 'QA Test', mode: 'insensitive' } }, { slug: { startsWith: 'qa-test' } }] } },
    select: { dishId: true, ingredientId: true },
  });
  const profiles = await prisma.profile.findMany({
    where: { OR: [{ email: { startsWith: 'qa.test' } }, { displayName: { contains: 'QA Test', mode: 'insensitive' } }] },
    select: { id: true, email: true, displayName: true, role: true },
  });
  const fmt = (r: { id: string; name?: string | null; deletedAt?: Date | null } & Record<string, unknown>) =>
    `  ${r.id}  ${(r as { name?: string }).name ?? (r as { email?: string }).email ?? ''}  deletedAt=${r.deletedAt ? String(r.deletedAt) : 'ACTIVE'}`;
  console.log(`DISHES (${dishes.length}):`); dishes.forEach((r) => console.log(fmt(r)));
  console.log(`INGREDIENTS (${ingredients.length}):`); ingredients.forEach((r) => console.log(fmt(r)));
  console.log(`CHEFS (${chefs.length}):`); chefs.forEach((r) => console.log(fmt(r)));
  console.log(`DISH_INGREDIENT links: ${di.length}`);
  console.log(`PROFILES (${profiles.length}):`); profiles.forEach((r) => console.log(`  ${r.id}  ${r.email}  role=${r.role}  displayName=${r.displayName}`));
}
main().finally(() => prisma.$disconnect());
